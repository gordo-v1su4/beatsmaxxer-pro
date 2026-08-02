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
  const effectMode = $derived(
    SHADER_EFFECT_MODE[getModuleDef(moduleId)?.shaderKey ?? moduleId] ?? 0
  );

  onMount(async () => {
    if (!canvas) return;
    const ok = await webGpuEngine.attachCanvas(id, canvas, color, moduleId);
    ready = ok;
    if (ok && typeof IntersectionObserver !== 'undefined') {
      visibilityObserver = new IntersectionObserver(([entry]) => {
        webGpuEngine.setCanvasActive(id, entry?.isIntersecting === true);
      });
      visibilityObserver.observe(canvas);
    }
  });

  onDestroy(() => {
    visibilityObserver?.disconnect();
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
