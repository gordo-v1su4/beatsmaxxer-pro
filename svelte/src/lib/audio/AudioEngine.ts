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
import { get } from "svelte/store";
import { audioLatencyHint } from "$lib/platform/desktopPerformance";
import { isMobileShell } from "$lib/mobile/mobileEnv";
import { audioTimeline, TransportClock, type TimelineFrame } from "$lib/transport";
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

/**
 * The eight FFT band edges, flattened to one array so the per-frame band walk
 * indexes a module constant instead of rebuilding nine arrays every frame.
 * Pairs are [from, to] as fractions of the analyser's bin count.
 */
const FFT_BAND_EDGES = [
  0.0, 0.02,
  0.02, 0.05,
  0.05, 0.1,
  0.1, 0.18,
  0.18, 0.3,
  0.3, 0.48,
  0.48, 0.7,
  0.7, 1.0,
] as const;
const FFT_BAND_COUNT = FFT_BAND_EDGES.length / 2;

/** Mean of `buf[from..to)`. Replaces a slice + reduce pair in the frame path. */
function meanOfRange(buf: Uint8Array, from: number, to: number): number {
  const end = Math.min(buf.length, to);
  const start = Math.max(0, Math.min(from, end));
  let sum = 0;
  for (let i = start; i < end; i++) sum += buf[i];
  return sum / Math.max(1, end - start);
}

/** Uploaded tracks stay paused until hosted analysis settles or fails closed. */
export function isRhythmAnalysisReady(
  usingUploadedTrack: boolean,
  analysisStatus: AudioEngineState["analysisStatus"]
): boolean {
  if (!usingUploadedTrack) return true;
  return analysisStatus === "ready" || analysisStatus === "fallback" || analysisStatus === "error";
}

export interface AudioFileLoadOptions {
  /** Enable only after an explicit, per-upload disclosure and user choice. */
  hostedAnalysis?: boolean;
}

export type MediaTimelineEvent =
  | 'playing' | 'pause' | 'waiting' | 'stalled'
  | 'seeking' | 'seeked' | 'timeupdate';

export type AudioStopReason =
  | 'operator'
  | 'replace-upload'
  | 'replace-url'
  | 'clear-upload'
  | 'restart-near-zero'
  | 'qa';

