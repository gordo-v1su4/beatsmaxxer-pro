<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { webGpuEngine } from '$lib/rendering/webgpu/WebGpuEngine';

  interface Props {
    id: string;
    color?: [number, number, number];
    class?: string;
  }

  let { id, color = [0.2, 0.5, 0.9], class: className = '' }: Props = $props();

  let canvas: HTMLCanvasElement;
  let ready = $state(false);

  onMount(async () => {
    if (!canvas) return;
    const ok = await webGpuEngine.attachCanvas(id, canvas, color);
    ready = ok;
  });

  onDestroy(() => {
    webGpuEngine.detachCanvas(id);
  });
</script>

<canvas
  bind:this={canvas}
  class="block w-full h-full {className}"
  width={320}
  height={180}
></canvas>
