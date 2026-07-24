import { useEffect, useRef } from "react";
import type { ModuleType } from "../App";
import { audioEngine } from "../audio/AudioEngine";
import { PlaybackPerformanceTracker } from "../qa/performance";
import {
  createBrowserMediaRendererRuntime,
  type BrowserMediaRendererCanvases,
} from "../render/browserFactory";
import type { RenderFrameRequest } from "../render/contracts";
import {
  acquirePooledVideo,
  releasePooledVideo,
} from "../render/legacy/HtmlVideoRenderer";
import { createQaInstrumentedPlaybackCoordinator } from "./telemetry";
import type { ClipRegistry } from "./ClipRegistry";
import { MultiClipPlaybackRuntime } from "./MultiClipPlaybackRuntime";

export interface BrowserProgramRendererProps {
  registry: ClipRegistry;
  registryVersion: number;
  pgm: ModuleType | null;
  prewarm: ModuleType | null;
  overlap: ModuleType | null;
  promoted: boolean;
  params: Record<string, number>;
  onRuntimeChange?: (
    runtime: { removeClip(id: string): Promise<boolean> } | null,
  ) => void;
}

export function circularMediaTimeDistance(
  duration: number,
  from: number,
  to: number,
) {
  const direct = Math.abs(from - to);
  if (!Number.isFinite(duration) || duration <= 0) return direct;
  const normalized = direct % duration;
  return Math.min(normalized, duration - normalized);
}

export function resetPresentedVideoCadence(cadence: {
  previousMediaTime: number | null;
  presentedMediaTime: number | null;
}) {
  cadence.previousMediaTime = null;
  cadence.presentedMediaTime = null;
}

function applyQaCommand(
  runtime: MultiClipPlaybackRuntime<VideoFrame, HTMLVideoElement> | null,
  value: string,
) {
  if (!runtime || !value) return;
  try {
    const command = JSON.parse(value) as
      | {
          action: "select";
          pgm: string;
          prewarm?: string | null;
          overlap?: string | null;
        }
      | {
          action: "scrub";
          timeSeconds: number;
          cached?: boolean;
        }
      | {
          action: "clear";
        }
      | {
          action: "pressure";
        };
    if (command.action === "select") {
      runtime.select({
        pgm: command.pgm,
        prewarm: command.prewarm ?? null,
        overlap: command.overlap ?? null,
      });
    } else if (command.action === "clear") {
      void runtime.deactivate();
    } else if (command.action === "pressure") {
      runtime.degradeForPressure();
    } else if (Number.isFinite(command.timeSeconds)) {
      runtime.scrub(command.timeSeconds, command.cached ?? true);
    }
  } catch {
    // Malformed QA commands are ignored and remain inspectable.
  }
}

function accentMode(params: Record<string, number>) {
  const index = Math.min(2, Math.max(0, Math.round(params.accent ?? 0)));
  return (["LUM", "RGB", "OFF"] as const)[index];
}

