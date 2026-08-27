<script lang="ts">
  import WebGpuCanvas from '$lib/components/WebGpuCanvas.svelte';
  import NoGpuPanel from './NoGpuPanel.svelte';
  import { parseAccentColor } from '$lib/modules/registry';
  import { moduleParams } from '$lib/stores/rack';
  import { capabilities } from '$lib/stores/capabilities';
  import { activeModule, activeModuleId, stageClip, stageLoading } from './mobileSession';
  import { isPerformPosture } from './mobileEnv';

  /**
   * The one live surface on the phone.
   *
   * The desktop mounts eleven WebGPU canvases — ten previews plus PGM. This
   * mounts exactly one, and that is the entire performance budget: everywhere
   * else the phone would show a module preview it shows a poster instead. If a
   * second `<WebGpuCanvas>` ever appears in the mobile tree, that decision has
   * been undone.
   */

  const mod = $derived($activeModule);
  const accent = $derived(mod?.accentColor ?? '#38bdf8');
  const accentRgb = $derived(parseAccentColor(accent));
  const mix = $derived(Math.round($moduleParams[$activeModuleId]?.mix ?? 50));
  const clipName = $derived($stageClip?.name ?? 'TEST PATTERN');

  /**
   * `capabilities` starts at `renderer: 'checking'` with `webgpu: false`, so
   * reading `webgpu` alone would flash the no-GPU panel on every cold load while
   * the probe is still in flight. The panel keys off the settled failure; the
   * probe itself just reads as the picture not being up yet.
   */
  const gpuBlocked = $derived($capabilities.renderer === 'webgpu_unavailable');
  const probing = $derived($capabilities.renderer === 'checking');
  const perform = $derived($isPerformPosture);
</script>

<!--
  One markup, two postures. Branching the canvas on orientation would unmount and
  re-attach the WebGPU context on every rotation — a black frame and a fresh
  swapchain at exactly the moment the operator is turning the phone to perform.
-->
<section class="stage" class:perform>
  <div class="picture" style="--accent:{accent}">
    {#if gpuBlocked}
      <!-- The styled still, not a black box. Owned by the shell's own file so
           this and the drawer tell the same story; the canvas is deliberately
           never mounted on this branch. -->
      <NoGpuPanel />
    {:else}
      <WebGpuCanvas id="pgm" moduleId={$activeModuleId} color={accentRgb} class="stage-canvas" />
    {/if}

    {#if !gpuBlocked && ($stageLoading || probing)}
      <div class="loading" role="status">
        <span class="loading-bar" style="background:{accent}"></span>
        <span class="loading-text">{$stageLoading ? 'LOADING CLIP' : 'STARTING GPU'}</span>
      </div>
    {/if}

    <!-- Readouts live on the glass so the picture keeps every spare pixel.
         Portrait used to spend a whole column under the frame on the same facts. -->
    <div class="overlay">
      <span class="dot" style="background:{accent}"></span>
      <div class="overlay-copy">
        <span class="module" style="color:{accent}">{mod?.name ?? ''}</span>
        <span class="meta">MIX {mix}% · {clipName}</span>
      </div>
    </div>
  </div>
</section>

<style>
  .stage {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 0;
    padding: 10px 12px 8px;
    background: transparent;
  }

  .picture {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #000;
    border: 1px solid color-mix(in srgb, var(--accent) 22%, #121416);
    border-radius: var(--m-radius, 12px);
    overflow: hidden;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.4),
      0 18px 40px rgba(0, 0, 0, 0.45);
    touch-action: manipulation;
  }

  .stage.perform {
    position: fixed;
    inset: 0;
    z-index: 0;
    padding: 0;
    gap: 0;
  }
  .stage.perform .picture {
    position: absolute;
    inset: 0;
    width: auto;
    aspect-ratio: auto;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }
  .stage.perform :global(.stage-canvas) {
    object-fit: cover;
  }

  .picture :global(.stage-canvas) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  .loading {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px 12px;
    background: linear-gradient(0deg, rgba(10, 11, 12, 0.78), transparent);
    pointer-events: none;
    z-index: 2;
  }
  .loading-bar {
    width: 22px;
    height: 2px;
    border-radius: 1px;
    opacity: 0.9;
    animation: stage-pulse 900ms ease-in-out infinite;
  }
  .loading-text {
    font-family: var(--font-ui);
    font-size: var(--m-text-xs, 11px);
    font-weight: 500;
    letter-spacing: 0.16em;
    color: var(--m-ink-dim, #8a93a0);
  }
  @keyframes stage-pulse {
    0%,
    100% {
      opacity: 0.25;
      transform: scaleX(0.5);
    }
    50% {
      opacity: 1;
      transform: scaleX(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .loading-bar {
      animation: none;
    }
  }

  .overlay {
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 8px 10px;
    border-radius: var(--m-radius, 2px);
    /* Sits directly on the canvas, so no backdrop-filter — see
       --m-blur-over-picture. The tint is carried a little heavier to make up
       the separation the blur was providing. */
    background: rgba(8, 9, 10, 0.42);
    backdrop-filter: var(--m-blur-over-picture, none);
    -webkit-backdrop-filter: var(--m-blur-over-picture, none);
    pointer-events: none;
    z-index: 1;
  }

  .stage.perform .overlay {
    left: calc(12px + var(--m-safe-left, 0px));
    right: calc(12px + var(--m-safe-right, 0px));
    bottom: calc(10px + var(--m-safe-bottom, 0px));
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    padding: 0;
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.95);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: 0 0 auto;
    box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 55%, transparent);
  }

  .overlay-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .module {
    font-family: var(--font-ui);
    font-size: var(--m-text-lg, 15px);
    font-weight: 600;
    letter-spacing: 0.08em;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .meta {
    font-family: var(--font-ui);
    font-size: var(--m-text-xs, 11px);
    font-weight: 500;
    letter-spacing: 0.12em;
    color: var(--m-ink-dim, #8a93a0);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
