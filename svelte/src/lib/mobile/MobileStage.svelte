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

    {#if perform}
      <!-- Landscape puts the readouts on the glass; there is no room beside it. -->
      <div class="overlay">
        <span class="module" style="color:{accent}">{mod?.name ?? ''}</span>
        <span class="meta">MIX {mix}% · {clipName}</span>
      </div>
    {/if}
  </div>

  {#if !perform}
    <div class="readouts">
      <div class="readout-line">
        <span class="dot" style="background:{accent}"></span>
        <span class="module" style="color:{accent}">{mod?.name ?? ''}</span>
        <span class="mix">MIX {mix}%</span>
      </div>
      <div class="kicker">SOURCE</div>
      <div class="clip" title={clipName}>{clipName}</div>
    </div>
  {/if}
</section>

<style>
  /*
    The stage takes the slack instead of leaving it at the bottom.

    It used to be `flex: 0 0 auto` while the transport carried `margin-top:auto`,
    so every spare pixel in the column collected into one dead black band between
    the readouts and the transport — around 370px of nothing on a 812px phone,
    which read as the layout having failed rather than as breathing room.

    The picture is 16:9 and the phone is 9:19.5, so some letterbox is unavoidable
    without cropping the frame the effects are acting on. Centring it makes that
    letterbox symmetric and deliberate rather than a void hanging under the text.
  */
  .stage {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--m-bg, #0a0b0c);
  }

  .picture {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #000;
    border: 1px solid color-mix(in srgb, var(--accent) 28%, #0d0e0f);
    border-radius: 2px;
    overflow: hidden;
    /* The picture is not a scroll surface and not a drag surface — swallowing
       the double-tap delay here keeps taps on the overlay controls crisp. */
    touch-action: manipulation;
  }

  /* Perform posture: the picture is the viewport. `cover` rather than `contain`
     because a phone held sideways is ~19.5:9 and letterboxing a 16:9 render into
     it would hand back the width that rotating just bought. */
  /* Fixed rather than absolute so the stage does not depend on the shell having
     established a containing block — the shell is another agent's file. */
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

  /* Unobtrusive on purpose: a spinner over the picture during a clip swap is a
     bigger interruption than the swap. */
  .loading {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 8px;
    background: linear-gradient(0deg, rgba(10, 11, 12, 0.8), transparent);
    pointer-events: none;
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
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.16em;
    color: #7b8592;
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
    /* Shell tokens rather than raw env(): mobile.css resolves the insets once so
       they cannot be forgotten in one place out of twenty. */
    left: calc(12px + var(--m-safe-left, 0px));
    bottom: calc(10px + var(--m-safe-bottom, 0px));
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.95);
    pointer-events: none;
  }

  .readouts {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .readout-line {
    display: flex;
    align-items: baseline;
    gap: 7px;
    min-width: 0;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 1px;
    flex: 0 0 auto;
    align-self: center;
  }

  .module {
    font-family: var(--font-ui);
    font-size: 17px;
    font-weight: 600;
    letter-spacing: 0.08em;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .mix,
  .meta {
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.14em;
    color: #7b8592;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .mix {
    margin-left: auto;
  }

  .kicker {
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.22em;
    color: #3a4048;
  }

  .clip {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.02em;
    color: #5f6a78;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
