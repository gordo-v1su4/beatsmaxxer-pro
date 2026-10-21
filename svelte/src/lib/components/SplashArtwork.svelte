<script lang="ts">
  import { onMount } from 'svelte';
  import { renderSplashGraphic } from '$lib/rendering/webgpu/SplashGraphic';
  import { isMobileShell } from '$lib/mobile/mobileEnv';
  import { base } from '$app/paths';

  let { onReady }: { onReady: (error?: string) => void } = $props();
  let canvas = $state<HTMLCanvasElement>();
  let painted = $state(false);
  onMount(() => {
    // A phone gets one GPU surface: the performance stage. Its title card must
    // not depend on compiling a second VHS pipeline or submitting GPU work.
    if ($isMobileShell || !canvas) return;
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
  {#if $isMobileShell}
    <!-- Settled desktop artwork; a separate image avoids inflating startup JS. -->
    <img src={`${base}/splash-mobile-v1.png`} alt="" aria-hidden="true"
      onload={() => { painted = true; onReady(); }}
      onerror={() => onReady('The title artwork could not load. Reload to try again.')} />
  {:else}
    <canvas bind:this={canvas} aria-hidden="true"></canvas>
  {/if}
</div>

<style>
  .graphic {
    position: relative;
    width: min(1200px, 94vw, 145svh);
    aspect-ratio: 2944 / 1648;
    opacity: 0;
  }
  .graphic.painted { opacity: 1; }
  canvas, img { display: block; width: 100%; height: 100%; }
</style>
