<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getModuleDef } from '$lib/modules/catalog';
  import { webGpuEngine } from '$lib/rendering/webgpu/WebGpuEngine';
  import { SHADER_EFFECT_MODE } from '$lib/rendering/webgpu/shaders/moduleFx.wgsl';

  interface Props {
    id: string;
    moduleId?: string;
    color?: [number, number, number];
    class?: string;
  }

  let { id, moduleId = id, color = [0.2, 0.5, 0.9], class: className = '' }: Props = $props();

  let canvas: HTMLCanvasElement;
  let ready = $state(false);
  let visibilityObserver: IntersectionObserver | null = null;
  let sizeObserver: ResizeObserver | null = null;
  /** Pending coalesced resize; 0 when none is queued. */
  let resizeRaf = 0;
  const effectMode = $derived(
    SHADER_EFFECT_MODE[getModuleDef(moduleId)?.shaderKey ?? moduleId] ?? 0
  );

  /**
   * Every canvas used to carry a hardcoded 320x180 backing store and get
   * CSS-stretched to fill its box. On a 1.5x display the PGM monitor is around
   * 926x521 real pixels, so the program output — the thing being judged and
   * recorded — was a 320x180 render blown up nearly 3x. That is the softness and
   * the fringing around text and edges; nothing was compressing it.
   *
   * The rack previews stay deliberately small: ten of them run continuously at a
   * reduced frame rate, and their job is to tell you what a module is doing, not
   * to be judged for sharpness. PGM renders at true device resolution.
   */
  const PREVIEW_SIZE = { width: 320, height: 180 };
  /**
   * 720p, not 1080p.
   *
   * PGM is where the pixels actually are. Ten preview canvases at a fixed
   * 320x180 come to 576k pixels between them, are capped at previewTargetFps,
   * and are skipped entirely when off-screen or unchanged. PGM alone was up to
   * 1920x1080 — 2.07M pixels, roughly 3.6x the whole rack — and it is never
   * throttled. Every module's fragment cost is dominated by this one number.
   *
   * At 1280x720 that drops to 921k pixels: about 2.25x less fragment work for
   * every effect at once, which beats any per-effect micro-optimisation. It also
   * shrinks the feedback textures attachCanvas sizes off the canvas (STUTTER's
   * hold buffer and the ping-pong pair) by the same factor, so it is a memory
   * win as well as a speed one.
   *
   * The source is 16:9 video scaled to fit, so this is a resample rather than a
   * crop. Raise it back if the softening shows on a large display.
   */
  const PGM_MAX_WIDTH = 1280;

  function targetSize() {
    if (id !== 'pgm') return PREVIEW_SIZE;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return PREVIEW_SIZE;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(1, PGM_MAX_WIDTH / (rect.width * dpr));
    return {
      width: Math.max(320, Math.round(rect.width * dpr * scale)),
      height: Math.max(180, Math.round(rect.height * dpr * scale))
    };
  }

  /** Returns true when the backing store actually changed. */
  function applySize() {
    const { width, height } = targetSize();
    if (canvas.width === width && canvas.height === height) return false;
    canvas.width = width;
    canvas.height = height;
    return true;
  }

  async function attach() {
    const ok = await webGpuEngine.attachCanvas(id, canvas, color, moduleId);
    ready = ok;
    return ok;
  }

  onMount(async () => {
    if (!canvas) return;
    applySize();
    const ok = await attach();
    if (ok && typeof IntersectionObserver !== 'undefined') {
      visibilityObserver = new IntersectionObserver(([entry]) => {
        webGpuEngine.setCanvasActive(id, entry?.isIntersecting === true);
      });
      visibilityObserver.observe(canvas);
    }
    // Only PGM is layout-sized, so only PGM needs to follow its box. Re-attaching
    // is the reallocation path: attachCanvas already destroys and rebuilds the
    // uniform buffer and both feedback textures, which are sized off the canvas.
    //
    // Coalesced to one attach per frame. A phone's URL bar collapsing is a
    // continuous resize, not a single one, and every intermediate width used to
    // reconfigure the swapchain and reallocate both feedback textures — mid
    // performance, while the picture is live. Deferring to rAF means the run of
    // resizes costs one reallocation at the size the box actually settles on.
    if (ok && id === 'pgm' && typeof ResizeObserver !== 'undefined') {
      sizeObserver = new ResizeObserver(() => {
        if (resizeRaf !== 0) return;
        resizeRaf = requestAnimationFrame(() => {
          resizeRaf = 0;
          if (applySize()) void attach();
        });
      });
      sizeObserver.observe(canvas);
    }
  });

  onDestroy(() => {
    visibilityObserver?.disconnect();
    sizeObserver?.disconnect();
    if (resizeRaf !== 0) cancelAnimationFrame(resizeRaf);
    webGpuEngine.detachCanvas(id);
  });

  $effect(() => {
    if (!ready || id === 'pgm') return;
    webGpuEngine.setCanvasModule(id, moduleId);
    webGpuEngine.setCanvasAccent(id, color);
  });
</script>

<canvas
  bind:this={canvas}
  data-canvas-id={id}
  data-native-module-id={moduleId}
  data-native-effect-mode={effectMode}
  class="block w-full h-full {className}"
  width={320}
  height={180}
></canvas>

<!--
  The width/height attributes above are only the pre-mount placeholder; onMount
  replaces them with the real device-pixel size before the engine attaches, so
  the swapchain is configured once at the correct resolution.
-->
