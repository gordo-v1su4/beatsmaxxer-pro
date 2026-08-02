import { get } from 'svelte/store';
import { getModuleDef } from '$lib/modules/catalog';
import { isDesktopNativeDecodeEnabled } from '$lib/platform/desktopDecode';
import { isTauriRuntime } from '$lib/platform/runtime';
import { SHADER_EFFECT_MODE } from '$lib/rendering/webgpu/shaders/moduleFx.wgsl';
import { pgmSource } from '$lib/stores/pgm';
import { rackBottom, rackTop } from '$lib/stores/rack';

interface NativeSurfaceRect {
  surfaceId: string;
  effectModuleId: string;
  effectMode: number;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

/**
 * Send layout metadata to the Rust compositor. This bridge never transports
 * video pixels and emits only after layout/visibility changes.
 */
export function startNativeCompositorBridge() {
  if (!isTauriRuntime() || !isDesktopNativeDecodeEnabled()) return () => {};

  let disposed = false;
  let pendingFrame = 0;
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
    if (disposed || pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      void syncLayout();
    });
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
      const rect = canvas.getBoundingClientRect();
      const style = getComputedStyle(canvas);
      rects.push({
        surfaceId,
        effectModuleId,
        effectMode,
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
    pgmSource.subscribe(() => void syncLayout())
  ];
  observeCanvases();
  // Register the already-mounted canvases immediately. A macOS WKWebView may
  // defer requestAnimationFrame while its window is being activated; native
  // video presentation must not depend on that first foreground frame.
  void syncLayout();

  return () => {
    disposed = true;
    if (pendingFrame) cancelAnimationFrame(pendingFrame);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    for (const unsubscribe of storeUnsubscribers) unsubscribe();
    storeUnsubscribers = [];
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule, true);
  };
}
