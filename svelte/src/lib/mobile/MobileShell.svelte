<script lang="ts">
  import { onMount } from 'svelte';
  import MobileTopBar from './MobileTopBar.svelte';
  import MobileStage from './MobileStage.svelte';
  import MobileTransport from './MobileTransport.svelte';
  import MobileModuleSheet from './MobileModuleSheet.svelte';
  import MobileDrawer from './MobileDrawer.svelte';
  import RotateHint from './RotateHint.svelte';
  import DesktopNote from './DesktopNote.svelte';
  import { isPerformPosture, orientation } from './mobileEnv';
  import { enterMobileSession, startMobileClipAdvance } from './mobileSession';
  import { sheetState } from './mobileUi';

  /**
   * The phone surface.
   *
   * This is a sibling of the desktop rack, not a reflow of it. The rack is five
   * 420px modules per row plus 361px of rails — 2552px — and eleven live WebGPU
   * canvases. Squeezing that into 375px produces neither a usable rack nor a
   * usable phone app, so the two shells share the engine and nothing else.
   *
   * Everything here reads from stores; no props are threaded down. That keeps
   * the composition flat enough to rearrange as the layout gets revised.
   */

  onMount(() => {
    // Collapses the rack to one slot and restores it if the viewport grows back
    // past the mobile threshold — which happens on every desktop review pass.
    const restore = enterMobileSession();
    // LINEAR/RANDOM are inert without something to move them on; the clip never
    // ends by itself because rack video loops.
    const stopAdvance = startMobileClipAdvance();
    // The sheet resting at `peek` is the shell's home state: the grabber is
    // visible, the picture is not covered, and one drag opens the controls.
    sheetState.set('peek');
    return () => {
      stopAdvance();
      restore();
    };
  });
</script>

<div
  class="mobile-shell"
  class:is-perform={$isPerformPosture}
  data-orientation={$orientation}
>
  <MobileTopBar />

  <main class="mobile-body">
    <MobileStage />
    {#if !$isPerformPosture}
      <MobileTransport />
    {/if}
  </main>

  <!-- Overlays are siblings of the body, not children of it: each one positions
       against the viewport, and nesting them inside a scrolling column made the
       sheet's drag maths depend on scroll position. -->
  <MobileModuleSheet />
  <MobileDrawer />
  <RotateHint />
  <DesktopNote />

  {#if $isPerformPosture}
    <!-- Landscape keeps the transport, but floating over the picture rather
         than taking a band of layout height from it. -->
    <div class="mobile-perform-transport">
      <MobileTransport />
    </div>
  {/if}
</div>

<style>
  .mobile-shell {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--rack-bg);
    color: #e5e7eb;
    font-family: var(--font-ui);
    overflow: hidden;
    /* The one place the app opts out of the browser's touch defaults wholesale.
       Every draggable control below re-declares its own touch-action; without
       this baseline a slider drag scrolls the page instead. */
    touch-action: manipulation;
    overscroll-behavior: none;
    -webkit-tap-highlight-color: transparent;
  }

  .mobile-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  /* Landscape hands the whole viewport to the picture and floats the chrome. */
  .mobile-shell.is-perform .mobile-body {
    position: absolute;
    inset: 0;
  }

  .mobile-perform-transport {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: linear-gradient(180deg, rgba(10, 11, 12, 0), rgba(10, 11, 12, 0.86) 45%);
    pointer-events: none;
  }
  .mobile-perform-transport :global(> *) {
    pointer-events: auto;
  }
</style>
