/**
 * AudioEngine — user-audio upload + BPM / FFT analysis
 *
 * Supports:
 * - Uploaded audio files via HTMLMediaElement + MediaElementSourceNode
 * - Silent beat transport when no song is loaded (no demo audio)
 * - Realtime RMS / bass / high energy + 8-band FFT extraction
 * - Lightweight onset-based BPM estimation from bass energy
 */

import type {
  AudioEngineState,
  IAudioEngine,
  LiveScheduleFrame,
  TimeSamplerConfig,
  TransportSample,
} from "$lib/engine/contracts";
import { fetchEssentiaRhythmAnalysis } from "$lib/audio/essentia";
import { TransportClock } from "$lib/transport";
import {
  liveScheduleRuntime,
  type LiveTimeSamplerInput,
  type PgmScheduleInput,
} from "$lib/timesampler/integration";
import {
  applySoundTouchParams,
  createSoundTouchNode,
  type SoundTouchHandle,
} from "$lib/audio/soundtouch";

const DEFAULT_BPM = 128;

const ACCENT_MODE_INDEX = {
  LUM: 0,
  RGB: 1,
  OFF: 2,
} as const;

export class AudioEngine implements IAudioEngine {
  private ctx: AudioContext | null = null;
  private analyserFull: AnalyserNode | null = null;
  private analyserBass: AnalyserNode | null = null;
  private analyserHigh: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private soundTouchNode: SoundTouchHandle | null = null;
  private soundTouchReady = false;

  private sourceNode: AudioBufferSourceNode | null = null;
  private mediaElement: HTMLAudioElement | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private objectUrl: string | null = null;

  private _bpm = DEFAULT_BPM;
  /** Essentia-detected source tempo — beat grid stays anchored here. */
  private _analysisBpm = DEFAULT_BPM;
  private _beat = 0;
  private _beatPhase = 0;
  private _amplitude = 0;
  private _bassAmp = 0;
  private _highAmp = 0;
  private _fftBands = new Array(8).fill(0);
  private _playing = false;
  private _starting = false;
  private _trackName = "";
  /** Set when a user upload is loaded. */
  private _loadedUploadName: string | null = null;
  private _usingUploadedTrack = false;
  private _bpmLocked = false;
  private _analysisStatus: AudioEngineState["analysisStatus"] = "idle";
  private _analysisConfidence: number | null = null;
  private _analysisError: string | null = null;
  private tapTimes: number[] = [];
  private _volume = 0.72;
  private _tempo = 1;
  /** Detected root key (0 = C). Parsed from analysis when available. */
  private _analysisKeyIndex = 0;
  /** User semitone shift from detected key (KEY ±). */
  private _keyShift = 0;
  /** Independent pitch offset in semitones (PITCH ±). */
  private _pitchSemitones = 0;

  static readonly MUSICAL_KEYS = [
    'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
  ] as const;

  private beatGrid: number[] = [];
  private onsetHistory: number[] = [];
  private prevEnergy = 0;
  private bassEma = 0.08;
  private onsetCooldown = 0;
  private pgmSelectionListeners = new Set<(source: string) => void>();

  private rafId = 0;
  private silentTransportStart = 0;
  private analysisRequestId = 0;
  private transportClock = new TransportClock({ bpm: DEFAULT_BPM });