export function mediaTimelineResyncAction(
  event: MediaTimelineEvent,
  currentTime: number,
  previousTime: number
) {
  if (event === 'playing') return { action: 'play', positionSeconds: currentTime } as const;
  if (event === 'pause' || event === 'waiting' || event === 'stalled') {
    return { action: 'pause', positionSeconds: currentTime } as const;
  }
  if (event === 'seeking' || event === 'seeked') {
    return { action: 'seek', reason: 'seek', positionSeconds: currentTime } as const;
  }
  if (currentTime + 0.05 < previousTime) {
    return { action: 'seek', reason: 'loop-wrap', positionSeconds: currentTime } as const;
  }
  return { action: 'none', positionSeconds: currentTime } as const;
}

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
  private mediaTimelineAbort: AbortController | null = null;
  private uploadedPlaybackValidated = false;
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
  private playbackStartGeneration = 0;
  private activePlaybackStartGeneration: number | null = null;
  private lastStopReason: AudioStopReason | null = null;
  private stopCount = 0;
  private _trackName = "";
  /** Set when a user upload is loaded. */
  private _loadedUploadName: string | null = null;
  private uploadedTrackLoadGeneration = 0;
  private _usingUploadedTrack = false;
  private _bpmLocked = false;
  private _analysisStatus: AudioEngineState["analysisStatus"] = "idle";
  private _analysisConfidence: number | null = null;
  private _analysisDuration = 0;
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
  /**
   * Onset times from hosted analysis, in transport seconds. Separate from the
   * beat grid: beats are the metronome, onsets are where the track actually hits,
   * and the arrangement lane needs the second one to show what would fire.
   */
  private analysisOnsets: number[] = [];
  private _analysisOnsetGeneration = 0;
  private onsetHistory: number[] = [];
  private prevEnergy = 0;
  private bassEma = 0.08;
  private onsetCooldown = 0;
  private pgmSelectionListeners = new Set<(source: string) => void>();

  private analysisRequestId = 0;
  private transportClock = new TransportClock({ bpm: DEFAULT_BPM });

  constructor() {
    audioTimeline.subscribe(this.tick, 0);
  }

  /**
   * Re-establish audio after the page comes back to the foreground.
   *
   * Locking a phone, switching apps, or backgrounding the tab interrupts the
   * AudioContext: iOS suspends it outright, and Android may pause the media
   * element with it. Nothing used to run on the way back, so the transport
   * returned to a context whose `currentTime` had stopped — the picture was
   * live, the play button still read as playing, and the song was silent with
   * the playhead frozen. There is no way out of that from inside the app.
   *
   * Deliberately narrow: it only resumes what was already playing, and it never
   * starts playback. A `resume()` outside a gesture can be rejected, so this
   * reports whether it took rather than assuming it did — a refusal leaves the
   * transport exactly as it was, and the user's next tap on PLAY goes through
   * the real gesture path in `start()`.
   */
  async resumeAfterBackground(): Promise<boolean> {
    if (!this._playing) return false;
    const audioContext = this.ctx;
    const mediaElement = this.mediaElement;
    if (!audioContext) return false;
    try {
      if (audioContext.state === "suspended") await audioContext.resume();
      if (audioContext.state !== "running") return false;
      if (mediaElement?.paused && this._usingUploadedTrack) await mediaElement.play();
      return true;
    } catch {
      // Rejected without a gesture. The transport is untouched; PLAY still works.
      return false;
    }
  }

  async start() {
    if (this.activePlaybackStartGeneration !== null) return;

    // A decoded upload is the only playable source. Never let a missing or
    // failed upload fall through to a synthetic clock that makes the rack look
    // active while the song remains silent.
    if (!this._usingUploadedTrack || !this.mediaElement) return;

    if (this._playing) {
      if (this.getTransportTime() >= 0.05) return;
      this.stop('restart-near-zero');
    }
    const mediaElement = this.mediaElement;
    const audioContext = this.ctx;
    const startGeneration = ++this.playbackStartGeneration;
    this.activePlaybackStartGeneration = startGeneration;
    this.uploadedPlaybackValidated = false;
    const isCurrentStart = () =>
      this.playbackStartGeneration === startGeneration &&
      this.activePlaybackStartGeneration === startGeneration &&
      this.mediaElement === mediaElement &&
      this._usingUploadedTrack;

    /**
     * Start the song BEFORE any await.
     *
     * iOS only treats `play()` as user-initiated while the gesture that
     * triggered it is still "active", and that activation does not survive an
     * `await`. This used to call `ensureContext()` first, so by the time
     * `play()` ran the gesture was spent, Safari rejected it with
     * NotAllowedError, the catch below quietly set `useUploadedPlayback = false`
     * and the transport carried on against the synthetic clock.
     *
     * The failure was invisible in the worst way: the timeline still advanced,
     * so every video kept moving and reacting while the song sat paused — it
     * looked like an audio bug in the track, not a lost gesture.
     *
     * Capture the one play invocation and any required context resume before
     * the first await. Calling either again would no longer be inside the
     * original gesture on Safari/iOS.
     */
    const pendingPlay = this.gestureAttempt(() => mediaElement.play());
    const pendingResume = audioContext?.state === "suspended"
      ? this.gestureAttempt(() => audioContext.resume())
      : Promise.resolve(audioContext?.state === "running");

    try {
      let contextSetupSucceeded = true;
      try {
        await this.ensureContext();
      } catch {
        contextSetupSucceeded = false;
      }
      const currentAfterContextSetup =
        contextSetupSucceeded &&
        isCurrentStart() &&
        this.ctx === audioContext;

      const [playAccepted, resumeAccepted] = await Promise.all([
        pendingPlay,
        pendingResume,
      ]);

      if (!isCurrentStart() || this.ctx !== audioContext) {
        this.pauseCancelledStartElement(mediaElement);
        return;
      }

      if (
        !currentAfterContextSetup ||
        !playAccepted ||
        !resumeAccepted ||
        !audioContext ||
        audioContext.state !== "running"
      ) {
        this.rejectCurrentPlaybackStart(mediaElement);
        return;
      }

      this.uploadedPlaybackValidated = true;
      this._playing = true;
      audioTimeline.play(mediaElement.currentTime);
      audioTimeline.publishFrame();
      this.onsetHistory = [];
      this.prevEnergy = 0;
      this.bassEma = 0.08;
      this.onsetCooldown = 0;
    } finally {
      if (this.activePlaybackStartGeneration === startGeneration) {
        this.activePlaybackStartGeneration = null;
      }
    }
  }

  stop(reason: AudioStopReason = 'operator') {
    this.invalidatePlaybackStart();
    this.lastStopReason = reason;
    this.stopCount += 1;
    this._playing = false;
    this.advanceLiveSchedule(this.sampleTransport(), 0);
    audioTimeline.stop();
    audioTimeline.publishFrame();

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
    // In place: the array identity is handed out by getState() and the frame
    // path now writes through it, so replacing it here would leave whoever is
    // already holding it reading a band set that never updates again.
    this._fftBands.fill(0);
  }

  async loadAudioFile(file: File, options: AudioFileLoadOptions = {}) {
    await this.ensureContext();
    if (!this.ctx || !this.gainNode) return;

    this.stop('replace-upload');
    this.disposeMediaElement();

    this.objectUrl = URL.createObjectURL(file);
    this.attachMediaElement(this.objectUrl, file.name);
    this.prepareUploadedTrack(file.name, options.hostedAnalysis === true);
    this.uploadedTrackLoadGeneration += 1;

    if (options.hostedAnalysis !== true) {
      this.analysisRequestId += 1;
      return;
    }

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

    this.stop('replace-url');
    this.disposeMediaElement();

    this.analysisRequestId += 1;
    this.attachMediaElement(url, trackName);
    this.prepareUploadedTrack(trackName, false);
  }

  clearUploadedTrack() {
    this.stop('clear-upload');
    this.disposeMediaElement();

    this.analysisRequestId += 1;
    this._usingUploadedTrack = false;
    this._trackName = "";
    this._loadedUploadName = null;
    this._bpm = DEFAULT_BPM;
    this._analysisBpm = DEFAULT_BPM;
    this.beatGrid = [];
    this.setAnalysisOnsets([]);
    this._bpmLocked = false;
    this.applyTempoRate(1);
    this.transportClock.setBeatGrid([], this._bpm, 0);
    audioTimeline.setBeatGrid([], this._bpm, this._bpm / this._tempo);
    audioTimeline.configureSource({ id: null, positionSeconds: 0 });
    this._analysisStatus = "idle";
    this._analysisConfidence = null;
    this._analysisDuration = 0;
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
    this.mediaTimelineAbort?.abort();
    const mediaTimelineAbort = new AbortController();
    this.mediaTimelineAbort = mediaTimelineAbort;
    let previousMediaTime = 0;
    const resync = (event: Event) => {
      if (this.mediaElement !== audio || !this._usingUploadedTrack) return;
      const action = mediaTimelineResyncAction(
        event.type as MediaTimelineEvent,
        audio.currentTime,
        previousMediaTime
      );
      previousMediaTime = audio.currentTime;
      if (action.action === 'play') {
        if (!this.uploadedPlaybackValidated) return;
        this._playing = true;
        audioTimeline.play(action.positionSeconds);
      } else if (action.action === 'pause') {
        if (!this._playing) return;
        this._playing = false;
        audioTimeline.pause();
      } else if (action.action === 'seek') {
        audioTimeline.seek(action.positionSeconds, action.reason);
      }
    };
    for (const event of [
      'playing', 'pause', 'waiting', 'stalled', 'seeking', 'seeked', 'timeupdate'
    ] as const) {
      audio.addEventListener(event, resync, { signal: mediaTimelineAbort.signal });
    }
    audio.addEventListener("loadedmetadata", () => {
      if (this.mediaElement !== audio) return;
      audioTimeline.configureSource({
        id: trackName,
        durationSeconds: audio.duration,
        loop: audio.loop,
        positionSeconds: audioTimeline.getPositionSeconds(),
      });
    }, { once: true, signal: mediaTimelineAbort.signal });
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

  private prepareUploadedTrack(trackName: string, hostedAnalysisRequested: boolean) {
    this._usingUploadedTrack = true;
    this._trackName = trackName;
    this._loadedUploadName = trackName;
    this._bpmLocked = false;
    this._bpm = DEFAULT_BPM;
    this._analysisBpm = DEFAULT_BPM;
    this._analysisKeyIndex = 0;
    this._keyShift = 0;
    this._pitchSemitones = 0;
    this.beatGrid = [];
    this.applyTempoRate(1);
    this.transportClock.setBeatGrid([], this._bpm, 0);
    audioTimeline.setBeatGrid([], this._bpm, this._bpm / this._tempo);
    audioTimeline.configureSource({ id: trackName, positionSeconds: 0, loop: true });
    this.onsetHistory = [];
    this.prevEnergy = 0;
    this.bassEma = 0.08;
    this.onsetCooldown = 0;
    this._analysisStatus = hostedAnalysisRequested ? "analyzing" : "fallback";
    this._analysisConfidence = null;
    this._analysisDuration = 0;
    this._analysisError = hostedAnalysisRequested
      ? null
      : "Local-only mode — hosted rhythm analysis was not requested.";
  }

  private disposeMediaElement() {
    this.invalidatePlaybackStart();
    this.mediaTimelineAbort?.abort();
    this.mediaTimelineAbort = null;
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

  private invalidatePlaybackStart() {
    this.playbackStartGeneration += 1;
    this.activePlaybackStartGeneration = null;
    this.uploadedPlaybackValidated = false;
  }

  private gestureAttempt(attempt: () => Promise<void>): Promise<boolean> {
    try {
      return attempt().then(
        () => true,
        () => false,
      );
    } catch {
      return Promise.resolve(false);
    }
  }

  private rejectCurrentPlaybackStart(mediaElement: HTMLAudioElement) {
    mediaElement.pause();
    this.uploadedPlaybackValidated = false;
    this._playing = false;
    audioTimeline.pause();
    audioTimeline.publishFrame();
  }

  private pauseCancelledStartElement(mediaElement: HTMLAudioElement) {
    if (
      this.mediaElement !== mediaElement ||
      (!this._playing && this.activePlaybackStartGeneration === null)
    ) {
      mediaElement.pause();
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
    audioTimeline.setBeatGrid(this.beatGrid, this._bpm, this._bpm / this._tempo);
  }

  unlockBPM() {
    this._bpmLocked = false;
    this.applyTempoRate(1);
    this._bpm = Math.round(this._analysisBpm);
  }

  /** Playback rate — shifts markers via source-time advance; does not re-analyze. */
  private applyTempoRate(rate: number) {
    this._tempo = rate;
    audioTimeline.setPlaybackRate(rate);
    this.syncSoundTouch();
    this.transportClock.queueImmediateParameter(
      "rate",
      this._tempo,
      this.getTransportTime(),
    );
    if (!this._bpmLocked) {
      this._bpm = Math.round(this._analysisBpm * this._tempo);
    }
    audioTimeline.setBeatGrid(this.beatGrid, this._bpm, this._bpm / this._tempo);
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
      analysisDuration: this._analysisDuration,
      analysisError: this._analysisError,
      analysisOnsetGeneration: this._analysisOnsetGeneration,
    };
  }

  /** Seek the active song; its media events re-anchor the sole AudioTimeline. */
  seek(seconds: number) {
    const media = this.mediaElement;
    if (!media || !Number.isFinite(media.duration) || media.duration <= 0) return;
    media.currentTime = Math.max(0, Math.min(media.duration, seconds));
  }

  isRhythmReady() {
    return isRhythmAnalysisReady(this._usingUploadedTrack, this._analysisStatus);
  }

  async waitForRhythmReady(timeoutMs = 90_000) {
    if (this.isRhythmReady()) return;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.isRhythmReady()) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(
      `Timed out waiting for rhythm analysis (${this._analysisStatus})`
    );
  }

  /** Onset times in transport seconds. Empty unless hosted analysis succeeded. */
  getAnalysisOnsets(): readonly number[] {
    return this.analysisOnsets;
  }

  /** Hosted beat times in transport seconds. Empty on the realtime fallback. */
  getBeatGrid(): readonly number[] {
    return this.beatGrid;
  }

  getUploadedTrackLoadGeneration() {
    return this.uploadedTrackLoadGeneration;
  }

  /** Read-only diagnostics used by the physical, human-observed media proof. */
  getProofPlaybackDiagnostics() {
    let rms = 0;
    if (this.analyserFull) {
      const samples = new Float32Array(this.analyserFull.fftSize);
      this.analyserFull.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      rms = Math.sqrt(sum / samples.length);
    }
    return {
      contextState: this.ctx?.state ?? 'uninitialized',
      contextCurrentTime: audioTimeline.getLastFrame()?.contextTimeSeconds ?? 0,
      mediaCurrentTime: this.mediaElement?.currentTime ?? 0,
      currentSrc: this.mediaElement?.currentSrc ?? '',
      mediaPaused: this.mediaElement?.paused ?? true,
      mediaMuted: this.mediaElement?.muted ?? false,
      rms,
      amplitude: this._amplitude,
      volume: this._volume,
      playing: this._playing,
      usingUploadedTrack: this._usingUploadedTrack,
      trackName: this._trackName,
      uploadedTrackLoadGeneration: this.uploadedTrackLoadGeneration,
      lastStopReason: this.lastStopReason,
      stopCount: this.stopCount
    };
  }

  getTransportSample(
    _presentationTimeSeconds?: number,
  ): TransportSample {
    const sample = this.sampleTransport();
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

  getTimelineFrame() {
    return audioTimeline.getLastFrame();
  }

  drainTransportEvents() {
    return this.transportClock.drainEvents();
  }

  configureTimeSampler(config: TimeSamplerConfig) {
    const input: LiveTimeSamplerInput = {
      controls: config.controls,
      sourceDurationSeconds: config.sourceDurationSeconds,
      sourceKey: config.sourceKey,
      triggerKey: config.triggerKey,
      feel: config.feel,
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

  getPgmPreparation() {
    return liveScheduleRuntime.getPgmPreparation();
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
        effectiveSliceCount: frame.timeSampler.effectiveSliceCount,
        jumpReason: frame.timeSampler.jumpReason,
        mode: frame.timeSampler.mode,
        loopIteration: frame.timeSampler.loopIteration,
        loopCount: frame.timeSampler.loopCount,
      },
      accent: frame.accent
        ? {
            mode: ACCENT_MODE_INDEX[frame.accent.mode],
            transportSeconds: frame.accent.transportSeconds,
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

  private sampleTransport(frame = audioTimeline.getLastFrame()) {
    const positionSeconds = frame?.positionSeconds ?? audioTimeline.getPositionSeconds();
    const sampled = this.transportClock.sample({
      transportSeconds: positionSeconds,
      audioOutputTimeSeconds: frame?.contextTimeSeconds ?? 0,
      performanceTimeSeconds: frame?.contextTimeSeconds ?? 0,
      presentationTimeSeconds: positionSeconds,
      playing: frame?.playing ?? this._playing,
      bypassHostedGrid: false,
    });
    return frame ? { ...sampled, discontinuityGeneration: frame.generation } : sampled;
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

  private async ensureContext() {
    if (this.ctx) return;

    /**
     * No forced sample rate, and a buffer sized for the machine.
     *
     * This asked for 44100 on every device. Phone audio hardware runs at 48000
     * — all iOS devices and effectively all Android — so the request did not
     * get 44.1k output, it got a resampler inserted between the graph and the
     * speaker. Nothing depended on the value; AudioTimeline reads
     * `context.sampleRate` off the context, and SoundTouch and the analysers
     * are all rate-relative.
     *
     * The latency hint is per-machine — see audioLatencyHint(). A phone gets a
     * larger output buffer than a laptop, because the GPU is competing for the
     * same budget and the smallest buffer is the one that underruns.
     */
    this.ctx = new AudioContext({ latencyHint: audioLatencyHint(get(isMobileShell)) });
    audioTimeline.bindContext(this.ctx);

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
    return audioTimeline.getPositionSeconds();
  }

  private tick = (timelineFrame: TimelineFrame) => {
    if (!this.ctx) return;
    if (!this._playing) return;

    const transport = this.sampleTransport(timelineFrame);
    this._beat = transport.beatPosition;
    this._beatPhase = transport.beatPhase;

    if (this.analyserFull) {
      const td = this.scratch(this.analyserFull.fftSize);
      this.analyserFull.getByteTimeDomainData(td);
      let sum = 0;
      for (let i = 0; i < td.length; i++) {
        const s = (td[i] - 128) / 128;
        sum += s * s;
      }
      this._amplitude = Math.min(1, Math.sqrt(sum / td.length) * 1.8);

      const fd = this.scratchFreq(this.analyserFull.frequencyBinCount);
      this.analyserFull.getByteFrequencyData(fd);
      this.computeBandsInto(fd, this._fftBands);
    }

    if (this.analyserBass) {
      const buf = this.scratchBass(this.analyserBass.frequencyBinCount);
      this.analyserBass.getByteFrequencyData(buf);
      this._bassAmp = meanOfRange(buf, 0, Math.max(4, Math.floor(buf.length * 0.09))) / 255;
    }

    if (this.analyserHigh) {
      const buf = this.scratchHigh(this.analyserHigh.frequencyBinCount);
      this.analyserHigh.getByteFrequencyData(buf);
      this._highAmp = meanOfRange(buf, Math.floor(buf.length * 0.52), buf.length) / 255;
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
          audioTimeline.setBeatGrid([], this._bpm, this._bpm / this._tempo);
        }
      }

      this.onsetCooldown = 6;
    }

    this.advanceLiveSchedule(transport, onsetStrength);
  };

  /**
   * Analyser scratch buffers, allocated once per size rather than per frame.
   *
   * tick() runs on every animation frame and used to allocate four Uint8Arrays
   * (2048 + 1024 + 256 + 256 bytes), two slices of them, and computeBands'
   * range table plus its result array — roughly twenty objects and 3.5KB of
   * garbage, sixty times a second. Nothing downstream retains any of it, so it
   * was pure collector pressure, and a phone pays for that in frame hitches
   * rather than in throughput. Each getter reallocates only if the analyser's
   * bin count actually changes, which it does not after setup.
   */
  private scratchTime = new Uint8Array(new ArrayBuffer(0));
  private scratchFull = new Uint8Array(new ArrayBuffer(0));
  private scratchLow = new Uint8Array(new ArrayBuffer(0));
  private scratchTop = new Uint8Array(new ArrayBuffer(0));

  private scratch(size: number) {
    if (this.scratchTime.length !== size) this.scratchTime = new Uint8Array(new ArrayBuffer(size));
    return this.scratchTime;
  }
  private scratchFreq(size: number) {
    if (this.scratchFull.length !== size) this.scratchFull = new Uint8Array(new ArrayBuffer(size));
    return this.scratchFull;
  }
  private scratchBass(size: number) {
    if (this.scratchLow.length !== size) this.scratchLow = new Uint8Array(new ArrayBuffer(size));
    return this.scratchLow;
  }
  private scratchHigh(size: number) {
    if (this.scratchTop.length !== size) this.scratchTop = new Uint8Array(new ArrayBuffer(size));
    return this.scratchTop;
  }

  /** Fills `out` in place; same maths as the old computeBands, no allocation. */
  private computeBandsInto(buf: Uint8Array, out: number[]): number[] {
    for (let band = 0; band < FFT_BAND_COUNT; band++) {
      const a = Math.floor(buf.length * FFT_BAND_EDGES[band * 2]);
      const b = Math.max(a + 1, Math.floor(buf.length * FFT_BAND_EDGES[band * 2 + 1]));
      let sum = 0;
      for (let i = a; i < b; i++) sum += buf[i];
      out[band] = Math.min(1, sum / Math.max(1, b - a) / 255);
    }
    return out;
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
    this.applyTempoRate(1);
    this._bpm = bpm;
    this._analysisKeyIndex = analysis.keyIndex ?? 0;
    this._keyShift = 0;
    this._pitchSemitones = 0;
    this.beatGrid = analysis.beats
      .filter((beat) => beat >= 0)
      .sort((a, b) => a - b);
    this.setAnalysisOnsets(analysis.onsets);
    this.transportClock.setBeatGrid(
      this.beatGrid,
      bpm,
      this.getTransportTime(),
    );
    audioTimeline.setBeatGrid(this.beatGrid, bpm, bpm / this._tempo);
    this._bpmLocked = false;
    this._analysisStatus = "ready";
    this._analysisConfidence = Number.isFinite(analysis.confidence)
      ? analysis.confidence
      : null;
    this._analysisDuration = analysis.duration;
    this._analysisError = null;
    this.syncSoundTouch();
  }

  private setAnalysisOnsets(onsets: readonly number[] | undefined) {
    this.analysisOnsets = (onsets ?? [])
      .filter((time) => Number.isFinite(time) && time >= 0)
      .sort((a, b) => a - b);
    this._analysisOnsetGeneration += 1;
  }

  private applyRealtimeFallback(error: unknown) {
    this.beatGrid = [];
    this._analysisDuration = 0;
    this.setAnalysisOnsets([]);
    this.transportClock.setBeatGrid([], this._bpm, this.getTransportTime());
    audioTimeline.setBeatGrid([], this._bpm, this._bpm / this._tempo);
    this._analysisStatus = "fallback";
    this._analysisConfidence = null;
    this._analysisError =
      error instanceof Error ? error.message : "Hosted rhythm analysis failed.";
  }
}

export const audioEngine = new AudioEngine();
