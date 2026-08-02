import type { TimelineFrame } from '$lib/transport';
import type { VideoSourcePort } from '$lib/media/VideoSourcePort';
import type { NativeFrameSurface, VideoSurfaceSource } from '$lib/media/NativeFrameSurface';
import { decodeNativeFrameBatch } from '$lib/media/nativeFrameBatch';
import { isTauriRuntime } from '$lib/platform/runtime';
import { isDesktopNativeDecodeEnabled } from '$lib/platform/desktopDecode';

type FrameListener = (frame: NativeFrameSurface) => void;
const PROGRAM_FRAME_PREFIX = '__bsp_pgm__:';
const PROGRAM_PREPARE_AFTER_CUT_MS = 50;
export interface NativeSourceTimeline {
  sourceId: string;
  positionUs: number;
  playbackRate: number;
  revision?: number;
}

export interface NativeDecodeStats {
  backend: string;
  elapsedMs: number;
  previewDecoderCount: number;
  programDecoderActive: boolean;
  pullBatches: number;
  producedFrames: number;
  mailboxOverwrites: number;
  pulledFrames: number;
  dropRate: number;
  decodedCpuBytes: number;
  frameIpcBytes: number;
  frameIpcBatches: number;
  zeroCopyFrames: number;
  cpuFallbackFrames: number;
  iosurfaceImports: number;
  iosurfaceImportFailures: number;
  gpuSubmissions: number;
  nativeCompositor: {
    presentedFrames: number;
    intervalsUs: number[];
    surfaces: Record<string, {
      surfaceId: string;
      sourceId: string;
      effectModuleId: string;
      effectMode: number;
      effectRequestedFrame: number;
      effectAppliedFrame: number;
      width: number;
      height: number;
      timestampUs: number;
      sequence: number;
    }>;
    cuts: Array<{
      sourceId: string;
      latencyUs: number;
      blackFrames: number;
    }>;
    pgmBlackFrames: number;
    pendingProgramSource: string | null;
  };
  memoryHighWaterBytes: number;
  sources: Record<string, {
    openCount: number;
    producedFrames: number;
    mailboxOverwrites: number;
    pulledFrames: number;
    decodedCpuBytes: number;
    frameIpcBytes: number;
    lastWidth: number;
    lastHeight: number;
    lastTimestampUs: number;
    lastSequence: number;
  }>;
  lastError: string | null;
}

interface NativeClipProbe {
  duration_us?: number | null;
}

/** AVFoundation/VideoToolbox source with one bounded Rust-to-WebGPU mailbox. */
export class TauriNativeSource implements VideoSourcePort {
  readonly kind = 'tauri-native' as const;
  private latest = new Map<string, NativeFrameSurface>();
  private programSurface: NativeFrameSurface | null = null;
  private attached = new Set<string>();
  private durations = new Map<string, number>();
  private listeners = new Set<FrameListener>();
  private pulling = false;
  private started = false;
  private lastTransportSyncMs = Number.NEGATIVE_INFINITY;
  private lastGeneration = -1;
  private lastPlaying = false;
  private programSource: string | null = null;
  private desiredProgramSource: string | null | undefined;
  private programSwitching = false;
  private preparedProgramSource: string | null = null;
  private desiredPreparedProgramSource: string | null | undefined;
  private programPreparing = false;
  private programPrepareTimer: ReturnType<typeof setTimeout> | null = null;
  private lastProgramSwitchMs = Number.NEGATIVE_INFINITY;
  private sourceTimelines: NativeSourceTimeline[] = [];
  private lastSourceRevisionKey = '';

  async attach(moduleId: string, path: string) {
    if (!isTauriRuntime()) throw new Error('TauriNativeSource requires the desktop runtime');
    const { invoke } = await import('@tauri-apps/api/core');
    const probe = await invoke<NativeClipProbe>('open_clip_path', { moduleId, path });
    this.attached.add(moduleId);
    this.durations.set(moduleId, Math.max(0, (probe.duration_us ?? 0) / 1_000_000));
  }

  getSurface(moduleId: string): VideoSurfaceSource | null {
    return this.latest.get(moduleId) ?? null;
  }

  /** Full source-resolution PGM frame from the dedicated native decoder. */
  getProgramSurface(sourceId: string): VideoSurfaceSource | null {
    return this.programSource === sourceId ? this.programSurface : null;
  }

  tick(frameOrPlaying: TimelineFrame | boolean) {
    if (!isTauriRuntime() || typeof frameOrPlaying === 'boolean' || this.pulling) return;
    this.pulling = true;
    void this.syncAndPull(frameOrPlaying).finally(() => {
      this.pulling = false;
    });
  }

  setProgramSource(sourceId: string | null) {
    if (sourceId === this.programSource && this.desiredProgramSource === undefined) return;
    // Cut immediately to the target slot's always-live preview surface. The
    // source-resolution lane upgrades independently and must never block frame
    // pulls or leave PGM showing the preceding slot.
    this.programSurface = null;
    this.programSource = sourceId;
    this.lastProgramSwitchMs = performance.now();
    if (this.preparedProgramSource === sourceId) this.preparedProgramSource = null;
    this.desiredProgramSource = sourceId;
    void this.pumpProgramSwitch();
  }

  /** Ask Rust to open and continuously align the next full-resolution PGM
   * lane while the current source remains on air. Pixels never enter JS. */
  prepareProgramSource(sourceId: string | null) {
    if (sourceId === this.programSource || sourceId === this.preparedProgramSource) return;
    this.preparedProgramSource = sourceId;
    this.desiredPreparedProgramSource = sourceId;
    this.scheduleProgramPrepare();
  }

  setSourceTimelines(sourceTimelines: NativeSourceTimeline[]) {
    this.sourceTimelines = sourceTimelines;
  }

