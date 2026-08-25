<script lang="ts">
  /**
   * The module editor is a sheet over the picture, not a screen you go to.
   *
   * The whole product idea is that the clip keeps playing while you dial the
   * effect — you are watching it land, not remembering what it looked like. So
   * this never covers the frame: portrait leaves the top 38% of the viewport
   * showing, and landscape abandons the bottom-sheet shape entirely and becomes
   * a right-hand panel, because a sheet rising from the bottom of a 390px-tall
   * viewport would swallow the picture it exists to serve.
   *
   * Gestures, from one pointer stream (see `swipe.ts`):
   *   grabber, along the sheet's own axis  — drag the sheet open/closed
   *   grabber, across it                   — page to the next module
   *   body, horizontally                   — page to the next module
   *   body, vertically                     — native scroll (touch-action: pan-y)
   *
   * Landscape peek is a separate right-edge rail rather than the sheet's own
   * grabber poking out: the grabber is a horizontal row at the top of the panel,
   * and a 76px-wide slice of it shows one corner and no name.
   *
   * Takes no props. The shell renders `<MobileModuleSheet />` and everything it
   * needs is in the stores.
   */
  import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from '@lucide/svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { sheetState, sheetDragY } from './mobileUi';
  import { isPerformPosture } from './mobileEnv';
  import { activeModule, activeModuleIndex, MOBILE_MODULE_IDS, pageModule } from './mobileSession';
  import { moduleParams, bypassed, toggleBypass } from '$lib/stores/rack';
  import { swipe, committed, type SwipeAxis, type SwipeEnd } from './swipe';
  import MobileModuleControls from './MobileModuleControls.svelte';

  /** Height of the resting grabber rail, and the sheet's peek offset in portrait.
   *  Keep in lockstep with --m-sheet-peek in mobile.css. */
  const PEEK_PX = 64;

  const landscape = $derived($isPerformPosture);
  const mod = $derived($activeModule);
  const accent = $derived(mod.accentColor);
  const params = $derived($moduleParams[mod.id] ?? {});
  const mix = $derived(Math.round(params.mix ?? 100));

  /**
   * Measured, not computed from vh.
   *
   * `62vh` and `innerHeight * 0.62` disagree on any phone with a collapsing
   * URL bar, and the gap shows up as a peek rail that sits a few px too high or
   * a drag that never quite reaches the closed stop.
   */
  let sheetW = $state(0);
  let sheetH = $state(0);
  const span = $derived(Math.max(1, landscape ? sheetW : sheetH));

  let dragging = $state(false);
  /** Live cross-axis travel, so paging reads as motion while the finger moves. */
  let pageDx = $state(0);
  /** Which way the last page went, so the incoming module flies in from the right side. */
  let pageDir = $state(1);

  function baseOffset(state: string, s: number): number {
    if (state === 'full') return 0;
    // Landscape peek parks the panel fully off-screen; the rail below stands in
    // for it. Portrait peek leaves the grabber showing.
    if (state === 'peek') return landscape ? s : Math.max(0, s - PEEK_PX);
    return s;
  }

  const offset = $derived(
    Math.max(0, Math.min(span, baseOffset($sheetState, span) + $sheetDragY))
  );
  const transform = $derived(
    landscape ? `translate3d(${offset}px,0,0)` : `translate3d(0,${offset}px,0)`
  );

  /** The axis the sheet itself travels on. The other one pages. */
  const positionAxis: SwipeAxis = $derived(landscape ? 'x' : 'y');

  /** A rail stands in for the sheet whenever the sheet's own grabber is off-screen. */
  const showRail = $derived($sheetState === 'closed' || (landscape && $sheetState === 'peek'));

  /**
   * Directional commit. `committed` treats a flick as symmetric, which is right
   * for paging and wrong here: a fast upward flick that ends 5px low must not
   * read as "closed" just because both magnitudes cleared their thresholds.
   */
  function fired(travel: number, velocity: number, direction: 1 | -1, distance: number): boolean {
    return travel * direction >= distance || velocity * direction >= 0.45;
  }

  function goto(delta: number) {
    pageDir = delta > 0 ? 1 : -1;
    pageModule(delta);
  }

  function settle(travel: number, velocity: number) {
    dragging = false;
    sheetDragY.set(0);
    // 35% of the distance the sheet had left to travel, floored so a short
    // sheet on a small phone still needs a deliberate push.
    const open = Math.max(48, (span - PEEK_PX) * 0.35);
    const state = $sheetState;
    if (state === 'full') {
      if (fired(travel, velocity, 1, open)) sheetState.set('peek');
    } else if (state === 'peek') {
      if (fired(travel, velocity, -1, open)) sheetState.set('full');
      else if (fired(travel, velocity, 1, 44)) sheetState.set('closed');
    } else if (fired(travel, velocity, -1, 24)) {
      sheetState.set('peek');
    }
  }

  function finishPage(travel: number, velocity: number) {
    pageDx = 0;
    if (committed(travel, velocity, 60, 0.4)) goto(travel < 0 ? 1 : -1);
  }

  function along(axis: SwipeAxis, dx: number, dy: number): number {
    return axis === 'x' ? dx : dy;
  }

  function onGrabLock(axis: SwipeAxis) {
    if (axis === positionAxis) dragging = true;
  }

  function onGrabMove(axis: SwipeAxis, dx: number, dy: number) {
    if (axis === positionAxis) sheetDragY.set(along(axis, dx, dy));
    else pageDx = along(axis, dx, dy);
  }

  function onGrabEnd(end: SwipeEnd, tapOpens: boolean) {
    if (end.axis === null) {
      if (tapOpens) toggleSheet();
      return;
    }
    const travel = along(end.axis, end.dx, end.dy);
    if (end.axis === positionAxis) settle(travel, end.velocity);
    else finishPage(travel, end.velocity);
  }

  function toggleSheet() {
    sheetState.update((s) => (s === 'full' ? 'peek' : 'full'));
  }

  const grabOptions = $derived({
    // Buttons living in the grabber get their taps back; there is plenty of
    // rail left to drag from.
    ignore: '[data-swipe-ignore], button',
    onLock: onGrabLock,
    onMove: onGrabMove,
    onEnd: (end: SwipeEnd) => onGrabEnd(end, true)
  });

  const railOptions = $derived({
    onLock: onGrabLock,
    onMove: onGrabMove,
    // The rail is a real button, so its tap arrives as a click. Handling it here
    // as well would toggle the sheet twice.
    onEnd: (end: SwipeEnd) => onGrabEnd(end, false)
  });

  const bodyOptions = {
    axes: ['x'] as SwipeAxis[],
    // pan-y hands vertical back to the browser: the control list has to scroll.
    touchAction: 'pan-y',
    ignore: '[data-swipe-ignore]',
    onMove: (_axis: SwipeAxis, dx: number) => (pageDx = dx),
    onEnd: (end: SwipeEnd) => {
      if (end.axis === 'x') finishPage(end.dx, end.velocity);
      else pageDx = 0;
    }
  };
