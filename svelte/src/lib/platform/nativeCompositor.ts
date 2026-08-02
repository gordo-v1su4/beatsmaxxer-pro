import { isDesktopNativeDecodeEnabled } from '$lib/platform/desktopDecode';
import { isTauriRuntime } from '$lib/platform/runtime';

interface NativeSurfaceRect {
  surfaceId: string;
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
      const rect = canvas.getBoundingClientRect();
      const style = getComputedStyle(canvas);
      rects.push({
        surfaceId,
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
  mutationObserver = new MutationObserver(observeCanvases);
  mutationObserver.observe(document.body, { childList: true, subtree: true });
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
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule, true);
  };
}
