<script lang="ts">
  import { onMount } from 'svelte';
  import { renderSplashGraphic } from '$lib/rendering/webgpu/SplashGraphic';

  let { onReady }: { onReady: (error?: string) => void } = $props();
  let canvas: HTMLCanvasElement;
  let painted = $state(false);
  onMount(() => {
    const abort = new AbortController();
    let dispose: (() => void) | undefined;
    void renderSplashGraphic([canvas], abort.signal, matchMedia('(prefers-reduced-motion: reduce)').matches)
      .then((cleanup) => {
        dispose = cleanup;
        if (abort.signal.aborted) cleanup();
        else { painted = true; onReady(); }
      })
      .catch((error) => {
        if (!abort.signal.aborted) onReady(error instanceof Error ? error.message : 'The splash graphic could not load.');
      });
    return () => { abort.abort(); dispose?.(); };
  });
</script>

<div class="graphic" class:painted role="img" aria-label="Beatsmaxxer Pro">
  <canvas bind:this={canvas} aria-hidden="true"></canvas>
</div>

<style>
  .graphic {
    position: relative;
    width: min(1200px, 94vw, 145svh);
    aspect-ratio: 2944 / 1648;
    opacity: 0;
  }
  .graphic.painted { opacity: 1; }
  canvas { display: block; width: 100%; height: 100%; }
</style>