</script>

<aside
  class="sheet"
  class:landscape
  class:dragging
  data-state={$sheetState}
  data-bmx-proof-id="mobile-module-sheet"
  bind:clientWidth={sheetW}
  bind:clientHeight={sheetH}
  style="--accent:{accent};transform:{transform}"
  aria-label="{mod.name} controls"
>
  <!-- The grabber is the drag handle in every state; what it *says* changes. -->
  <div class="grab" use:swipe={grabOptions}>
    <span class="grab-pill"></span>
    {#if $sheetState === 'full'}
      <div class="head">
        <button
          type="button"
          class="icon"
          aria-label="Previous module"
          onclick={() => goto(-1)}
        >
          <ChevronLeft size={20} />
        </button>
        <span class="head-name">{mod.name}</span>
        <button
          type="button"
          class="icon"
          aria-label="Next module"
          onclick={() => goto(1)}
        >
          <ChevronRight size={20} />
        </button>
        <div class="head-gap"></div>
        <button
          type="button"
          class="byp"
          class:on={$bypassed[mod.id]}
          aria-pressed={$bypassed[mod.id] === true}
          onclick={() => toggleBypass(mod.id)}
        >
          BYPASS
        </button>
        <button
          type="button"
          class="icon"
          aria-label="Collapse controls"
          onclick={() => sheetState.set('peek')}
        >
          <ChevronDown size={20} />
        </button>
      </div>
    {:else}
      <div class="head">
        <span class="head-name">{mod.name}</span>
        <span class="head-mix">MIX {mix}</span>
        <div class="head-gap"></div>
        <button
          type="button"
          class="icon"
          aria-label="Open {mod.name} controls"
          onclick={() => sheetState.set('full')}
        >
          <ChevronUp size={20} />
        </button>
      </div>
    {/if}
  </div>

  <div class="body" use:swipe={bodyOptions} inert={$sheetState !== 'full'}>
    <div class="pos">
      <div class="dots" aria-hidden="true">
        {#each MOBILE_MODULE_IDS as id, i (id)}
          <span class="dot" class:on={i === $activeModuleIndex}></span>
        {/each}
      </div>
      <span class="pos-count">{$activeModuleIndex + 1}/{MOBILE_MODULE_IDS.length}</span>
    </div>

    <!-- The nudge follows the finger; the key block plays the swap. Paging that
         repaints in place reads as a bug, not as movement. -->
    <div class="pager" style="transform:translate3d({pageDx * 0.22}px,0,0)">
      {#key mod.id}
        <div
          class="page"
          in:fly={{ x: pageDir * 30, duration: 220, opacity: 0, easing: cubicOut }}
        >
          <MobileModuleControls moduleId={mod.id} {params} color={accent} />
        </div>
      {/key}
    </div>
  </div>
</aside>

{#if showRail}
  <!-- Portrait closed: a thin edge pill, so a deliberately dismissed sheet is
       still recoverable without another component's help.
       Landscape peek: the named rail the panel's own grabber cannot be. -->
  <button
    type="button"
    class="rail"
    class:landscape
    class:thin={$sheetState === 'closed'}
    style="--accent:{accent}"
    aria-label={$sheetState === 'closed' ? 'Show module controls' : `Open ${mod.name} controls`}
    onclick={() => sheetState.set($sheetState === 'closed' ? 'peek' : 'full')}
    use:swipe={railOptions}
  >
    {#if $sheetState !== 'closed'}
      <span class="rail-name">{mod.name}</span>
      <span class="rail-mix">MIX {mix}</span>
      {#if landscape}<ChevronLeft size={18} />{:else}<ChevronUp size={18} />{/if}
    {:else}
      <span class="rail-pill"></span>
    {/if}
  </button>
{/if}

<style>
  .sheet {
    position: fixed;
    z-index: 40;
    display: flex;
    flex-direction: column;
    background: var(--m-glass, rgba(8, 10, 12, 0.22));
    backdrop-filter: var(--m-blur, blur(4px));
    -webkit-backdrop-filter: var(--m-blur, blur(4px));
    color: var(--m-ink, #e5e7eb);
    will-change: transform;
    transition: transform var(--m-dur, 220ms) var(--m-ease, cubic-bezier(0.2, 0, 0, 1));
    overscroll-behavior: contain;
  }

  .sheet.dragging {
    transition: none;
  }

  .sheet:not(.landscape) {
    left: 0;
    right: 0;
    bottom: 0;
    height: 62vh;
    height: 62dvh;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--m-radius-sheet, 20px) var(--m-radius-sheet, 20px) 0 0;
    box-shadow: var(--m-sheet-shadow, 0 -24px 56px rgba(0, 0, 0, 0.55));
    padding-bottom: var(--m-safe-bottom, 0px);
  }

  .sheet.landscape {
    top: 0;
    bottom: 0;
    right: 0;
    width: min(46vw, 380px);
    border-left: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--m-radius-sheet, 20px) 0 0 var(--m-radius-sheet, 20px);
    box-shadow: -18px 0 48px rgba(0, 0, 0, 0.55);
    padding-right: var(--m-safe-right, 0px);
  }

  .sheet::before {
    content: '';
    position: absolute;
    background: var(--accent);
    pointer-events: none;
    z-index: 1;
  }
  .sheet:not(.landscape)::before {
    left: 0;
    right: 0;
    top: 0;
    height: 2px;
    border-radius: var(--m-radius-sheet, 20px) var(--m-radius-sheet, 20px) 0 0;
  }
  .sheet.landscape::before {
    top: 0;
    bottom: 0;
    left: 0;
    width: 2px;
    border-radius: var(--m-radius-sheet, 20px) 0 0 var(--m-radius-sheet, 20px);
  }

  .grab {
    position: relative;
    flex: 0 0 auto;
    height: var(--m-sheet-peek, 64px);
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px 0;
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .grab-pill {
    width: 40px;
    height: 4px;
    flex: 0 0 auto;
    align-self: center;
    border-radius: var(--m-radius, 2px);
    background: rgba(255, 255, 255, 0.28);
  }

  .head {
    flex: 1;
    min-height: 44px;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .head-gap {
    flex: 1;
  }

  .head-name {
    font-family: var(--font-ui);
    font-size: var(--m-text-md, 13px);
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .head-mix {
    font-family: var(--font-ui);
    font-size: var(--m-text-xs, 11px);
    font-weight: 500;
    letter-spacing: 0.12em;
    font-variant-numeric: tabular-nums;
    color: var(--m-ink-dim, #8a93a0);
    white-space: nowrap;
  }

  .icon {
    flex: 0 0 auto;
    width: var(--m-tap, 44px);
    height: var(--m-tap, 44px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--m-ink-dim, #8a93a0);
    cursor: pointer;
    border-radius: var(--m-radius, 2px);
    -webkit-tap-highlight-color: transparent;
  }

  .icon:active {
    background: rgba(255, 255, 255, 0.08);
  }

  .byp {
    flex: 0 0 auto;
    min-width: 72px;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--m-line-lit, #2a3138);
    border-radius: var(--m-radius, 2px);
    background: transparent;
    color: var(--m-ink-dim, #8a93a0);
    font-family: var(--font-ui);
    font-size: var(--m-text-xs, 11px);
    font-weight: 600;
    letter-spacing: 0.14em;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .byp.on {
    border-color: rgba(239, 68, 68, 0.5);
    background: rgba(239, 68, 68, 0.12);
    color: #ef6b6b;
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    padding: 0 14px 24px;
  }

  .pos {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0 10px;
    background: linear-gradient(180deg, rgba(12, 14, 16, 0.28), rgba(12, 14, 16, 0));
  }

  .dots {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .dot {
    flex: 1 1 0;
    height: 3px;
    min-width: 3px;
    border-radius: var(--m-radius, 2px);
    background: rgba(255, 255, 255, 0.14);
    transition: background var(--m-dur, 220ms) var(--m-ease, ease);
  }

  .dot.on {
    background: var(--accent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 55%, transparent);
  }

  .pos-count {
    flex: 0 0 auto;
    font-family: var(--font-ui);
    font-size: var(--m-text-xs, 11px);
    letter-spacing: 0.1em;
    font-variant-numeric: tabular-nums;
    color: var(--m-ink-faint, #555e6a);
  }

  .pager {
    transition: transform var(--m-dur-fast, 120ms) var(--m-ease, ease-out);
  }

  .rail {
    position: fixed;
    z-index: 41;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin: 0;
    border: none;
    background: var(--m-glass-heavy, rgba(8, 10, 12, 0.32));
    backdrop-filter: var(--m-blur, blur(4px));
    -webkit-backdrop-filter: var(--m-blur, blur(4px));
    color: var(--m-ink-dim, #8a93a0);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.5);
  }

  .rail:not(.landscape) {
    left: 0;
    right: 0;
    bottom: 0;
    height: 56px;
    padding-bottom: var(--m-safe-bottom, 0px);
    border-top: 2px solid var(--accent);
    border-radius: var(--m-radius-sheet, 20px) var(--m-radius-sheet, 20px) 0 0;
  }

  .rail:not(.landscape).thin {
    height: 22px;
  }

  .rail.landscape {
    top: 0;
    bottom: 0;
    right: 0;
    width: 56px;
    flex-direction: column;
    padding: 18px 0;
    border-left: 2px solid var(--accent);
    border-radius: var(--m-radius-sheet, 20px) 0 0 var(--m-radius-sheet, 20px);
    box-shadow: -8px 0 28px rgba(0, 0, 0, 0.5);
  }

  .rail.landscape.thin {
    width: 20px;
  }

  .rail-name {
    font-family: var(--font-ui);
    font-size: var(--m-text-sm, 12px);
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent);
    white-space: nowrap;
  }

  .rail-mix {
    font-family: var(--font-ui);
    font-size: var(--m-text-xs, 11px);
    letter-spacing: 0.12em;
    font-variant-numeric: tabular-nums;
    color: var(--m-ink-faint, #555e6a);
    white-space: nowrap;
  }

  .rail.landscape .rail-name,
  .rail.landscape .rail-mix {
    writing-mode: vertical-rl;
    text-orientation: mixed;
  }

  .rail-pill {
    width: 40px;
    height: 4px;
    border-radius: var(--m-radius, 2px);
    background: var(--accent);
    opacity: 0.75;
  }

  .rail.landscape .rail-pill {
    width: 4px;
    height: 40px;
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet,
    .pager,
    .dot {
      transition: none;
    }
  }
</style>
