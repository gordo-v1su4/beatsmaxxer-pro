/**
 * AudioEngine — user-audio upload + BPM / FFT analysis
 *
 * Supports:
 * - Uploaded audio files via HTMLMediaElement + MediaElementSourceNode
 * - Internal fallback drum loop if no song is loaded
 * - Realtime RMS / bass / high energy + 8-band FFT extraction
 * - Lightweight onset-based BPM estimation from bass energy
 */

import { fetchEssentiaRhythmAnalysis, fetchRhythmAnalysisFromUrl } from "./essentia";
import { TransportClock, type TransportSample } from "./transport";

export interface AudioState {
  bpm: number;
  bpmLocked: boolean;
  beat: number;
  beatPhase: number;
  amplitude: number;
  bassAmp: number;
  highAmp: number;
  fftBands: number[];
  playing: boolean;
  time: number;
  duration: number;
  trackName: string;
  usingUploadedTrack: boolean;
  analysisStatus: "idle" | "analyzing" | "ready" | "fallback" | "error";
  analysisConfidence: number | null;
  analysisError: string | null;
}

const DEFAULT_BPM = 128;
const DEFAULT_TRACK_NAME = 'Internal Drum Loop';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyserFull: AnalyserNode | null = null;
  private analyserBass: AnalyserNode | null = null;
  private analyserHigh: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;

  private sourceNode: AudioBufferSourceNode | null = null;
  private mediaElement: HTMLAudioElement | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private objectUrl: string | null = null;

  private _bpm = DEFAULT_BPM;
  private _beat = 0;
  private _beatPhase = 0;
  private _amplitude = 0;
  private _bassAmp = 0;
  private _highAmp = 0;
  private _fftBands = new Array(8).fill(0);
  private _playing = false;
  private _trackName = DEFAULT_TRACK_NAME;
  private _usingUploadedTrack = false;
  private _bpmLocked = false;
  private _analysisStatus: AudioState["analysisStatus"] = "idle";
  private _analysisConfidence: number | null = null;
  private _analysisError: string | null = null;

  private beatGrid: number[] = [];
  private onsetHistory: number[] = [];
  private prevEnergy = 0;
  private onsetCooldown = 0;

  private rafId = 0;
  private syntheticStartTime = 0;
  private analysisRequestId = 0;
  private transportClock = new TransportClock({ bpm: DEFAULT_BPM });

  async start() {
    await this.ensureContext();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (this._usingUploadedTrack && this.mediaElement) {
      this.mediaElement.currentTime = 0;
      await this.mediaElement.play();
      this._playing = true;
      this.transportClock.setPlaying(true, 0);
      this.onsetHistory = [];
      this.prevEnergy = 0;
      this.onsetCooldown = 0;
      this.startTicking();
      return;
    }

    if (!this.sourceNode) {
      const buf = await this.synthesizeDrumLoop(this.ctx, DEFAULT_BPM, 4);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this.gainNode!);
      src.start();
      this.sourceNode = src;
      this.syntheticStartTime = this.ctx.currentTime;
    }

    this._trackName = DEFAULT_TRACK_NAME;
    this._usingUploadedTrack = false;
    this._playing = true;
    this.transportClock.setPlaying(true, 0);
    this.onsetHistory = [];
    this.prevEnergy = 0;
    this.onsetCooldown = 0;
    this.startTicking();
  }

  stop() {
    const stoppedAt = this.getTransportTime();
    this._playing = false;
    this.transportClock.setPlaying(false, stoppedAt);

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

  async loadAudioUrl(url: string, trackName: string, options?: { analysisUrl?: string }) {
    await this.ensureContext();
    if (!this.ctx || !this.gainNode) return;

    this.stop();
    this.disposeMediaElement();

    this.attachMediaElement(url, trackName);
    this.prepareUploadedTrack(trackName);

    const requestId = ++this.analysisRequestId;

    try {
      const analysis = options?.analysisUrl
        ? await fetchRhythmAnalysisFromUrl(options.analysisUrl)
        : await (async () => {
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`Failed to fetch QA audio source (${response.status})`);
            }
            const blob = await response.blob();
            const file = new File([blob], trackName, { type: blob.type || 'audio/wav' });
            return fetchEssentiaRhythmAnalysis(file);
          })();
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
    this._trackName = DEFAULT_TRACK_NAME;
    this._bpm = DEFAULT_BPM;
    this.beatGrid = [];
    this.transportClock.setBeatGrid([], this._bpm, 0);
    this.transportClock.sourceChanged(0);
    this._analysisStatus = "idle";
    this._analysisConfidence = null;
    this._analysisError = null;
  }

  private attachMediaElement(src: string, trackName: string) {
    if (!this.ctx || !this.gainNode) return;

    const audio = new Audio();
    audio.src = src;
    audio.loop = true;
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audio.setAttribute('playsinline', 'true');
    audio.load();

    const source = this.ctx.createMediaElementSource(audio);
    source.connect(this.gainNode);

    this.mediaElement = audio;
    this.mediaSource = source;
    this._trackName = trackName;
  }

  private prepareUploadedTrack(trackName: string) {
    this._usingUploadedTrack = true;
    this._trackName = trackName;
    this._bpm = DEFAULT_BPM;
    this.beatGrid = [];
    this.transportClock.setBeatGrid([], this._bpm, 0);
    this.transportClock.sourceChanged(0);
    this.onsetHistory = [];
    this.prevEnergy = 0;
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
      this.mediaElement.src = '';
      this.mediaElement.load();
      this.mediaElement = null;
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  setVolume(v: number) {
    if (this.gainNode) this.gainNode.gain.value = v;
  }

  /** Manual BPM (typed or tap tempo). Locks out the auto-estimator until unlockBPM(). */
  setBPM(bpm: number) {
    this._bpm = Math.max(60, Math.min(200, bpm));
    this._bpmLocked = true;
    this.transportClock.setBpm(this._bpm, this.getTransportTime());
  }

  unlockBPM() {
    this._bpmLocked = false;
  }

  getState(): AudioState {
    const transport = this.getTransportSample();
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

  /**
   * High-frequency timing read for render consumers.
   *
   * This path is independent of React snapshots and is always sampled from the
   * audio/media clock rather than advancing from RAF time.
   */
  getTransportSample(presentationTimeSeconds = performance.now() / 1_000): TransportSample {
    const outputTimestamp = this.ctx?.getOutputTimestamp?.();
    const audioOutputTimeSeconds = outputTimestamp?.contextTime ?? this.ctx?.currentTime ?? 0;
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
      bypassHostedGrid: this._bpmLocked,
    });
  }

  drainTransportEvents() {
    return this.transportClock.drainEvents();
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
    bassFilter.type = 'lowpass';
    bassFilter.frequency.value = 220;

    const highFilter = this.ctx.createBiquadFilter();
    highFilter.type = 'highpass';
    highFilter.frequency.value = 4200;

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = 0.72;

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
    if (this.ctx && this.sourceNode) {
      return Math.max(0, this.ctx.currentTime - this.syntheticStartTime);
    }
    return 0;
  }

  private tick = () => {
    if (!this.ctx) return;

    this.rafId = requestAnimationFrame(this.tick);

    if (!this._playing) return;

    const transport = this.getTransportSample();
    const elapsed = transport.transportSeconds;
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
      const avg = bassSlice.reduce((a, b) => a + b, 0) / Math.max(1, bassSlice.length);
      this._bassAmp = avg / 255;
    }

    if (this.analyserHigh) {
      const buf = new Uint8Array(this.analyserHigh.frequencyBinCount);
      this.analyserHigh.getByteFrequencyData(buf);
      const highSlice = buf.slice(Math.floor(buf.length * 0.52));
      const avg = highSlice.reduce((a, b) => a + b, 0) / Math.max(1, highSlice.length);
      this._highAmp = avg / 255;
    }

    const energy = this._bassAmp;
    const diff = energy - this.prevEnergy;
    this.prevEnergy = energy;

    if (this.onsetCooldown > 0) this.onsetCooldown--;

    if (diff > 0.08 && energy > 0.12 && this.onsetCooldown === 0) {
      this.onsetHistory.push(elapsed);
      if (this.onsetHistory.length > 16) this.onsetHistory.shift();

      if (!this._bpmLocked && this.beatGrid.length < 2 && this.onsetHistory.length >= 4) {
        const intervals = this.onsetHistory
          .slice(1)
          .map((t, i) => t - this.onsetHistory[i])
          .filter(v => v > 0.18 && v < 2.2)
          // fold each inter-onset interval into the 90-180 BPM octave so
          // half-time kicks (~1s apart) don't read as 60 BPM
          .map(v => {
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
      return Math.min(1, (sum / Math.max(1, b - a)) / 255);
    });
  }

  private snapBPM(bpm: number): number {
    const grids = [90, 95, 100, 105, 110, 115, 120, 124, 125, 126, 128, 130, 132, 135, 140, 145, 150, 155, 160, 165, 170, 174, 178];
    return grids.reduce((a, b) => (Math.abs(b - bpm) < Math.abs(a - bpm) ? b : a));
  }

  private applyRhythmAnalysis(analysis: Awaited<ReturnType<typeof fetchEssentiaRhythmAnalysis>>) {
    const bpm = Math.max(60, Math.min(200, analysis.bpm));
    this._bpm = bpm;
    this.beatGrid = analysis.beats.filter((beat) => beat >= 0).sort((a, b) => a - b);
    this.transportClock.setBeatGrid(this.beatGrid, bpm, this.getTransportTime());
    this._analysisStatus = "ready";
    this._analysisConfidence = Number.isFinite(analysis.confidence) ? analysis.confidence : null;
    this._analysisError = null;
  }

  private applyRealtimeFallback(error: unknown) {
    this.beatGrid = [];
    this.transportClock.setBeatGrid([], this._bpm, this.getTransportTime());
    this._analysisStatus = "fallback";
    this._analysisConfidence = null;
    this._analysisError =
      error instanceof Error ? error.message : "Hosted rhythm analysis failed.";
  }

  private async synthesizeDrumLoop(ctx: AudioContext, bpm: number, bars: number): Promise<AudioBuffer> {
    const beatsPerBar = 4;
    const totalBeats = bars * beatsPerBar;
    const beatDur = 60 / bpm;
    const totalDur = totalBeats * beatDur;
    const sr = ctx.sampleRate;
    const len = Math.floor(totalDur * sr);
    const buf = ctx.createBuffer(2, len, sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);

    const write = (ch: Float32Array, start: number, data: Float32Array) => {
      for (let i = 0; i < data.length && start + i < ch.length; i++) ch[start + i] += data[i];
    };

    const kick = this.synthKick(sr, 0.45);
    const snare = this.synthSnare(sr, 0.22);
    const hat = this.synthHihat(sr, 0.06);
    const openHat = this.synthHihat(sr, 0.14, true);

    for (let beat = 0; beat < totalBeats; beat++) {
      const beatStart = Math.floor(beat * beatDur * sr);
      const bar = beat % 4;

      if (bar === 0 || bar === 2) {
        write(L, beatStart, kick);
        write(R, beatStart, kick);
      }
      if (bar === 2) {
        const off = Math.floor(beatDur * sr * 0.75);
        write(L, beatStart + off, kick.map(v => v * 0.6) as Float32Array);
        write(R, beatStart + off, kick.map(v => v * 0.6) as Float32Array);
      }
      if (bar === 1 || bar === 3) {
        write(L, beatStart, snare);
        write(R, beatStart, snare);
      }

      const hatStep = Math.floor(beatDur * sr * 0.5);
      for (let h = 0; h < 2; h++) {
        const hStart = beatStart + h * hatStep;
        const vol = h === 0 ? 0.7 : 0.5;
        write(L, hStart, hat.map(v => v * vol) as Float32Array);
        write(R, hStart, hat.map(v => v * vol) as Float32Array);
      }

      if (bar === 1) {
        const off = Math.floor(beatDur * sr * 0.5);
        write(L, beatStart + off, openHat);
        write(R, beatStart + off, openHat);
      }
    }

    for (let i = 0; i < len; i++) {
      L[i] = Math.tanh(L[i] * 1.4) * 0.85;
      R[i] = Math.tanh(R[i] * 1.4) * 0.85;
    }

    return buf;
  }

  private synthKick(sr: number, dur: number): Float32Array {
    const len = Math.floor(dur * sr);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 18);
      const freq = 55 + 140 * Math.exp(-t * 35);
      out[i] = Math.sin(2 * Math.PI * freq * t) * env * 1.2;
      out[i] += Math.sin(2 * Math.PI * 35 * t) * Math.exp(-t * 12) * 0.5;
      out[i] += (Math.random() * 2 - 1) * Math.exp(-t * 800) * 0.3;
    }
    return out;
  }

  private synthSnare(sr: number, dur: number): Float32Array {
    const len = Math.floor(dur * sr);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 22);
      const tone = Math.sin(2 * Math.PI * 185 * t) * env * 0.5;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 28) * 0.85;
      const snap = (Math.random() * 2 - 1) * Math.exp(-t * 350) * 0.4;
      out[i] = tone + noise + snap;
    }
    return out;
  }

  private synthHihat(sr: number, dur: number, open = false): Float32Array {
    const len = Math.floor(dur * sr);
    const out = new Float32Array(len);
    const decay = open ? 18 : 80;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp(-t * decay);
      out[i] = (
        Math.sin(2 * Math.PI * 8000 * t) * 0.3 +
        Math.sin(2 * Math.PI * 10200 * t) * 0.2 +
        (Math.random() * 2 - 1) * 0.5
      ) * env * 0.6;
    }
    return out;
  }
}

export const audioEngine = new AudioEngine();
