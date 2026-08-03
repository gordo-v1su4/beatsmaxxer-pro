import { get } from 'svelte/store';
import { getModuleDef } from '$lib/modules/catalog';
import { parseAccentColor } from '$lib/modules/registry';
import { isDesktopNativeDecodeEnabled } from '$lib/platform/desktopDecode';
import { isTauriRuntime } from '$lib/platform/runtime';
import { SHADER_EFFECT_MODE } from '$lib/rendering/webgpu/shaders/moduleFx.wgsl';
import { pgmSource } from '$lib/stores/pgm';
import { moduleParams, rackBottom, rackTop } from '$lib/stores/rack';

interface NativeSurfaceRect {
  surfaceId: string;
  effectModuleId: string;
  effectMode: number;
  mix: number;
  p0: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  p5: number;
  p6: number;
  p7: number;
  p8: number;
  p9: number;
  accentR: number;
  accentG: number;
  accentB: number;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

function nativeEffectParams(moduleId: string) {
  const def = getModuleDef(moduleId);
  const params = get(moduleParams)[moduleId] ?? {};
  const values = (() => {
    switch (def?.shaderKey ?? moduleId) {
      case 'transition': return [params.mix, params.amount, params.duration, params.type, params.interval];
      case 'speedramp': return [params.mix, params.spdMax, params.spdMin, params.len, 50];
      case 'tapdelay': return [params.mix, params.time, params.feedback, params.feel, 50];
      case 'timesampler': return [params.mix, params.rate, params.slices, params.size, 50];
      case 'punch': return [params.mix, params.amt, params.dir, params.snap, 50];
      case 'shake': return [params.mix, params.hand, params.impact, params.sway, 50];
      case 'orbit': return [params.mix, params.spd, params.drift, params.nudge, 50];
      case 'focus': return [params.mix, params.amt, params.pulse, params.soft, params.xeye];
      case 'anamorphic': return [params.mix, params.bars, params.squeeze, params.flare, 50];
      case 'grain': return [params.mix, params.size, params.amount, params.drift, 50];
      case 'leak': return [params.mix, params.edge, params.warmth, params.drift, 50];
      case 'dutch': return [params.mix, params.tilt, params.drift, params.snap, 50];
      case 'halation': return [params.mix, params.threshold, params.spread, params.tint, 50];
      case 'bulge': return [params.mix, params.amount, params.center, params.falloff, 50];
      case 'vhs': return [params.mix, params.tracking, params.chroma, params.noise, params.beat];
      case 'prism': return [params.mix, params.split, params.angle, params.edge, 50];
      case 'streak': return [params.mix, params.length, params.angle, params.decay, 50];
      case 'mirror': return [params.mix, params.fold, params.offset, params.spin, params.beat];
      case 'lens': return [params.mix, params.amount, params.zoom, params.edge, params.beat];
      default: return [params.mix, params.amount ?? params.amt, params.feedback ?? params.drift,
        params.tracking ?? params.squeeze, params.noise];
    }
  })();
  const accent = parseAccentColor(def?.accentColor ?? '#38bdf8');
  const speedRampShape = moduleId === 'speedramp'
    ? [params.bzY0, params.bzX1, params.bzY1, params.bzX2, params.bzY2, params.bzY3]
    : [50, 50, 50, 50, 50, 50];
  return {
    mix: values[0] ?? 100,
    p0: values[1] ?? 50,
    p1: values[2] ?? 50,
    p2: values[3] ?? 50,
    p3: values[4] ?? 50,
    p4: speedRampShape[0] ?? 100,
    p5: speedRampShape[1] ?? 35,
    p6: speedRampShape[2] ?? 0,
    p7: speedRampShape[3] ?? 65,
    p8: speedRampShape[4] ?? 0,
    p9: speedRampShape[5] ?? 100,
    accentR: accent[0],
    accentG: accent[1],
    accentB: accent[2]
  };
}

/**
 * Send layout metadata to the Rust compositor. This bridge never transports
 * video pixels and emits only after layout/visibility changes.
 */
export function startNativeCompositorBridge() {
  if (!isTauriRuntime() || !isDesktopNativeDecodeEnabled()) return () => {};

  let disposed = false;
  let pendingSync: ReturnType<typeof setTimeout> | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let mutationObserver: MutationObserver | null = null;
  let storeUnsubscribers: Array<() => void> = [];

  const moduleForSurface = (surfaceId: string) => {
    if (surfaceId === 'pgm') return get(pgmSource);
    const match = /^(top|bottom)-(\d+)$/.exec(surfaceId);
    if (!match) return '';
    const index = Number(match[2]);
    return (match[1] === 'top' ? get(rackTop) : get(rackBottom))[index] ?? '';
  };

  const schedule = () => {
    if (disposed || pendingSync !== null) return;
    // WKWebView suppresses rAF when the native window is occluded. A bounded
    // timer still coalesces rapid control gestures but cannot strand the final
    // parameter value before a quantized cut or headed background proof.
    pendingSync = setTimeout(() => {
      pendingSync = null;
      void syncLayout();
    }, 0);
  };

  const observeCanvases = () => {
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(document.documentElement);
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>('canvas[data-canvas-id]')) {
      resizeObserver.observe(canvas);
    }
    schedule();
  };

