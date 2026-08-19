/**
 * Engine contracts — shared interfaces for the Svelte rewrite of beatsmaxxer-pro.
 * All subagents MUST implement against these interfaces.
 */

import type { TimelineFrame } from '$lib/transport/AudioTimeline';

// ─── Audio Engine ────────────────────────────────────────────────────────────

export interface TransportSample {
  transportSeconds: number;
  audioOutputTimeSeconds: number;
  performanceTimeSeconds: number;
  presentationTimeSeconds: number;
  playing: boolean;
  discontinuityGeneration: number;
  bpm: number;
  beatPosition: number;
  beatPhase: number;
}

export type AnalysisStatus = 'idle' | 'analyzing' | 'ready' | 'fallback' | 'error';

export interface AudioEngineState {
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
  analysisStatus: AnalysisStatus;
  analysisConfidence: number | null;
  /** Duration of the bounded excerpt actually analysed, not the full song. */
  analysisDuration: number;
  analysisError: string | null;
  /**
   * Bumped whenever a new onset list lands. The list itself is thousands of
   * numbers and the state is read every frame, so consumers watch this counter
   * and pull the array with getAnalysisOnsets() only when it changes.
   */
  analysisOnsetGeneration: number;
}

export interface IAudioEngine {
  start(): Promise<void>;
  stop(): void;
  loadAudioFile(file: File): Promise<void>;
  loadAudioUrl(url: string, trackName: string): Promise<void>;
  clearUploadedTrack(): void;
  getTransportSample(presentationTimeSeconds?: number): TransportSample;
  getTimelineFrame(): TimelineFrame | null;
  getState(): AudioEngineState;
  configureTimeSampler(config: TimeSamplerConfig): void;
  getLiveScheduleFrame(): LiveScheduleFrame | null;
  setBPM(bpm: number): void;
  unlockBPM(): void;
  seek(seconds: number): void;
  tapTempo(): void;
}

export interface TimeSamplerConfig {
  controls: {
    mode?: number;
    size?: number;
    slices?: number;
    loops?: number;
    rate?: number;
    accent?: number;
  };
  sourceDurationSeconds: number;
  sourceKey: string;
  /** Rack groove from the PGM rail: 0 straight, 1 swing, 2 dotted. */
  feel?: 0 | 1 | 2;
  midiNotes?: Array<{ time: number; note: number; velocity: number }>;
  midiDurationSeconds?: number;
  onsetSensitivity: number;
  bypassed: boolean;
}

export interface LiveScheduleFrame {
  timeSampler: {
    sourceTimestampSeconds: number;
    targetPlaybackRate: number;
    jumpGeneration: number;
    activeSlice: number;
  };
  accent: {
    mode: number;
    presentationTimeSeconds: number;
  } | null;
}

// ─── Video Renderer ──────────────────────────────────────────────────────────

export interface VideoRendererConfig {
  type: string;
  color: string;
  mode: 'effect' | 'output';
  videoUrl?: string | null;
  midiLayer?: MidiLayer | null;
  bypassed?: boolean;
  hidden?: boolean;
  onFirstFrame?: () => void;
}

export interface IVideoRenderer {
  mount(container: HTMLElement): Promise<boolean>;
  setConfig(config: Partial<VideoRendererConfig>): void;
  updateParams(params: Record<string, number>): void;
  updateAudioState(state: AudioEngineState): void;
  setVideoUrl(url: string | null): void;
  setPlaying(playing: boolean): void;
  dispose(): void;
}

export interface MidiLayer {
  name: string;
  notes: Array<{ time: number; note: number; velocity: number }>;
  duration: number;
}

// ─── Module System ───────────────────────────────────────────────────────────

export interface ModuleConfig {
  id: string;
  name: string;
  shortName: string;
  accentColor: string;
  params: Record<string, number>;
}

export interface VideoLayer {
  name: string;
  url: string;
  file?: File;
}

// ─── WebGPU Presenter ────────────────────────────────────────────────────────

export interface WebGpuPresenterConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface IWebGpuPresenter {
  attach(canvas: HTMLCanvasElement): Promise<void>;
  setSource(video: HTMLVideoElement | null): void;
  render(): boolean;
  detach(): void;
  isReady(): boolean;
}

export type WebGpuVideoSamplePath = 'external-texture' | 'cached-video-texture' | 'test-card';

export interface WebGpuRenderDiagnostics {
  bindingId: string;
  /** Effect/WGSL identity, independent from the stable decoded media source. */
  effectModuleId?: string;
  /** Stable rack media/decode identity (top-0..bottom-3). */
  sourceId?: string;
  canvas: string;
  cssSize: string;
  effectMode: number;
  hasVideo: number;
  externalTextureImported: boolean;
  externalTextureBound: boolean;
  cachedTextureUploaded?: boolean;
  cachedTextureBound?: boolean;
  /** Rendered from cache to cover a loop wrap. Otherwise indistinguishable from
   * a healthy frame: the import succeeds and reports hasVideo, just empty. */
  coveredLoopWrap?: boolean;
  samplePath: WebGpuVideoSamplePath;
  source: string | null;
  dimensions: string | null;
  frameId: number | null;
  videoSize: string | null;
  feedback: string;
  mix: number;
  timelineFrameId: number | null;
  timelineGeneration: number | null;
  fixedStepIndex: number | null;
  feedbackDegraded: boolean;
  feedbackSkippedSteps: number;
  uniformHash: string;
  renderCount: number;
  skippedRenderCount: number;
  /** Zero means uncapped: the binding follows each AppLoop display publication. */
  targetFps: number;
  frameIntervalMs: number | null;
  lastRenderContextTimeSeconds: number;
  renderedThisFrame: boolean;
  skipReason: 'none' | 'cadence' | 'unchanged' | 'inactive';
}

// ─── Effect Shader ───────────────────────────────────────────────────────────

export interface EffectShaderSource {
  vertex: string;
  fragment: string;
}

export interface EffectUniforms {
  uTime: number;
  uResolution: [number, number];
  uColor: [number, number, number];
  uMode: number;
  uBypass: number;
  uBPM: number;
  uBeat: number;
  uBeatPhase: number;
  uPlaying: number;
  uAmplitude: number;
  uBassAmp: number;
  uHighAmp: number;
  uFFT0: [number, number, number, number];
  uFFT1: [number, number, number, number];
  uP0: [number, number, number, number];
  uP1: [number, number, number, number];
  uP2: [number, number, number, number];
  uVideoRes: [number, number];
  uHasVideo: number;
  uAwaitingVideo: number;
  uTransportSec: number;
  uSrcTime: number;
  uAux1: number;
  uAux2: number;
  uLumAccent: number;
}

// ─── Hot Deck (fftron-sync adapted) ──────────────────────────────────────────

export type HotDeckReadiness =
  | 'cold'
  | 'warming'
  | 'warm'
  | 'hot'
  | 'failed'
  | 'disposed';

export type DeckFrameHandleKind = 'videoFrame' | 'proxyTexture' | 'preRenderTarget';

export interface DeckFrameHandleRef {
  id: string;
  kind: DeckFrameHandleKind;
  sourceId: string;
  deckId: string;
  sourceTimeMs: number;
  createdAtMs: number;
  staleAfterMs: number | null;
}

export interface HotDeckState {
  id: string;
  slotId: string;
  sourceId: string;
  readiness: HotDeckReadiness;
  preparedFrame: DeckFrameHandleRef | null;
  lastError: string | null;
  updatedAtMs: number;
}

export type ModuleType = string;

export type RendererCapability = 'checking' | 'webgpu_active' | 'webgpu_unavailable';