export function BrowserProgramRenderer(
  props: BrowserProgramRendererProps,
) {
  const webgpuRef = useRef<HTMLCanvasElement>(null);
  const webglRef = useRef<HTMLCanvasElement>(null);
  const htmlRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef =
    useRef<MultiClipPlaybackRuntime<VideoFrame, HTMLVideoElement> | null>(
      null,
    );
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const canvases: BrowserMediaRendererCanvases = {
      webgpu: webgpuRef.current!,
      webgl: webglRef.current!,
      htmlVideo: htmlRef.current!,
    };
    let cancelled = false;
    let animationFrame = 0;
    let longTaskObserver: PerformanceObserver | null = null;
    let lastQaCommand = "";
    let lastPresentedAt: number | null = null;
    const performanceTracker = new PlaybackPerformanceTracker();
    const videoCadences = new Map<
      HTMLVideoElement,
      {
        active: boolean;
        callbackId: number;
        previousMediaTime: number | null;
        presentedMediaTime: number | null;
        frameDurationSeconds: number | null;
      }
    >();
    const observeVideoCadence = (video: HTMLVideoElement) => {
      if (
        videoCadences.has(video) ||
        typeof video.requestVideoFrameCallback !== "function"
      ) {
        return;
      }
      const state = {
        active: true,
        callbackId: 0,
        previousMediaTime: null as number | null,
        presentedMediaTime: null as number | null,
        frameDurationSeconds: null as number | null,
      };
      const observe: VideoFrameRequestCallback = (_now, metadata) => {
        if (!state.active) return;
        if (state.previousMediaTime !== null) {
          const duration = Math.abs(
            metadata.mediaTime - state.previousMediaTime,
          );
          if (duration >= 1 / 240 && duration <= 0.1) {
            state.frameDurationSeconds =
              state.frameDurationSeconds === null
                ? duration
                : Math.min(state.frameDurationSeconds, duration);
          }
        }
        state.previousMediaTime = metadata.mediaTime;
        state.presentedMediaTime = metadata.mediaTime;
        state.callbackId = video.requestVideoFrameCallback(observe);
      };
      state.callbackId = video.requestVideoFrameCallback(observe);
      videoCadences.set(video, state);
    };
    const stopVideoCadence = (video: HTMLVideoElement) => {
      const state = videoCadences.get(video);
      if (!state) return;
      state.active = false;
      video.cancelVideoFrameCallback(state.callbackId);
      videoCadences.delete(video);
    };
    const handleQaSelect = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          pgm: string;
          prewarm?: string | null;
          overlap?: string | null;
        }>
      ).detail;
      if (!detail?.pgm) return;
      runtimeRef.current?.select({
        pgm: detail.pgm,
        prewarm: detail.prewarm ?? null,
        overlap: detail.overlap ?? null,
      });
    };
    const handleQaScrub = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          timeSeconds: number;
          cached?: boolean;
        }>
      ).detail;
      if (!Number.isFinite(detail?.timeSeconds)) return;
      runtimeRef.current?.scrub(
        detail.timeSeconds,
        detail.cached ?? true,
      );
    };
    const handlePressure = () => {
      runtimeRef.current?.degradeForPressure();
    };
    window.addEventListener(
      "beat-surfer:multi-clip-select",
      handleQaSelect,
    );
    window.addEventListener(
      "beat-surfer:multi-clip-scrub",
      handleQaScrub,
    );
    window.addEventListener(
      "beat-surfer:media-pressure",
      handlePressure,
    );

    void (async () => {
      const coordinator =
        createQaInstrumentedPlaybackCoordinator<VideoFrame>();
      const renderer = await createBrowserMediaRendererRuntime({
        direct: {
          supported: false,
          reason: "sample-frame-probe-failed",
          config: {
            codec: "avc1.640028",
            codedWidth: 1920,
            codedHeight: 1080,
          },
        },
        capabilities: {
          webgpuExternalTexture: {
            available: false,
            sampleFrameProbePassed: false,
          },
          webgl2VideoFrame: {
            available: false,
            sampleFrameProbePassed: false,
          },
          htmlVideo:
            canvases.htmlVideo.getContext("webgl2") !== null,
        },
        coordinator,
        canvases,
      });
      if (cancelled) {
        renderer.dispose();
        coordinator.dispose();
        return;
      }
      const runtime = new MultiClipPlaybackRuntime({
        registry: props.registry,
        coordinator,
        renderer,
        performance: performanceTracker,
        videos: {
          acquire: (clip) => {
            const video = acquirePooledVideo(clip.url);
            observeVideoCadence(video);
            return video;
          },
          release: (clip, video, signal) => {
            stopVideoCadence(video);
            return releasePooledVideo(clip.url, signal);
          },
          ready: (video) => video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
          seeking: (video) => video.seeking,
          currentTime: (video) => video.currentTime,
          normalizeTime: (video, timeSeconds) =>
            Number.isFinite(video.duration) && video.duration > 0
              ? ((timeSeconds % video.duration) + video.duration) %
                video.duration
              : Math.max(0, timeSeconds),
          timeDistance: (video, currentTime, targetTime) => {
            return circularMediaTimeDistance(
              video.duration,
              currentTime,
              targetTime,
            );
          },
          presentationTolerance: (video) => {
            const frameDuration =
              videoCadences.get(video)?.frameDurationSeconds;
            return frameDuration === null ||
              frameDuration === undefined
              ? 1 / 30
              : frameDuration * 1.05;
          },
          presentedTimeMatches: (video, targetTime) => {
            const state = videoCadences.get(video);
            const frameStart = state?.presentedMediaTime;
            const frameDuration = state?.frameDurationSeconds;
            if (
              frameStart === null ||
              frameStart === undefined ||
              frameDuration === null ||
              frameDuration === undefined
            ) {
              return (
                circularMediaTimeDistance(
                  video.duration,
                  video.currentTime,
                  targetTime,
                ) <= 1 / 30
              );
            }
            const interval = Math.min(0.1, frameDuration * 1.05);
            return (
              circularMediaTimeDistance(
                video.duration,
                frameStart,
                targetTime,
              ) <= interval
            );
          },
          seek: (video, timeSeconds) => {
            const cadence = videoCadences.get(video);
            if (cadence) {
              resetPresentedVideoCadence(cadence);
            }
            video.currentTime = Math.max(0, timeSeconds);
          },
          setPlaying: (video, playing) => {
            if (playing) {
              void video.play().catch(() => {});
            } else {
              video.pause();
            }
          },
          setPlaybackRate: (video, playbackRate) => {
            if (Math.abs(video.playbackRate - playbackRate) > 1e-4) {
              video.playbackRate = playbackRate;
            }
          },
        },
      });
      runtimeRef.current = runtime;
      propsRef.current.onRuntimeChange?.({
        removeClip: (id) => runtime.removeClip(id),
      });
      runtime.select({
        pgm: propsRef.current.pgm,
        prewarm: propsRef.current.prewarm,
        overlap: propsRef.current.overlap,
      });
      if (import.meta.env.DEV) {
        (
          window as unknown as {
            __BEAT_SURFER_MULTI_CLIP_QA__?: {
              snapshot: () => ReturnType<typeof runtime.snapshot>;
              select: (
                pgm: string,
                prewarm?: string | null,
                overlap?: string | null,
              ) => void;
              scrub: (timeSeconds: number, cached: boolean) => boolean;
              pressure: () => ReturnType<
                typeof runtime.degradeForPressure
              >;
            };
          }
        ).__BEAT_SURFER_MULTI_CLIP_QA__ = {
          snapshot: () => runtime.snapshot(),
          select: (pgm, prewarm = null, overlap = null) => {
            runtime.select({ pgm, prewarm, overlap });
          },
          scrub: (timeSeconds, cached) =>
            runtime.scrub(timeSeconds, cached),
          pressure: () => runtime.degradeForPressure(),
        };
      }

      if (typeof PerformanceObserver !== "undefined") {
        try {
          longTaskObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              performanceTracker.recordLongTask(entry.duration);
            }
          });
          longTaskObserver.observe({ entryTypes: ["longtask"] });
        } catch {
          longTaskObserver = null;
        }
      }

      const render = () => {
        const current = propsRef.current;
        const qaCommand =
          document.documentElement.dataset.beatSurferMultiClipCommand ??
          "";
        if (qaCommand && qaCommand !== lastQaCommand) {
          lastQaCommand = qaCommand;
          applyQaCommand(runtime, qaCommand);
        }
        const transport = audioEngine.getTransportSample();
        const live = audioEngine.getLiveScheduleFrame();
        const canvas = htmlRef.current;
        if (canvas && current.promoted) {
          const now = performance.now();
          const rect = canvas.getBoundingClientRect();
          const width = Math.max(1, Math.round(rect.width));
          const height = Math.max(1, Math.round(rect.height));
          if (canvas.width !== width) canvas.width = width;
          if (canvas.height !== height) canvas.height = height;
          const request: RenderFrameRequest = {
            width,
            height,
            effect: "timesampler",
            accentMode: accentMode(current.params),
            accentEnvelope: live?.accent ? 1 : 0,
            rgbOffset: 0.02,
            mix: Math.min(
              1,
              Math.max(0, (current.params.mix ?? 100) / 100),
            ),
          };
          const fallbackPath = runtime.snapshot().renderer.fallback.path;
          const lateThresholdMs =
            fallbackPath === "html-video-webgl2"
              ? (1_000 / 30) * 1.5
              : (1_000 / 60) * 1.5;
          const presented = runtime.present(
            {
              presentationTimeSeconds:
                transport.presentationTimeSeconds,
              playing: transport.playing,
              discontinuityGeneration:
                transport.discontinuityGeneration,
            },
            live?.timeSampler.sourceTimestampSeconds ??
              transport.transportSeconds,
            request,
            {
              late:
                lastPresentedAt !== null &&
                now - lastPresentedAt > lateThresholdMs,
              sourceGeneration:
                live?.timeSampler.jumpGeneration,
              playbackRate:
                live?.timeSampler.targetPlaybackRate,
            },
          );
          if (presented) lastPresentedAt = now;
        } else {
          lastPresentedAt = null;
        }
        if (import.meta.env.DEV) {
          document.documentElement.dataset.beatSurferMultiClip =
            JSON.stringify(runtime.snapshot());
        }
        animationFrame = requestAnimationFrame(render);
      };
      render();
    })().catch((error) => {
      document.documentElement.dataset.beatSurferMultiClip =
        JSON.stringify({
          error:
            error instanceof Error ? error.message : String(error),
        });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener(
        "beat-surfer:multi-clip-select",
        handleQaSelect,
      );
      window.removeEventListener(
        "beat-surfer:multi-clip-scrub",
        handleQaScrub,
      );
      window.removeEventListener(
        "beat-surfer:media-pressure",
        handlePressure,
      );
      longTaskObserver?.disconnect();
      for (const video of videoCadences.keys()) {
        stopVideoCadence(video);
      }
      propsRef.current.onRuntimeChange?.(null);
      void runtimeRef.current?.dispose();
      runtimeRef.current = null;
      delete (
        window as unknown as {
          __BEAT_SURFER_MULTI_CLIP_QA__?: unknown;
        }
      ).__BEAT_SURFER_MULTI_CLIP_QA__;
      delete document.documentElement.dataset.beatSurferMultiClip;
    };
  }, [props.registry]);

  useEffect(() => {
    runtimeRef.current?.select({
      pgm: props.pgm,
      prewarm: props.prewarm,
      overlap: props.overlap,
    });
  }, [
    props.pgm,
    props.prewarm,
    props.overlap,
    props.registryVersion,
  ]);

  return (
    <>
      {import.meta.env.DEV && (
        <input
          aria-label="G007 QA command"
          data-g007-qa-command
          onChange={(event) =>
            applyQaCommand(runtimeRef.current, event.currentTarget.value)
          }
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            opacity: 0.01,
            zIndex: 20,
          }}
        />
      )}
      <canvas
        ref={htmlRef}
        data-g007-program-canvas
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: props.promoted ? "block" : "none",
        }}
      />
      <canvas ref={webgpuRef} hidden />
      <canvas ref={webglRef} hidden />
    </>
  );
}