  const syncLayout = async () => {
    if (disposed) return;
    const scale = window.devicePixelRatio || 1;
    const rects: NativeSurfaceRect[] = [];
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>('canvas[data-canvas-id]')) {
      const surfaceId = canvas.dataset.canvasId;
      if (!surfaceId) continue;
      const effectModuleId = moduleForSurface(surfaceId) || canvas.dataset.nativeModuleId || '';
      const effectMode = SHADER_EFFECT_MODE[
        getModuleDef(effectModuleId)?.shaderKey ?? effectModuleId
      ] ?? Number(canvas.dataset.nativeEffectMode ?? 0);
      const effectParams = nativeEffectParams(effectModuleId);
      const rect = canvas.getBoundingClientRect();
      const style = getComputedStyle(canvas);
      rects.push({
        surfaceId,
        effectModuleId,
        effectMode,
        ...effectParams,
        x: Math.round(rect.left * scale),
        y: Math.round(rect.top * scale),
        width: Math.round(rect.width * scale),
        height: Math.round(rect.height * scale),
        visible:
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width >= 2 &&
          rect.height >= 2 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth
      });
    }
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('update_native_compositor_layout', {
      viewportWidth: Math.max(1, Math.round(window.innerWidth * scale)),
      viewportHeight: Math.max(1, Math.round(window.innerHeight * scale)),
      rects
    });
    const params = new URLSearchParams(window.location.search);
    if (params.get('nativeCompositorProof') === '1') {
      await invoke('set_native_compositor_test_pattern', { enabled: true });
    }
  };

  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, true);
  mutationObserver = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === 'childList')) {
      observeCanvases();
      return;
    }
    // Effect swaps only change two data attributes. Send them immediately so
    // Rust can select the new shader on the next native presentation.
    void syncLayout();
  });
  mutationObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-native-module-id', 'data-native-effect-mode'],
    childList: true,
    subtree: true
  });
  // Store notifications are synchronous with drag/drop and quantized PGM
  // promotion. They bypass Svelte DOM flush latency, while the payload remains
  // layout/effect metadata only—never video pixels.
  storeUnsubscribers = [
    rackTop.subscribe(() => void syncLayout()),
    rackBottom.subscribe(() => void syncLayout()),
    pgmSource.subscribe(() => void syncLayout()),
    // Parameter gestures can emit much faster than the display. Coalesce them
    // to one latest-value native control update per animation frame.
    moduleParams.subscribe(schedule)
  ];
  observeCanvases();
  // Register the already-mounted canvases immediately. A macOS WKWebView may
  // defer requestAnimationFrame while its window is being activated; native
  // video presentation must not depend on that first foreground frame.
  void syncLayout();

  return () => {
    disposed = true;
    if (pendingSync !== null) clearTimeout(pendingSync);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    for (const unsubscribe of storeUnsubscribers) unsubscribe();
    storeUnsubscribers = [];
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule, true);
  };
}