  async start() {
    if (this._starting) return;
    if (this._playing) {
      if (this.getTransportTime() >= 0.05) return;
      this.stop();
    }
    this._starting = true;
    try {
      await this.ensureContext();
      if (!this.ctx) return;

      if (this.ctx.state === "suspended") {
        try {
          await this.ctx.resume();
        } catch {
          // Autoplay policy may block resume until a user gesture.
        }
      }

      let useUploadedPlayback = this._usingUploadedTrack && Boolean(this.mediaElement);

      if (useUploadedPlayback && this.mediaElement) {
        this.mediaElement.currentTime = 0;
        try {
          await Promise.race([
            this.mediaElement.play(),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error("media play timeout")), 4_000)
            ),
          ]);
          const t0 = this.mediaElement.currentTime;
          await new Promise((r) => setTimeout(r, 800));
          if (
            this.mediaElement.paused ||
            this.mediaElement.currentTime - t0 < 0.01
          ) {
            throw new Error("media playback stalled");
          }
        } catch {
          useUploadedPlayback = false;
          this.mediaElement.pause();
        }
      }

      if (useUploadedPlayback && this.mediaElement) {
        this._playing = true;
        this.transportClock.setPlaying(true, 0);
        this.onsetHistory = [];
        this.prevEnergy = 0;
        this.bassEma = 0.08;
        this.onsetCooldown = 0;
        this.startTicking();

        await new Promise((r) => setTimeout(r, 600));
        if (this.getTransportTime() >= 0.05) return;

        this._playing = false;
        this.transportClock.setPlaying(false, 0);
        this.mediaElement.pause();
        useUploadedPlayback = false;
      }

      if (this.ctx.state === "suspended") {
        try {
          await this.ctx.resume();
        } catch {
          /* gesture may still be required */
        }
      }

      if (this.sourceNode) {
        try {
          this.sourceNode.stop();
        } catch {
          /* already stopped */
        }
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }

      this.silentTransportStart = this.ctx.currentTime;
      this._usingUploadedTrack = false;
      this._trackName = this._loadedUploadName ?? "";
      this._playing = true;
      this.transportClock.setPlaying(true, 0);
      this.onsetHistory = [];
      this.prevEnergy = 0;
      this.bassEma = 0.08;
      this.onsetCooldown = 0;
      this.startTicking();
    } finally {
      this._starting = false;
    }
  }

  stop() {
    const stoppedAt = this.getTransportTime();
    this._playing = false;
    this.transportClock.setPlaying(false, stoppedAt);
    this.advanceLiveSchedule(this.sampleTransport(), 0);

    if (this.mediaElement) {
      this.mediaElement.pause();
      this.mediaElement.currentTime = 0;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch {
        // no-op
      }
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    this._beat = 0;
    this._beatPhase = 0;
    this._amplitude = 0;
    this._bassAmp = 0;
    this._highAmp = 0;
    this._fftBands = new Array(8).fill(0);
    if (stoppedAt !== 0) {
      this.transportClock.seek(0);
    }
  }

  async loadAudioFile(file: File) {
    await this.ensureContext();
    if (!this.ctx || !this.gainNode) return;

    this.stop();
    this.disposeMediaElement();

    this.objectUrl = URL.createObjectURL(file);
    this.attachMediaElement(this.objectUrl, file.name);
    this.prepareUploadedTrack(file.name);

    const requestId = ++this.analysisRequestId;

    try {
      const analysis = await fetchEssentiaRhythmAnalysis(file);
      if (requestId !== this.analysisRequestId) return;
      this.applyRhythmAnalysis(analysis);
    } catch (error) {
      if (requestId !== this.analysisRequestId) return;
      this.applyRealtimeFallback(error);
    }
  }

  async loadAudioUrl(url: string, trackName: string) {
    await this.ensureContext();
    if (!this.ctx || !this.gainNode) return;

    this.stop();
    this.disposeMediaElement();

    const requestId = ++this.analysisRequestId;

    let file: File | null = null;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio source (${response.status})`);
      }
      const blob = await response.blob();
      file = new File([blob], trackName, { type: blob.type || "audio/wav" });
      this.objectUrl = URL.createObjectURL(blob);
      this.attachMediaElement(this.objectUrl, trackName);
    } catch {
      this.attachMediaElement(url, trackName);
    }
    this.prepareUploadedTrack(trackName);

    try {
      if (!file) throw new Error("Audio source unavailable for analysis");
      const analysis = await fetchEssentiaRhythmAnalysis(file);
      if (requestId !== this.analysisRequestId) return;
      this.applyRhythmAnalysis(analysis);
    } catch (error) {
      if (requestId !== this.analysisRequestId) return;
      this.applyRealtimeFallback(error);
    }
  }

  clearUploadedTrack() {
    this.stop();
    this.disposeMediaElement();

    this.analysisRequestId += 1;
    this._usingUploadedTrack = false;
    this._trackName = "";
    this._loadedUploadName = null;
    this._bpm = DEFAULT_BPM;
    this._analysisBpm = DEFAULT_BPM;
    this._tempo = 1;
    this.beatGrid = [];
    this.transportClock.setBeatGrid([], this._bpm, 0);
    this.transportClock.sourceChanged(0);
    this._analysisStatus = "idle";
    this._analysisConfidence = null;
    this._analysisError = null;
  }

  tapTempo() {
    const now = performance.now();
    this.tapTimes = this.tapTimes.filter((t) => now - t < 3000);
    this.tapTimes.push(now);
    if (this.tapTimes.length >= 2) {
      const diffs: number[] = [];
      for (let i = 1; i < this.tapTimes.length; i++) {
        diffs.push(this.tapTimes[i]! - this.tapTimes[i - 1]!);
      }
      const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const bpm = Math.round(60000 / avg);
      this.setBPM(bpm);
    }
  }

  private attachMediaElement(src: string, trackName: string) {
    if (!this.ctx || !this.gainNode) return;

    const audio = new Audio();
    audio.src = src;
    audio.loop = true;
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audio.preservesPitch = false;
    audio.setAttribute("playsinline", "true");
    audio.load();

    const source = this.ctx.createMediaElementSource(audio);
    this.connectSourceToOutput(source);

    this.mediaElement = audio;
    this.mediaSource = source;
    this._trackName = trackName;
    this.syncSoundTouch();
  }

  private connectSourceToOutput(source: AudioNode) {
    if (!this.gainNode) return;
    if (this.soundTouchNode) {
      source.connect(this.soundTouchNode);
    } else {
      source.connect(this.gainNode);
    }
  }

  private syncSoundTouch() {
    applySoundTouchParams(this.soundTouchNode, {
      tempo: this._tempo,
      pitch: Math.pow(2, this._pitchSemitones / 12),
      keySemitones: this._keyShift,
      mediaElement: this.mediaElement,
    });
    if (this.sourceNode && 'playbackRate' in this.sourceNode) {
      (this.sourceNode as AudioBufferSourceNode).playbackRate.value = this._tempo;
    }
  }

  private prepareUploadedTrack(trackName: string) {
    this._usingUploadedTrack = true;
    this._trackName = trackName;
    this._loadedUploadName = trackName;
    this._bpmLocked = false;
    this._bpm = DEFAULT_BPM;
    this._analysisBpm = DEFAULT_BPM;
    this._tempo = 1;
    this._analysisKeyIndex = 0;
    this._keyShift = 0;
    this._pitchSemitones = 0;
    this.beatGrid = [];
    this.transportClock.setBeatGrid([], this._bpm, 0);
    this.transportClock.sourceChanged(0);
    this.onsetHistory = [];
    this.prevEnergy = 0;
    this.bassEma = 0.08;
    this.onsetCooldown = 0;
    this._analysisStatus = "analyzing";
    this._analysisConfidence = null;
    this._analysisError = null;
  }

  private disposeMediaElement() {
    if (this.mediaSource) {
      this.mediaSource.disconnect();
      this.mediaSource = null;
    }

    if (this.mediaElement) {
      this.mediaElement.pause();
      this.mediaElement.src = "";
      this.mediaElement.load();
      this.mediaElement = null;
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.gainNode) this.gainNode.gain.value = this._volume;
  }

  setTempo(rate: number) {
    this._bpmLocked = false;
    this.applyTempoRate(Math.max(0.5, Math.min(2, rate)));
  }

  setPitch(semitones: number) {
    this._pitchSemitones = Math.max(-12, Math.min(12, Math.round(semitones)));
    this.syncSoundTouch();
  }

  cycleKey() {
    this.nudgeKey(1);
  }

  nudgeKey(delta: number) {
    this._keyShift = Math.max(-12, Math.min(12, this._keyShift + delta));
    this.syncSoundTouch();
  }

  private displayKeyIndex() {
    const len = AudioEngine.MUSICAL_KEYS.length;
    return (((this._analysisKeyIndex + this._keyShift) % len) + len) % len;
  }

  isSoundTouchActive() {
    return this.soundTouchReady;
  }

  getSoundTouchState() {
    const keyIndex = this.displayKeyIndex();
    return {
      volume: this._volume,
      tempo: this._tempo,
      pitchSemitones: this._pitchSemitones,
      keySemitones: this._keyShift,
      key: AudioEngine.MUSICAL_KEYS[keyIndex] ?? 'C',
      keyIndex,
      analysisKeyIndex: this._analysisKeyIndex,
      active: this.soundTouchReady,
    };
  }

  setBPM(bpm: number) {
    const target = Math.max(60, Math.min(200, bpm));
    const ratio = target / this._analysisBpm;
    this._bpmLocked = true;
    this.applyTempoRate(Math.max(0.5, Math.min(2, ratio)));
    this._bpm = Math.round(this._analysisBpm * this._tempo);
  }

  unlockBPM() {
    this._bpmLocked = false;
    this.applyTempoRate(1);
    this._bpm = Math.round(this._analysisBpm);
  }

  /** Playback rate — shifts markers via source-time advance; does not re-analyze. */
  private applyTempoRate(rate: number) {
    this._tempo = rate;
    this.syncSoundTouch();
    this.transportClock.queueImmediateParameter(
      "rate",
      this._tempo,
      this.getTransportTime(),
    );
    if (!this._bpmLocked) {
      this._bpm = Math.round(this._analysisBpm * this._tempo);
    }
  }

  getState(): AudioEngineState {
    const transport = this.sampleTransport();
    return {
      bpm: this._bpm,
      bpmLocked: this._bpmLocked,
      beat: this._beat,
      beatPhase: this._beatPhase,
      amplitude: this._amplitude,
      bassAmp: this._bassAmp,
      highAmp: this._highAmp,
      fftBands: this._fftBands,
      playing: this._playing,
      time: transport.transportSeconds,
      duration: this.mediaElement?.duration || 0,
      trackName: this._trackName,
      usingUploadedTrack: this._usingUploadedTrack,
      analysisStatus: this._analysisStatus,
      analysisConfidence: this._analysisConfidence,
      analysisError: this._analysisError,
    };
  }

  getTransportSample(
    presentationTimeSeconds = performance.now() / 1_000,
  ): TransportSample {
    const sample = this.sampleTransport(presentationTimeSeconds);
    return {
      transportSeconds: sample.transportSeconds,
      audioOutputTimeSeconds: sample.audioOutputTimeSeconds,
      performanceTimeSeconds: sample.performanceTimeSeconds,
      presentationTimeSeconds: sample.presentationTimeSeconds,
      playing: sample.playing,
      discontinuityGeneration: sample.discontinuityGeneration,
      bpm: this._bpm,
      beatPosition: sample.beatPosition,
      beatPhase: sample.beatPhase,
    };
  }

  drainTransportEvents() {
    return this.transportClock.drainEvents();
  }

  configureTimeSampler(config: TimeSamplerConfig) {
    const input: LiveTimeSamplerInput = {
      controls: config.controls,
      sourceDurationSeconds: config.sourceDurationSeconds,
      sourceKey: config.sourceKey,
      midiNotes: config.midiNotes,
      midiDurationSeconds: config.midiDurationSeconds,
      onsetSensitivity: config.onsetSensitivity,
      bypassed: config.bypassed,
    };
    liveScheduleRuntime.configureTimeSampler(input);
  }

  configurePgmSchedule(input: PgmScheduleInput<string>) {
    liveScheduleRuntime.configurePgm(input);
  }

  getLiveScheduleFrame(): LiveScheduleFrame | null {
    const frame = liveScheduleRuntime.getFrame();
    if (!frame) return null;

    return {
      timeSampler: {
        sourceTimestampSeconds: frame.timeSampler.sourceTimestampSeconds,
        targetPlaybackRate: frame.timeSampler.targetPlaybackRate,
        jumpGeneration: frame.timeSampler.jumpGeneration,
        activeSlice: frame.timeSampler.activeSlice,
      },
      accent: frame.accent
        ? {
            mode: ACCENT_MODE_INDEX[frame.accent.mode],
            presentationTimeSeconds: frame.accent.presentationTimeSeconds,
          }
        : null,
    };
  }

  subscribePgmSelection(listener: (source: string) => void) {
    this.pgmSelectionListeners.add(listener);
    return () => {
      this.pgmSelectionListeners.delete(listener);
    };
  }

  private sampleTransport(presentationTimeSeconds = performance.now() / 1_000) {
    const outputTimestamp = this.ctx?.getOutputTimestamp?.();
    const audioOutputTimeSeconds =
      outputTimestamp?.contextTime ?? this.ctx?.currentTime ?? 0;
    const performanceTimeSeconds =
      outputTimestamp?.performanceTime !== undefined
        ? outputTimestamp.performanceTime / 1_000
        : presentationTimeSeconds;

    return this.transportClock.sample({
      transportSeconds: this.getTransportTime(),
      audioOutputTimeSeconds,
      performanceTimeSeconds,
      presentationTimeSeconds,
      playing: this._playing,
      bypassHostedGrid: false,
    });
  }

  private advanceLiveSchedule(
    transport: ReturnType<TransportClock["sample"]>,
    onsetStrength: number,
  ) {
    for (const event of liveScheduleRuntime.generatedTriggerEvents(
      transport,
      onsetStrength,
    )) {
      this.transportClock.queueEvent({
        ...event,
        transportSeconds: event.transportSeconds ?? transport.transportSeconds,
      });
    }

    const frame = liveScheduleRuntime.advance(
      transport,
      this.transportClock.drainEvents(),
    );
    if (frame.pgm.selected !== null) {
      for (const listener of this.pgmSelectionListeners) {
        listener(frame.pgm.selected);
      }
    }
  }

  private startTicking() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(this.tick);
  }

  private async ensureContext() {
    if (this.ctx) return;

    this.ctx = new AudioContext({ sampleRate: 44100 });

    this.analyserFull = this.ctx.createAnalyser();
    this.analyserFull.fftSize = 2048;
    this.analyserFull.smoothingTimeConstant = 0.72;

    this.analyserBass = this.ctx.createAnalyser();
    this.analyserBass.fftSize = 512;
    this.analyserBass.smoothingTimeConstant = 0.82;

    this.analyserHigh = this.ctx.createAnalyser();
    this.analyserHigh.fftSize = 512;
    this.analyserHigh.smoothingTimeConstant = 0.62;

    const bassFilter = this.ctx.createBiquadFilter();
    bassFilter.type = "lowpass";
    bassFilter.frequency.value = 220;

    const highFilter = this.ctx.createBiquadFilter();
    highFilter.type = "highpass";
    highFilter.frequency.value = 4200;

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = this._volume;

    this.soundTouchNode = await createSoundTouchNode(this.ctx);
    this.soundTouchReady = this.soundTouchNode !== null;
    if (this.soundTouchNode) {
      this.soundTouchNode.connect(this.gainNode);
      this.syncSoundTouch();
    }

    this.gainNode.connect(this.analyserFull);
    this.analyserFull.connect(this.ctx.destination);
    this.analyserFull.connect(bassFilter);
    this.analyserFull.connect(highFilter);
    bassFilter.connect(this.analyserBass);
    highFilter.connect(this.analyserHigh);
  }

  private getTransportTime(): number {
    if (this._usingUploadedTrack && this.mediaElement) {
      return this.mediaElement.currentTime || 0;
    }
    if (this.ctx && this._playing) {
      return Math.max(0, (this.ctx.currentTime - this.silentTransportStart) * this._tempo);
    }
    return 0;
  }

  private tick = () => {
    if (!this.ctx) return;

    this.rafId = requestAnimationFrame(this.tick);

    if (!this._playing) return;

    const transport = this.sampleTransport();
    this._beat = transport.beatPosition;
    this._beatPhase = transport.beatPhase;

    if (this.analyserFull) {
      const td = new Uint8Array(this.analyserFull.fftSize);
      this.analyserFull.getByteTimeDomainData(td);
      let sum = 0;
      for (let i = 0; i < td.length; i++) {
        const s = (td[i] - 128) / 128;
        sum += s * s;
      }
      this._amplitude = Math.min(1, Math.sqrt(sum / td.length) * 1.8);

      const fd = new Uint8Array(this.analyserFull.frequencyBinCount);
      this.analyserFull.getByteFrequencyData(fd);
      this._fftBands = this.computeBands(fd);
    }

    if (this.analyserBass) {
      const buf = new Uint8Array(this.analyserBass.frequencyBinCount);
      this.analyserBass.getByteFrequencyData(buf);
      const bassSlice = buf.slice(0, Math.max(4, Math.floor(buf.length * 0.09)));
      const avg =
        bassSlice.reduce((a, b) => a + b, 0) / Math.max(1, bassSlice.length);
      this._bassAmp = avg / 255;
    }

    if (this.analyserHigh) {
      const buf = new Uint8Array(this.analyserHigh.frequencyBinCount);
      this.analyserHigh.getByteFrequencyData(buf);
      const highSlice = buf.slice(Math.floor(buf.length * 0.52));
      const avg =
        highSlice.reduce((a, b) => a + b, 0) / Math.max(1, highSlice.length);
      this._highAmp = avg / 255;
    }

    const energy = this._bassAmp;
    const diff = energy - this.prevEnergy;
    this.prevEnergy = energy;
    this.bassEma = this.bassEma * 0.92 + energy * 0.08;
    const onsetStrength = Math.max(
      0,
      Math.min(1.5, energy / Math.max(0.02, this.bassEma) - 1),
    );

    if (this.onsetCooldown > 0) this.onsetCooldown--;

    if (diff > 0.08 && energy > 0.12 && this.onsetCooldown === 0) {
      const elapsed = transport.transportSeconds;
      this.onsetHistory.push(elapsed);
      if (this.onsetHistory.length > 16) this.onsetHistory.shift();

      if (
        !this._bpmLocked &&
        this.beatGrid.length < 2 &&
        this.onsetHistory.length >= 4
      ) {
        const intervals = this.onsetHistory
          .slice(1)
          .map((t, i) => t - this.onsetHistory[i])
          .filter((v) => v > 0.18 && v < 2.2)
          .map((v) => {
            let b = 60 / v;
            while (b < 90) b *= 2;
            while (b >= 180) b /= 2;
            return b;
          });

        if (intervals.length >= 3) {
          const sorted = [...intervals].sort((a, b) => a - b);
          const med = sorted[Math.floor(sorted.length / 2)];
          const snapped = this.snapBPM(Math.round(med));
          this._bpm = this._bpm * 0.88 + snapped * 0.12;
          this.transportClock.setBpm(this._bpm, elapsed);
        }
      }

      this.onsetCooldown = 6;
    }

    this.advanceLiveSchedule(transport, onsetStrength);
  };

  private computeBands(buf: Uint8Array): number[] {
    const ranges = [
      [0.0, 0.02],
      [0.02, 0.05],
      [0.05, 0.1],
      [0.1, 0.18],
      [0.18, 0.3],
      [0.3, 0.48],
      [0.48, 0.7],
      [0.7, 1.0],
    ];

    return ranges.map(([from, to]) => {
      const a = Math.floor(buf.length * from);
      const b = Math.max(a + 1, Math.floor(buf.length * to));
      let sum = 0;
      for (let i = a; i < b; i++) sum += buf[i];
      return Math.min(1, sum / Math.max(1, b - a) / 255);
    });
  }

  private snapBPM(bpm: number): number {
    const grids = [
      90, 95, 100, 105, 110, 115, 120, 124, 125, 126, 128, 130, 132, 135, 140,
      145, 150, 155, 160, 165, 170, 174, 178,
    ];
    return grids.reduce((a, b) =>
      Math.abs(b - bpm) < Math.abs(a - bpm) ? b : a,
    );
  }

  private applyRhythmAnalysis(
    analysis: Awaited<ReturnType<typeof fetchEssentiaRhythmAnalysis>>,
  ) {
    const bpm = Math.max(60, Math.min(200, analysis.bpm));
    this._analysisBpm = bpm;
    this._tempo = 1;
    this._bpm = bpm;
    this._analysisKeyIndex = analysis.keyIndex ?? 0;
    this._keyShift = 0;
    this._pitchSemitones = 0;
    this.beatGrid = analysis.beats
      .filter((beat) => beat >= 0)
      .sort((a, b) => a - b);
    this.transportClock.setBeatGrid(
      this.beatGrid,
      bpm,
      this.getTransportTime(),
    );
    this._bpmLocked = false;
    this._analysisStatus = "ready";
    this._analysisConfidence = Number.isFinite(analysis.confidence)
      ? analysis.confidence
      : null;
    this._analysisError = null;
    this.syncSoundTouch();
  }

  private applyRealtimeFallback(error: unknown) {
    this.beatGrid = [];
    this.transportClock.setBeatGrid([], this._bpm, this.getTransportTime());
    this._analysisStatus = "fallback";
    this._analysisConfidence = null;
    this._analysisError =
      error instanceof Error ? error.message : "Hosted rhythm analysis failed.";
  }
}

export const audioEngine = new AudioEngine();
