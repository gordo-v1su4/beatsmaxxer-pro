<script lang="ts">
  import WebGpuCanvas from '$lib/components/WebGpuCanvas.svelte';
  import NoGpuPanel from './NoGpuPanel.svelte';
  import MobileMacroPad from './MobileMacroPad.svelte';
  import { parseAccentColor } from '$lib/modules/registry';
  import { moduleParams } from '$lib/stores/rack';
  import { capabilities } from '$lib/stores/capabilities';
  import { activeModule, activeModuleId, stageClip, stageLoading } from './mobileSession';
  import { mobileSpecForModule } from './moduleControlSpecs';
  import { macroPadArmed } from './mobileUi';
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

  /**
   * The pad maps a module's first two continuous parameters, so a module with
   * fewer than two has nothing to offer and the key is not shown at all —
   * better than an armed control that visibly does nothing.
   */
  const padAxes = $derived(mobileSpecForModule($activeModuleId)?.sliders ?? []);
  const padUsable = $derived(padAxes.length >= 2);
  const padLabel = $derived(
    padUsable ? `${padAxes[0]!.label} / ${padAxes[1]!.label}` : ''
  );

  function toggleMacroPad() {
    macroPadArmed.update((armed) => !armed);
    navigator.vibrate?.(12);
    wake();
  }

  /**
   * Landscape only: has the surface been touched recently?
   *
   * In perform posture the readout has nowhere to go but on top of the picture,
   * so instead of taking space permanently it fades back after a few seconds
   * and returns on the next touch. Portrait never reads this — the row lives
   * under the frame there and costs nothing to leave visible.
   */
  const IDLE_FADE_MS = 3200;
  let recentlyTouched = $state(true);
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  function wake() {
    recentlyTouched = true;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { recentlyTouched = false; }, IDLE_FADE_MS);
  }

  $effect(() => {
    if (!perform) {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
      recentlyTouched = true;
      return;
    }
    wake();
    const onTouch = () => wake();
    window.addEventListener('pointerdown', onTouch, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onTouch);
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
    };
  });
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

    {#if !gpuBlocked}
      <MobileMacroPad {accent} />
    {/if}

    {#if !gpuBlocked && ($stageLoading || probing)}
      <div class="loading" role="status">
        <span class="loading-bar" style="background:{accent}"></span>
        <span class="loading-text">{$stageLoading ? 'LOADING CLIP' : 'STARTING GPU'}</span>
      </div>
    {/if}
  </div>

  <!--
      Portrait puts this row UNDER the picture; only landscape floats it on the
      glass. It used to float in both, which was wrong in portrait for a reason
      that got worse when the XY key arrived: at 375px the frame is 351x197, so
      a 44px key plus its padding was covering close to a third of the picture
      — permanently, to say things that are not urgent. Portrait has unused
      height below the frame (the picture is 16:9 inside a column that is taller
      than that), so the row costs nothing there and the frame stays whole.

      Landscape is the opposite: the picture is the entire viewport, there is no
      "below", and floating is the only option. So it stays on the glass there
      and fades out once you stop touching it.
    -->
    <div class="overlay" class:floating={perform} class:dim={perform && !recentlyTouched}>
      <span class="dot" style="background:{accent}"></span>
      <div class="overlay-copy">
        <span class="module" style="color:{accent}">{mod?.name ?? ''}</span>
        <span class="meta">
          {#if $macroPadArmed && padUsable}{padLabel}{:else}MIX {mix}% · {clipName}{/if}
        </span>
      </div>

      {#if padUsable && !gpuBlocked}
        <button
          type="button"
          class="xy"
          style="--accent:{accent}"
          data-armed={$macroPadArmed}
          aria-pressed={$macroPadArmed}
          aria-label="Play {padLabel} from the picture"
          onclick={toggleMacroPad}
        >
          XY
        </button>
      {/if}
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

  /* Portrait: an ordinary row under the frame. No tint, no blur, nothing over
     the picture — the space it occupies was empty anyway. */
  .overlay {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 0 0 auto;
    padding: 8px 2px 0;
  }

  /* Landscape: the picture is the whole viewport, so there is no "below" and
     this has to float. Kept to text and one key, with no panel behind it. */
  .overlay.floating {
    position: absolute;
    left: calc(12px + var(--m-safe-left, 0px));
    right: calc(12px + var(--m-safe-right, 0px));
    bottom: calc(10px + var(--m-safe-bottom, 0px));
    padding: 0;
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.95);
    /* Above the macro pad, which covers the picture at z-index 3 -- otherwise
       the pad swallows the one control that disarms it. The row itself stays
       transparent to pointers so every stroke that is not on the key still
       reaches the pad. */
    pointer-events: none;
    z-index: 4;
    transition: opacity 420ms var(--m-ease, ease);
  }
  .overlay.floating > .xy {
    pointer-events: auto;
  }

  /* Performing means watching, so the chrome gets out of the way on its own a
     few seconds after the last touch, and comes straight back on the next one. */
  .overlay.floating.dim {
    opacity: 0.28;
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

  /*
    The one key that lives on the glass.

    44px square so it clears the tap minimum without a padded row around it, and
    pushed to the trailing edge so it is under a thumb rather than over the
    frame's centre. Armed state is carried by the accent fill, not by a label
    change: the readout beside it already switches to naming the two parameters
    the picture is now playing, which says more than "ON" would.
  */
  .xy {
    flex: 0 0 auto;
    margin-left: auto;
    width: var(--m-tap, 44px);
    height: var(--m-tap, 44px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--accent) 30%, #2a2e34);
    border-radius: var(--m-radius, 2px);
    background: rgba(10, 12, 14, 0.62);
    color: var(--m-ink-dim, #8a93a0);
    font-family: var(--font-ui);
    font-size: var(--m-text-sm, 12px);
    font-weight: 600;
    letter-spacing: 0.14em;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition:
      background var(--m-dur-fast, 120ms) var(--m-ease, ease),
      color var(--m-dur-fast, 120ms) var(--m-ease, ease),
      border-color var(--m-dur-fast, 120ms) var(--m-ease, ease);
  }
  .xy[data-armed='true'] {
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    background: color-mix(in srgb, var(--accent) 20%, rgba(10, 12, 14, 0.7));
    color: var(--accent);
    box-shadow: 0 0 14px color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .xy:active {
    background: rgba(20, 23, 26, 0.8);
  }

  @media (prefers-reduced-motion: reduce) {
    .xy {
      transition: none;
    }
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
