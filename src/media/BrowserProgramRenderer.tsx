import { useEffect, useRef, useState } from "react";
import type { ModuleType } from "../App";
import { audioEngine } from "../audio/AudioEngine";
import { PlaybackPerformanceTracker } from "../qa/performance";
import {
  createBrowserMediaRendererRuntime,
  probeBrowserRendererCapabilities,
  type BrowserMediaRendererCanvases,
} from "../render/browserFactory";
import type { RenderFrameRequest } from "../render/contracts";
import { createQaInstrumentedPlaybackCoordinator } from "./telemetry";
import type { ClipRegistry } from "./ClipRegistry";
import { MultiClipPlaybackRuntime } from "./MultiClipPlaybackRuntime";
import {
  mediaOwnerId,
  mediaOwnerRegistry,
} from "./MediaOwnerRegistry";
import { isHtmlVideoQaFallbackEnabled } from "./qaFallback";
import { mediaEngine } from "./MediaEngine";
import { probeClipDirectPlayback } from "./clipProbe";
import type { PlaybackLaneRole } from "./PlaybackCoordinator";
import type { DirectPlaybackProbe } from "./capabilities";

export interface BrowserProgramRendererProps {
  registry: ClipRegistry;
  registryVersion: number;
  pgm: ModuleType | null;
  prewarm: ModuleType | null;
  promoted: boolean;
  params: Record<string, number>;
  onRuntimeChange?: (
    runtime: { removeClip(id: string): Promise<boolean> } | null,
  ) => void;
  onFallbackPathChange?: (
    path:
      | "webcodecs-webgpu"
      | "webcodecs-webgl2"
      | "html-video-webgl2"
      | "native-static",
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

export function rvfcValidityDeadlineMs(
  expectedDisplayTimeMs: number,
  frameDurationSeconds: number,
  playbackRate: number,
) {
  return (
    expectedDisplayTimeMs +
    (1_000 * frameDurationSeconds) /
      Math.max(0.01, Math.abs(playbackRate))
  );
}

export function rvfcPresentationIsAuthoritative(options: {
  hasPresentation: boolean;
  paused: boolean;
  expired: boolean;
  displayedFrameCountAtCallback: number | null;
  displayedFrameCount: number | null;
}) {
  if (!options.hasPresentation) return false;
  if (options.paused || !options.expired) return true;
  if (
    options.displayedFrameCountAtCallback === null ||
    options.displayedFrameCount === null
  ) {
    return true;
  }
  return (
    options.displayedFrameCount <=
    options.displayedFrameCountAtCallback
  );
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

function renderEffectForModule(
  moduleId: ModuleType | null,
): RenderFrameRequest["effect"] {
  if (!moduleId) return "source";
  if (moduleId === "timesampler") return "timesampler";
  if (
    moduleId === "transition" ||
    moduleId === "speedramp" ||
    moduleId === "tapdelay"
  ) {
    return moduleId;
  }
  return "source";
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
    let lastDomTelemetryAt = 0;
    const DOM_TELEMETRY_INTERVAL_MS = 500;
    let coordinator: ReturnType<
      typeof createQaInstrumentedPlaybackCoordinator<VideoFrame>
    > | null = null;
    let decodeScheduler: ReturnType<
      typeof mediaEngine.attachDecodeScheduler
    > | null = null;
    const performanceTracker = new PlaybackPerformanceTracker();
    const videoCadences = new Map<
      HTMLVideoElement,
      {
        active: boolean;
        callbackId: number;
        previousMediaTime: number | null;
        presentedMediaTime: number | null;
        frameDurationSeconds: number | null;
        lastCallbackAtMs: number | null;
        lastExpectedDisplayTimeMs: number | null;
        latestRawDeltaSeconds: number | null;
        callbackSequence: number;
        displayedFrameCountAtCallback: number | null;
      }
    >();
    const displayedFrameCount = (video: HTMLVideoElement) => {
      if (typeof video.getVideoPlaybackQuality !== "function") {
        return null;
      }
      try {
        const quality = video.getVideoPlaybackQuality();
        const count =
          quality.totalVideoFrames - quality.droppedVideoFrames;
        return Number.isFinite(count) ? count : null;
      } catch {
        return null;
      }
    };
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
        lastCallbackAtMs: null as number | null,
        lastExpectedDisplayTimeMs: null as number | null,
        latestRawDeltaSeconds: null as number | null,
        callbackSequence: 0,
        displayedFrameCountAtCallback: null as number | null,
      };
      const observe: VideoFrameRequestCallback = (now, metadata) => {
        if (!state.active) return;
        if (state.previousMediaTime !== null) {
          const rawDelta =
            metadata.mediaTime - state.previousMediaTime;
          const duration = Math.abs(rawDelta);
          state.latestRawDeltaSeconds = rawDelta;
          if (duration >= 1 / 240 && duration <= 0.1) {
            state.frameDurationSeconds =
              state.frameDurationSeconds === null
                ? duration
                : Math.min(state.frameDurationSeconds, duration);
          }
        }
        state.previousMediaTime = metadata.mediaTime;
        state.presentedMediaTime = metadata.mediaTime;
        state.lastCallbackAtMs = now;
        state.lastExpectedDisplayTimeMs = metadata.expectedDisplayTime;
        state.callbackSequence += 1;
        state.displayedFrameCountAtCallback =
          displayedFrameCount(video);
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
      const playbackCoordinator =
        createQaInstrumentedPlaybackCoordinator<VideoFrame>();
      coordinator = playbackCoordinator;
      const qaHtmlFallback = isHtmlVideoQaFallbackEnabled();
      const probeRequest: RenderFrameRequest = {
        width: 2,
        height: 2,
        effect: "timesampler",
        accentMode: "OFF",
        accentEnvelope: 0,
        rgbOffset: 0,
        mix: 1,
      };
      let capabilities = {
        webgpuExternalTexture: {
          available: false,
          sampleFrameProbePassed: false,
        },
        webgl2VideoFrame: {
          available: false,
          sampleFrameProbePassed: false,
        },
        htmlVideo:
          qaHtmlFallback &&
          canvases.htmlVideo.getContext("webgl2") !== null,
      };
      if (
        typeof VideoFrame !== "undefined" &&
        globalThis.isSecureContext
      ) {
        try {
          const sampleCanvas = document.createElement("canvas");
          sampleCanvas.width = 2;
          sampleCanvas.height = 2;
          const ctx = sampleCanvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#808080";
            ctx.fillRect(0, 0, 2, 2);
            capabilities = await probeBrowserRendererCapabilities({
              createSampleFrame: async () =>
                new VideoFrame(sampleCanvas, { timestamp: 0 }),
              request: probeRequest,
              canvases,
            });
          }
        } catch {
          // Probes failed; decoded path unavailable until demuxer wired.
        }
      }
      if (cancelled) {
        playbackCoordinator.dispose();
        return;
      }
      let direct: DirectPlaybackProbe = {
        supported: false,
        reason: "webcodecs-unavailable",
        config: {
          codec: "avc1.640028",
          codedWidth: 1920,
          codedHeight: 1080,
        },
      };
      const probeClip =
        propsRef.current.registry.get(
          propsRef.current.pgm ?? "",
        ) ?? propsRef.current.registry.list()[0] ?? null;
      if (probeClip) {
        try {
          direct = await probeClipDirectPlayback(probeClip);
        } catch {
          direct = {
            supported: false,
            reason: "decoder-probe-failed",
            config: direct.config,
          };
        }
      }
      if (cancelled) {
        playbackCoordinator.dispose();
        return;
      }
      // Keep HTML video available when the decoded path is not viable so PGM
      // still shows pixels. Only suppress HTML when WebCodecs probe passed.
      if (!qaHtmlFallback && direct.supported) {
        capabilities = {
          ...capabilities,
          htmlVideo: false,
        };
      }
      const renderer = await createBrowserMediaRendererRuntime({
        direct,
        capabilities,
        coordinator: playbackCoordinator,
        canvases,
      });
      if (cancelled) {
        renderer.dispose();
        playbackCoordinator.dispose();
        return;
      }
      decodeScheduler = mediaEngine.attachDecodeScheduler(
        playbackCoordinator,
        (state, queueSize) => {
          if (import.meta.env.DEV) {
            document.documentElement.dataset.beatSurferDecoderState =
              JSON.stringify({ state, queueSize });
          }
        },
      );
      const runtime = new MultiClipPlaybackRuntime({
        registry: props.registry,
        coordinator: playbackCoordinator,
        renderer,
        performance: performanceTracker,
        videos: {
          // Every lane role resolves to the clip's shared decode lane, so a clip
          // that is previewed, prewarmed, and on air still decodes only once.
          acquire: (clip, _role: PlaybackLaneRole) => {
            const video = mediaOwnerRegistry.acquireHtmlVideo(
              mediaOwnerId("clip", clip.id),
              clip.url,
            );
            observeVideoCadence(video);
            return video;
          },
          release: (clip, video, _role, signal) => {
            stopVideoCadence(video);
            return mediaOwnerRegistry.releaseAsync(
              mediaOwnerId("clip", clip.id),
              clip.url,
              signal,
            );
          },
          transferRole: (clip, _video, _fromRole, _toRole) => {
            mediaOwnerRegistry.transferHtmlVideo(
              mediaOwnerId("clip", clip.id),
              mediaOwnerId("clip", clip.id),
              clip.url,
            );
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
          presentationDiagnostics: (video) => {
            const cadence = videoCadences.get(video);
            const frameDuration =
              cadence?.frameDurationSeconds ?? null;
            const playbackRate = Number.isFinite(video.playbackRate)
              ? video.playbackRate
              : null;
            const validUntilMs =
              cadence?.lastExpectedDisplayTimeMs === null ||
              cadence?.lastExpectedDisplayTimeMs === undefined ||
              frameDuration === null ||
              playbackRate === null
                ? null
                : rvfcValidityDeadlineMs(
                    cadence.lastExpectedDisplayTimeMs,
                    frameDuration,
                    playbackRate,
                  );
            const now = performance.now();
            const currentDisplayedFrameCount =
              displayedFrameCount(video);
            const hasPresentation =
              cadence?.presentedMediaTime !== null &&
              cadence?.presentedMediaTime !== undefined;
            const expired =
              hasPresentation &&
              validUntilMs !== null &&
              now > validUntilMs;
            const superseded =
              expired &&
              cadence?.displayedFrameCountAtCallback !== null &&
              cadence?.displayedFrameCountAtCallback !== undefined &&
              currentDisplayedFrameCount !== null &&
              currentDisplayedFrameCount >
                cadence.displayedFrameCountAtCallback;
            return {
              presentedMediaTime:
                cadence?.presentedMediaTime ?? null,
              frameDurationSeconds: frameDuration,
              durationSeconds:
                Number.isFinite(video.duration) && video.duration > 0
                  ? video.duration
                  : null,
              playbackRate,
              rvfcAgeSeconds:
                cadence?.lastCallbackAtMs === null ||
                cadence?.lastCallbackAtMs === undefined
                  ? null
                  : Math.max(
                      0,
                      (now - cadence.lastCallbackAtMs) / 1_000,
                    ),
              expectedDisplayTimeMs:
                cadence?.lastExpectedDisplayTimeMs ?? null,
              rvfcValidUntilMs: validUntilMs,
              rvfcFresh: hasPresentation && !expired,
              rvfcAuthoritative:
                rvfcPresentationIsAuthoritative({
                  hasPresentation,
                  paused: video.paused,
                  expired,
                  displayedFrameCountAtCallback:
                    cadence?.displayedFrameCountAtCallback ?? null,
                  displayedFrameCount: currentDisplayedFrameCount,
                }),
              displayedFrameCountAtCallback:
                cadence?.displayedFrameCountAtCallback ?? null,
              displayedFrameCount: currentDisplayedFrameCount,
              rvfcExpired: expired,
              rvfcSuperseded: superseded,
              latestRawDeltaSeconds:
                cadence?.latestRawDeltaSeconds ?? null,
              callbackSequence: cadence?.callbackSequence ?? 0,
              callbackSequenceReliable: cadence !== undefined,
            };
          },
          seek: (video, timeSeconds) => {
            const cadence = videoCadences.get(video);
            if (cadence) {
              resetPresentedVideoCadence(cadence);
              cadence.lastCallbackAtMs = null;
              cadence.lastExpectedDisplayTimeMs = null;
              cadence.latestRawDeltaSeconds = null;
              cadence.displayedFrameCountAtCallback = null;
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
      const path = runtime.snapshot().renderer.fallback.path;
      setActivePath(path);
      propsRef.current.onFallbackPathChange?.(path);
      propsRef.current.onRuntimeChange?.({
        removeClip: (id) => runtime.removeClip(id),
      });
      runtime.select({
        pgm: propsRef.current.pgm,
        prewarm: propsRef.current.prewarm,
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
        const now = performance.now();
        const qaCommand =
          document.documentElement.dataset.beatSurferMultiClipCommand ??
          "";
        if (qaCommand && qaCommand !== lastQaCommand) {
          lastQaCommand = qaCommand;
          applyQaCommand(runtime, qaCommand);
        }
        const transport = audioEngine.getTransportSample();
        const live = audioEngine.getLiveScheduleFrame();
        if (current.promoted) {
          const fallbackPath = runtime.snapshot().renderer.fallback.path;
          if (fallbackPath !== activePathRef.current) {
            activePathRef.current = fallbackPath;
            setActivePath(fallbackPath);
            propsRef.current.onFallbackPathChange?.(fallbackPath);
          }
          const activeCanvas =
            fallbackPath === "webcodecs-webgpu"
              ? webgpuRef.current
              : fallbackPath === "webcodecs-webgl2"
                ? webglRef.current
                : htmlRef.current;
          if (activeCanvas) {
            const rect = activeCanvas.getBoundingClientRect();
            const width = Math.max(1, Math.round(rect.width));
            const height = Math.max(1, Math.round(rect.height));
            if (activeCanvas.width !== width) activeCanvas.width = width;
            if (activeCanvas.height !== height) activeCanvas.height = height;
          }
          const sourceTimeSeconds =
            live?.timeSampler.sourceTimestampSeconds ??
            transport.transportSeconds;
          if (
            fallbackPath === "webcodecs-webgpu" ||
            fallbackPath === "webcodecs-webgl2"
          ) {
            const roles = runtime.snapshot().roles;
            for (const role of ["pgm", "prewarm", "overlap"] as const) {
              const clipId = roles[role];
              if (!clipId) {
                decodeScheduler?.disposeLane(role);
                continue;
              }
              const clip = propsRef.current.registry.get(clipId);
              if (!clip) continue;
              const lane = playbackCoordinator.getLane(role);
              decodeScheduler?.syncLane(
                role,
                clip,
                lane?.generation ?? 0,
              );
              if (role === "pgm" && decodeScheduler) {
                void decodeScheduler
                  .ensurePresentationFrame({
                    role,
                    clip,
                    generation: lane?.generation ?? 0,
                    timestampUs: Math.round(
                      sourceTimeSeconds * 1_000_000,
                    ),
                  })
                  .catch(() => {});
              }
            }
          }
          const request: RenderFrameRequest = {
            width: activeCanvas?.width ?? 1,
            height: activeCanvas?.height ?? 1,
            effect: renderEffectForModule(current.pgm),
            accentMode: accentMode(current.params),
            accentEnvelope: live?.accent ? 1 : 0,
            rgbOffset: 0.02,
            mix: Math.min(
              1,
              Math.max(0, (current.params.mix ?? 100) / 100),
            ),
          };
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
            sourceTimeSeconds,
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
        if (
          import.meta.env.DEV &&
          now - lastDomTelemetryAt >= DOM_TELEMETRY_INTERVAL_MS
        ) {
          lastDomTelemetryAt = now;
          document.documentElement.dataset.beatSurferMultiClip =
            JSON.stringify(runtime.snapshotForDomTelemetry());
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
      if (coordinator) {
        mediaEngine.detachDecodeScheduler(coordinator);
      }
      decodeScheduler = null;
      coordinator = null;
      void runtimeRef.current?.dispose();
      runtimeRef.current = null;
      delete (
        window as unknown as {
          __BEAT_SURFER_MULTI_CLIP_QA__?: unknown;
        }
      ).__BEAT_SURFER_MULTI_CLIP_QA__;
      delete document.documentElement.dataset.beatSurferMultiClip;
    };
  }, [props.registry, props.registryVersion]);

  useEffect(() => {
    runtimeRef.current?.select({
      pgm: props.pgm,
      prewarm: props.prewarm,
    });
  }, [
    props.pgm,
    props.prewarm,
    props.registryVersion,
  ]);

  const [activePath, setActivePath] = useState<
    | "webcodecs-webgpu"
    | "webcodecs-webgl2"
    | "html-video-webgl2"
    | "native-static"
  >("native-static");
  const activePathRef = useRef(activePath);
  activePathRef.current = activePath;

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
            opacity: 0,
            zIndex: -1,
            pointerEvents: "none",
          }}
          tabIndex={-1}
          aria-hidden="true"
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
          pointerEvents: "none",
          display:
            props.promoted && activePath === "html-video-webgl2"
              ? "block"
              : "none",
        }}
      />
      <canvas
        ref={webgpuRef}
        data-g007-program-canvas-webgpu
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          display:
            props.promoted && activePath === "webcodecs-webgpu"
              ? "block"
              : "none",
        }}
      />
      <canvas
        ref={webglRef}
        data-g007-program-canvas-webgl
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          display:
            props.promoted && activePath === "webcodecs-webgl2"
              ? "block"
              : "none",
        }}
      />
    </>
  );
}