  getDuration(sourceId: string) {
    return this.durations.get(sourceId) ?? 0;
  }

  getDiagnostics() {
    return {
      attached: [...this.attached].sort(),
      previews: Object.fromEntries(
        [...this.latest.entries()].map(([sourceId, surface]) => [sourceId, {
          width: surface.width,
          height: surface.height,
          timestampUs: surface.timestampUs,
          sequence: surface.sequence
        }])
      ),
      programSource: this.programSource,
      preparedProgramSource: this.preparedProgramSource,
      program: this.programSurface ? {
        width: this.programSurface.width,
        height: this.programSurface.height,
        timestampUs: this.programSurface.timestampUs,
        sequence: this.programSurface.sequence
      } : null
    };
  }

  async resetDecodeStats() {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('reset_decode_stats');
  }

  async getDecodeStats() {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<NativeDecodeStats>('decode_stats');
  }

  async release(moduleId: string) {
    if (!isTauriRuntime()) return;
    this.latest.delete(moduleId);
    this.attached.delete(moduleId);
    this.durations.delete(moduleId);
    if (this.programSource === moduleId || this.desiredProgramSource === moduleId) {
      this.programSurface = null;
      this.programSource = null;
      this.desiredProgramSource = null;
    }
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('release_clip', { moduleId });
  }

  async dispose() {
    this.latest.clear();
    this.programSurface = null;
    this.attached.clear();
    this.durations.clear();
    this.started = false;
    this.preparedProgramSource = null;
    this.desiredPreparedProgramSource = undefined;
    if (this.programPrepareTimer !== null) clearTimeout(this.programPrepareTimer);
    this.programPrepareTimer = null;
    if (!isTauriRuntime()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('stop_decode');
  }

  async listen() {
    if (!isTauriRuntime() || this.started) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('start_decode');
    this.started = true;
  }

  onFrame(listener: FrameListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async syncAndPull(frame: TimelineFrame) {
    const { invoke } = await import('@tauri-apps/api/core');
    const nowMs = performance.now();
    const transportChanged =
      frame.generation !== this.lastGeneration || frame.playing !== this.lastPlaying;
    const sourceRevisionKey = this.sourceTimelines
      .map((source) => `${source.sourceId}:${source.revision ?? 0}`)
      .sort()
      .join('|');
    if (
      transportChanged ||
      sourceRevisionKey !== this.lastSourceRevisionKey ||
      nowMs - this.lastTransportSyncMs >= 250
    ) {
      await invoke('update_decode_transport', {
        positionUs: Math.round(frame.positionSeconds * 1_000_000),
        playing: frame.playing,
        playbackRate: frame.playbackRate,
        generation: frame.generation,
        sourceTimelines: this.sourceTimelines
      });
      this.lastTransportSyncMs = nowMs;
      this.lastGeneration = frame.generation;
      this.lastPlaying = frame.playing;
      this.lastSourceRevisionKey = sourceRevisionKey;
    }

    if (this.attached.size === 0) return;
    // The native compositor receives retained IOSurface frames directly from
    // the Rust worker. Transport anchors remain control IPC; frame packets do
    // not cross into JavaScript.
    if (isDesktopNativeDecodeEnabled()) return;
    const packet = await invoke<ArrayBuffer | Uint8Array | number[]>('pull_decode_frames');
    for (const surface of decodeNativeFrameBatch(packet)) {
      if (surface.moduleId.startsWith(PROGRAM_FRAME_PREFIX)) {
        const sourceId = surface.moduleId.slice(PROGRAM_FRAME_PREFIX.length);
        if (sourceId !== this.programSource) continue;
        const previous = this.programSurface;
        if (!previous || previous.sequence < surface.sequence) {
          this.programSurface = surface;
          for (const listener of this.listeners) listener(surface);
        }
        continue;
      }
      const previous = this.latest.get(surface.moduleId);
      if (previous && previous.sequence >= surface.sequence) continue;
      this.latest.set(surface.moduleId, surface);
      for (const listener of this.listeners) listener(surface);
    }
  }

  private async pumpProgramSwitch() {
    if (this.programSwitching || !isTauriRuntime()) return;
    this.programSwitching = true;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      while (this.desiredProgramSource !== undefined) {
        const sourceId = this.desiredProgramSource;
        this.desiredProgramSource = undefined;
        await invoke('set_decode_program_source', { sourceId });
      }
    } finally {
      this.programSwitching = false;
      if (this.desiredProgramSource !== undefined) void this.pumpProgramSwitch();
    }
  }


  private async pumpProgramPrepare() {
    if (this.programPreparing || !isTauriRuntime()) return;
    this.programPreparing = true;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      while (this.desiredPreparedProgramSource !== undefined) {
        const sourceId = this.desiredPreparedProgramSource;
        this.desiredPreparedProgramSource = undefined;
        try {
          await invoke('prepare_decode_program_source', { sourceId });
        } catch (error) {
          if (this.preparedProgramSource === sourceId) this.preparedProgramSource = null;
          throw error;
        }
      }
    } finally {
      this.programPreparing = false;
      if (this.desiredPreparedProgramSource !== undefined) this.scheduleProgramPrepare();
    }
  }

  private scheduleProgramPrepare() {
    if (this.programPrepareTimer !== null || this.programPreparing) return;
    const delay = Math.max(
      0,
      this.lastProgramSwitchMs + PROGRAM_PREPARE_AFTER_CUT_MS - performance.now()
    );
    this.programPrepareTimer = setTimeout(() => {
      this.programPrepareTimer = null;
      void this.pumpProgramPrepare();
    }, delay);
  }
}

export const tauriNativeSource = new TauriNativeSource();
