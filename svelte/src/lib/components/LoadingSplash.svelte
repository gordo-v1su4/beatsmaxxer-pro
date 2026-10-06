<script lang="ts">
  /**
   * First-load title card. The stall it covers is real work, not a fake delay:
   * the GPU device has to be acquired, then the effect pipelines compile.
   *
   * The mark is the Beatsmaxxer Pro logo: its letterforms are traced from the
   * art (svelte/scripts/splash/trace.py -> splashLogoPaths.ts) and filled
   * here, so the shapes match the art while every colour is one CSS knob:
   * `--logo-hue` and `--logo-shift` at the top of the style block. `?hue=210`
   * overrides the hue in the browser; `?splash=hold` keeps the card up.
   *
   * Motion is deliberately restrained: a light streak opens across the
   * screen, the bolt wipes down, the word wipes in left to right, PRO settles,
   * and a band of light sweeps the letters now and then. Once loading is done
   * (`armed`) it shows PRESS ANY KEY until the minimum hold runs out; on `go`
   * the mark eases forward and the card fades.
   *
   * Every keyframe animates `transform` or `opacity`, nothing else. The stall
   * behind this card blocks the main thread for whole seconds, and only
   * compositor-driven animations keep running through that (V1S-161). The
   * wipes are therefore not clip-path animations: each is a pair of boxes
   * sliding in opposite directions, an overflow-hidden window moving one way
   * and its content moving back the other, so the content stays put while the
   * window uncovers it. Static filters are fine; only animating them is not.
   *
   * The boot log strip is written from JS, so it *does* freeze during a block,
   * and that is intended: the line frozen on screen names the step that is
   * taking the time. The hairline above it is the liveness proof.
   */
  import { bootLog } from '$lib/stores/bootLog';
  import { LOGO_BOLT, LOGO_PRO, LOGO_WORD } from './splashLogoPaths';

  interface Props {
    /** 'gpu' while the adapter/device is acquired, 'shaders' while pipelines
        compile, 'armed' once the work is done but the minimum hold has not
        run out, 'go' to play the exit, 'ready' to unmount. */
    phase: 'gpu' | 'shaders' | 'armed' | 'go' | 'ready';
    done?: number;
    total?: number;
  }
  let { phase, done = 0, total = 0 }: Props = $props();

  const leaving = $derived(phase === 'go');
  const armed = $derived(phase === 'armed' || phase === 'go');
  // A plausible block count for the pre-count phase, so the meter has
  // something to sweep across before the denominator is known.
  const segments = $derived(total > 0 ? total : 12);
  const filled = $derived(armed ? segments : Math.min(done, segments));
  const known = $derived(phase === 'shaders' && total > 0);

  const label = $derived(
    armed ? 'READY' : phase === 'gpu' ? 'ACQUIRING GPU DEVICE' : 'COMPILING SHADERS'
  );
  const detail = $derived(known ? `${done} / ${total}` : 'INITIALISING');

  // Last five only: the strip grows upward from the bottom of the screen, so
  // an uncapped log would eventually walk over the mark.
  const tail = $derived($bootLog.slice(-5));

  /**
   * The sweep is masked to the letterforms with a static CSS mask, so the
   * band only lights the chrome and its travel stays a compositor transform.
   */
  const wordMask = `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2000 848'><path fill-rule='evenodd' d='${LOGO_WORD}'/></svg>`
  )}")`;

  /**
   * Finish of the mark. `?look=neon` tries the outline treatment; the default
   * is the clean chrome fill.
   */
  const LOOKS = ['chrome', 'neon'] as const;
  const look = $derived.by(() => {
    if (typeof window === 'undefined') return 'chrome';
    const q = new URLSearchParams(window.location.search).get('look');
    return (LOOKS as readonly string[]).includes(q ?? '') ? q : 'chrome';
  });

  /** `?hue=` for trying palettes without editing CSS. */
  const hueOverride = $derived.by(() => {
    if (typeof window === 'undefined') return '';
    const hue = Number(new URLSearchParams(window.location.search).get('hue'));
    return Number.isFinite(hue) && hue > 0 ? `--logo-hue:${hue}` : '';
  });
</script>

{#if phase !== 'ready'}
  <div
    class="splash look-{look}"
    class:leaving
    role="status"
    aria-live="polite"
    aria-label="Loading Beatsmaxxer Pro"
    style={hueOverride}
  >
    <span class="halo" aria-hidden="true"></span>

    <div class="stage">
      <!-- Every layer shares the art's 2000 x 848 board inside a box sized in
           container units, so one width scales the whole mark together. -->
      <div class="logo" aria-hidden="true">
        <!-- Shared shapes and paints. Each visible layer is its own <svg>
             rather than a <g>, because transforms on SVG children run on the
             main thread and transforms on an HTML-level box do not. -->
        <svg class="defs" width="0" height="0">
          <defs>
            <path id="bmx-word" d={LOGO_WORD} fill-rule="evenodd" />
            <path id="bmx-pro" d={LOGO_PRO} fill-rule="evenodd" />
            <path id="bmx-bolt" d={LOGO_BOLT} fill-rule="evenodd" />
            <!-- Two-tone chrome: a light top, a bright horizon, a deeper
                 lower half lifting to a rim at the bottom edge. -->
            <linearGradient id="bmx-face" gradientUnits="userSpaceOnUse" x1="0" y1="280" x2="0" y2="660">
              <stop offset="0" style="stop-color: var(--c-chrome-top)" />
              <stop offset="0.4" style="stop-color: var(--c-chrome-hi)" />
              <stop offset="0.47" style="stop-color: var(--c-chrome-white)" />
              <stop offset="0.5" style="stop-color: var(--c-chrome-deep)" />
              <stop offset="0.82" style="stop-color: var(--c-chrome-low)" />
              <stop offset="1" style="stop-color: var(--c-chrome-rim)" />
            </linearGradient>
            <linearGradient id="bmx-pro-fill" gradientUnits="userSpaceOnUse" x1="0" y1="560" x2="0" y2="645">
              <stop offset="0.1" style="stop-color: var(--c-chrome-white)" />
              <stop offset="0.5" style="stop-color: var(--c-accent-hi)" />
              <stop offset="1" style="stop-color: var(--c-accent)" />
            </linearGradient>
            <linearGradient id="bmx-bolt-fill" gradientUnits="userSpaceOnUse" x1="1300" y1="20" x2="700" y2="750">
              <stop offset="0" style="stop-color: var(--c-chrome-white)" />
              <stop offset="0.45" style="stop-color: var(--c-accent-hi)" />
              <stop offset="1" style="stop-color: var(--c-accent-deep)" />
            </linearGradient>
            <!-- Fine scanlines inside the letters. -->
            <pattern id="bmx-scan" width="20" height="7" patternUnits="userSpaceOnUse">
              <rect width="20" height="1.6" fill="rgba(0,10,20,0.32)" />
            </pattern>
          </defs>
        </svg>

        <span class="ring"></span>
        <span class="streak"></span>

        <div class="art wipe-down">
          <div class="art wipe-down-inner">
            <svg class="art bolt" viewBox="0 0 2000 848">
              <use href="#bmx-bolt" class="edge" />
              <use href="#bmx-bolt" fill="url(#bmx-bolt-fill)" />
              <use href="#bmx-bolt" fill="url(#bmx-scan)" />
              <use href="#bmx-bolt" class="line" />
            </svg>
          </div>
        </div>

        <div class="art wipe-right">
          <div class="art wipe-right-inner">
            <svg class="art word" viewBox="0 0 2000 848">
              <use href="#bmx-word" class="edge" />
              <use href="#bmx-word" fill="url(#bmx-face)" />
              <use href="#bmx-word" fill="url(#bmx-scan)" />
              <use href="#bmx-word" class="line" />
            </svg>
            <div class="art sweep-mask" style="mask-image:{wordMask};-webkit-mask-image:{wordMask}">
              <span class="sweep"></span>
            </div>
          </div>
        </div>

        <div class="art pro-in">
          <svg class="art pro" viewBox="0 0 2000 848">
            <use href="#bmx-pro" class="edge" />
            <use href="#bmx-pro" fill="url(#bmx-pro-fill)" />
            <use href="#bmx-pro" fill="url(#bmx-scan)" />
            <use href="#bmx-pro" class="line" />
          </svg>
        </div>
      </div>

      <div class="readout">
        <div class="meta">
          <span class="phase">{label}</span>
          {#if armed}
            <span class="detail press">
              <span class="fine">PRESS ANY KEY</span><span class="coarse">TAP TO START</span>
            </span>
          {:else}
            <span class="detail">{detail}</span>
          {/if}
        </div>

        <div class="meter" class:sweeping={!known && !armed} aria-hidden="true">
          {#each Array(segments) as _, i (i)}
            <span class="seg" class:on={i < filled} style="--i:{i}"></span>
          {/each}
        </div>
      </div>
    </div>

    <!-- aria-hidden: the readout above already announces phase and progress
         through the live region; five churning log lines would be noise. -->
    <div class="tty" aria-hidden="true">
      <div class="wire">
        <span class="shuttle"></span>
      </div>
      <ol class="lines">
        {#each tail as step (step.id)}
          <li class:done={step.state === 'done'}>
            <span class="mark">{step.state === 'done' ? 'ok' : '>'}</span>
            <span class="text">{step.label}{step.note ? ` ${step.note}` : ''}</span>
          </li>
        {/each}
      </ol>
    </div>

    <div class="scanlines" aria-hidden="true"></div>
    <div class="vignette" aria-hidden="true"></div>
  </div>
{/if}

<style>
  /*
    Palette
    ───────
    Every colour on the card derives from two numbers:

      --logo-hue    the lead colour: the chrome, the UI accents, the glow
      --logo-shift  how far the accent (bolt, PRO, streak core) rotates from
                    it. Positive moves toward blue, which keeps the whole card
                    cool; a negative value would warm it toward green.

    OKLCH holds lightness steady as the hue moves, so any hue stays legible.
  */
  .splash {
    --logo-hue: 182;
    --logo-shift: 42;

    --h: var(--logo-hue);
    --h-acc: calc(var(--logo-hue) + var(--logo-shift));

    --c-chrome-top: oklch(0.9 0.07 var(--h));
    --c-chrome-hi: oklch(0.78 0.13 var(--h));
    --c-chrome-white: oklch(0.98 0.02 var(--h));
    --c-chrome-deep: oklch(0.42 0.09 var(--h-acc));
    --c-chrome-low: oklch(0.68 0.13 var(--h));
    --c-chrome-rim: oklch(0.92 0.08 var(--h));
    --c-accent-hi: oklch(0.82 0.11 var(--h-acc));
    --c-accent: oklch(0.66 0.15 var(--h-acc));
    --c-accent-deep: oklch(0.45 0.14 var(--h-acc));
    --c-ink: oklch(0.08 0.02 var(--h-acc));
    --c-glow: oklch(0.75 0.13 var(--h) / 0.35);
    --c-ui: oklch(0.86 0.08 var(--h));
    --c-ui-strong: oklch(0.76 0.12 var(--h));
    --c-ui-deep: oklch(0.6 0.1 var(--h));
    --c-ui-dim: oklch(0.55 0.03 var(--h));
    --c-ui-faint: oklch(0.4 0.02 var(--h));

    /* Timeline, in one place so the beats can be re-spaced together. */
    --t-streak: 150ms;
    --t-bolt: 300ms;
    --t-word: 520ms;
    --t-pro: 1050ms;
    --t-sweep: 1350ms;
    --t-readout: 1200ms;
    --ease-out: cubic-bezier(0.22, 1, 0.36, 1);

    /* As wide as the screen allows, but short enough to leave the readout
       its room when a phone lies on its side. */
    --logo-w: min(960px, 92vw, 110vh);
  }

  .splash {
    position: fixed;
    inset: 0;
    z-index: 4200;
    padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
      env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: radial-gradient(120% 80% at 50% 40%, oklch(0.16 0.025 var(--h-acc)), #030507 70%);
    animation: fade-in 260ms ease-out both;
  }

  .splash.leaving {
    animation: fade-out 520ms cubic-bezier(0.4, 0, 0.9, 0.4) 260ms both;
  }
  @keyframes fade-out {
    from { opacity: 1; }
    to   { opacity: 0; }
  }
  @keyframes fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .halo {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(50% 32% at 50% 44%, var(--c-glow), transparent 72%);
    opacity: 0.5;
    animation: halo 5s ease-in-out var(--t-sweep) infinite;
  }
  @keyframes halo {
    0%, 100% { opacity: 0.5; }
    50%      { opacity: 0.8; }
  }

  .stage {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }

  /* ---- the mark ----
     Art board is 2000 x 848; 1cqw is 20 art pixels. */
  .logo {
    position: relative;
    width: var(--logo-w);
    aspect-ratio: 2000 / 848;
    container-type: inline-size;
  }
  .splash.leaving .logo {
    animation: ease-away 700ms cubic-bezier(0.5, 0, 0.75, 0) both;
  }
  @keyframes ease-away {
    from { transform: scale(1); opacity: 1; }
    to   { transform: scale(1.06); opacity: 0; }
  }

  .defs {
    position: absolute;
    width: 0;
    height: 0;
  }
  .art {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  /* The ink outline: a wide stroke under the fill separates the letters from
     the field the way the art does. */
  .edge {
    fill: var(--c-ink);
    stroke: var(--c-ink);
    stroke-width: 9;
    stroke-linejoin: round;
  }

  /* A thin horizontal light under the word, opening from the centre. */
  .streak {
    position: absolute;
    left: -20%;
    right: -20%;
    top: 74.5%;
    height: 0.35cqw;
    border-radius: 50%;
    background: linear-gradient(
      90deg,
      transparent,
      var(--c-accent) 25%,
      var(--c-chrome-white) 50%,
      var(--c-accent) 75%,
      transparent
    );
    box-shadow: 0 0 1.4cqw var(--c-accent);
    opacity: 0.9;
    animation: streak 900ms var(--ease-out) var(--t-streak) both;
  }
  @keyframes streak {
    0%   { opacity: 0; transform: scaleX(0); }
    40%  { opacity: 1; }
    100% { opacity: 0.85; transform: scaleX(1); }
  }

  /* ---- wipes ----
     The window slides one way and the content slides back the other at the
     same rate, so the art holds still while it is uncovered. Both keyframes
     share duration and easing; that is what keeps them cancelling. */
  .wipe-down,
  .wipe-right {
    overflow: hidden;
  }

  .wipe-down {
    animation: from-up 520ms var(--ease-out) var(--t-bolt) both;
  }
  .wipe-down-inner {
    animation: from-down 520ms var(--ease-out) var(--t-bolt) both;
  }
  @keyframes from-up {
    from { transform: translateY(-100%); }
    to   { transform: translateY(0); }
  }
  @keyframes from-down {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }

  .wipe-right {
    animation: from-left 760ms var(--ease-out) var(--t-word) both;
  }
  .wipe-right-inner {
    animation: from-right 760ms var(--ease-out) var(--t-word) both;
  }
  @keyframes from-left {
    from { transform: translateX(-100%); }
    to   { transform: translateX(0); }
  }
  @keyframes from-right {
    from { transform: translateX(100%); }
    to   { transform: translateX(0); }
  }

  .bolt {
    filter: drop-shadow(0 0 1cqw var(--c-accent));
    opacity: 0.92;
  }

  .word {
    filter: drop-shadow(0 0.4cqw 0.8cqw rgba(0, 0, 0, 0.7))
      drop-shadow(0 0 1.6cqw var(--c-glow));
  }

  .sweep-mask {
    overflow: hidden;
    mask-size: 100% 100%;
    -webkit-mask-size: 100% 100%;
  }
  /* A band of light across the chrome, now and then. */
  .sweep {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 14%;
    background: linear-gradient(
      90deg,
      transparent,
      oklch(0.98 0.03 var(--h) / 0.75) 50%,
      transparent
    );
    transform: translateX(-120%) skewX(-24deg);
    animation: sweep 4.2s cubic-bezier(0.5, 0, 0.3, 1) var(--t-sweep) infinite;
  }
  @keyframes sweep {
    0%   { transform: translateX(-120%) skewX(-24deg); }
    32%  { transform: translateX(760%) skewX(-24deg); }
    100% { transform: translateX(760%) skewX(-24deg); }
  }

  .pro-in {
    animation: pro-in 560ms var(--ease-out) var(--t-pro) both;
  }
  @keyframes pro-in {
    0%   { opacity: 0; transform: translateY(2.4cqw); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .pro {
    filter: drop-shadow(0 0 1cqw var(--c-glow));
  }

  /* ---- looks ----
     `.line` and `.ring` exist in the markup for every look and are only
     switched on by the looks that use them. */
  .line {
    display: none;
  }
  .ring {
    display: none;
  }

  /* Neon: the letters become lit outlines over a dark, faintly tinted fill,
     inside a thin ring, the treatment of the outlined logo art. */
  .look-neon .line {
    display: inline;
    fill: none;
    stroke: var(--c-chrome-top);
    stroke-width: 3.5;
    stroke-linejoin: round;
  }
  .look-neon .word use[fill^='url(#bmx-face)'],
  .look-neon .pro use[fill^='url(#bmx-pro-fill)'],
  .look-neon .bolt use[fill^='url(#bmx-bolt-fill)'] {
    opacity: 0.3;
  }
  .look-neon .word,
  .look-neon .pro,
  .look-neon .bolt {
    filter: drop-shadow(0 0 0.35cqw var(--c-chrome-hi)) drop-shadow(0 0 1.6cqw var(--c-accent));
  }
  .look-neon .ring {
    display: block;
    position: absolute;
    left: 20cqw;
    top: 9cqw;
    width: 62cqw;
    height: 37cqw;
    border-radius: 50%;
    border: 0.35cqw solid var(--c-accent-hi);
    box-shadow:
      0 0 1.2cqw var(--c-accent),
      inset 0 0 1.2cqw var(--c-accent);
    opacity: 0.85;
    animation: ring-in 700ms var(--ease-out) var(--t-streak) both;
  }
  .look-neon .streak {
    display: none;
  }
  @keyframes ring-in {
    0%   { opacity: 0; transform: scale(0.92); }
    100% { opacity: 0.85; transform: scale(1); }
  }

  /* ---- readout ---- */
  .readout {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(360px, 76vw);
    margin-top: clamp(18px, 5vh, 56px);
    animation: fade-in 500ms ease-out var(--t-readout) both;
  }

  .meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16px;
  }

  .phase {
    color: var(--c-ui);
    font-family: var(--font-ui), system-ui, sans-serif;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.28em;
  }

  .detail {
    color: var(--c-ui-dim);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 10px;
    letter-spacing: 0.14em;
    font-variant-numeric: tabular-nums;
  }

  /* Slim segmented meter: one block per preview pipeline. */
  .meter {
    display: flex;
    gap: 2px;
    width: 100%;
  }

  .seg {
    position: relative;
    flex: 1 1 0;
    height: 3px;
    background: oklch(0.26 0.02 var(--h));
  }

  /* The fill is a layer revealed by opacity, never a swapped `background`, so
     the pre-count charge keeps running through a main-thread stall. */
  .seg::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--c-ui-strong);
    box-shadow: 0 0 6px var(--c-glow);
    opacity: 0;
    transition: opacity 160ms linear;
  }
  .seg.on::after {
    opacity: 1;
  }

  .meter.sweeping .seg::after {
    animation: charge 1.25s ease-in-out infinite;
    animation-delay: calc(var(--i) * 70ms);
  }
  @keyframes charge {
    0%, 70%, 100% { opacity: 0; }
    22%           { opacity: 1; }
  }

  .press {
    color: var(--c-ui);
    animation: pulse 1.6s ease-in-out infinite;
  }
  .press .coarse { display: none; }
  @media (pointer: coarse) {
    .press .fine { display: none; }
    .press .coarse { display: inline; }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.35; }
  }

  /* ---- terminal strip ----
     Bottom-anchored, so new lines push the stack upward and nothing above it
     ever moves. */
  .tty {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 9px;
    padding: 0 20px max(14px, env(safe-area-inset-bottom, 0px));
    pointer-events: none;
    opacity: 0.8;
    animation: fade-in 300ms ease-out 180ms both;
  }

  .wire,
  .lines {
    width: min(560px, 100%);
  }

  /* ---- the liveness hairline ----
     Fixed geometry and a single translated child, so the compositor runs it
     without the main thread and it keeps sweeping through a blocked compile. */
  .wire {
    position: relative;
    height: 1px;
    overflow: hidden;
    background: oklch(0.6 0.1 var(--h) / 0.14);
  }

  .shuttle {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 26%;
    background: linear-gradient(90deg, transparent, var(--c-ui-deep) 42%, var(--c-chrome-white) 52%, var(--c-ui-deep) 62%, transparent);
    will-change: transform;
    transform: translate3d(-100%, 0, 0);
    animation: shuttle 1.15s linear infinite;
  }
  /* 26% wide, so 385% clears the right edge exactly. */
  @keyframes shuttle {
    from { transform: translate3d(-100%, 0, 0); }
    to   { transform: translate3d(385%, 0, 0); }
  }

  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .lines li {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    line-height: 1.5;
    color: oklch(0.62 0.03 var(--h));
  }
  .lines li.done { color: var(--c-ui-faint); }

  .mark {
    flex: none;
    width: 2ch;
    text-align: right;
    color: var(--c-ui-strong);
  }
  .lines li.done .mark { color: var(--c-ui-deep); }

  .text {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* ---- scanlines ----
     The one retro note: fine, faint, over everything. */
  .scanlines {
    position: absolute;
    inset: 0;
    z-index: 6;
    pointer-events: none;
    opacity: 0.22;
    background: repeating-linear-gradient(
      180deg,
      rgba(0, 0, 0, 0) 0px,
      rgba(0, 0, 0, 0) 2px,
      rgba(0, 0, 0, 0.55) 2px,
      rgba(0, 0, 0, 0.55) 3px
    );
  }
  .vignette {
    position: absolute;
    inset: 0;
    z-index: 6;
    pointer-events: none;
    background: radial-gradient(130% 95% at 50% 50%, transparent 58%, rgba(0, 0, 0, 0.6));
  }

  /* ---- phone ---- */
  @media (max-width: 820px), (pointer: coarse) and (max-height: 500px) {
    .splash {
      --logo-w: min(960px, 96vw, 100vh);
    }
    .readout {
      width: min(360px, calc(100% - 40px));
    }
    .lines li {
      font-size: 11px;
    }
    .tty {
      padding-left: 14px;
      padding-right: 14px;
    }
  }

  /* A phone on its side has ~375px of height: the log keeps only the line
     that is running, so it never climbs into the readout. */
  @media (max-height: 500px) {
    .lines li:not(:last-child) {
      display: none;
    }
    .readout {
      margin-top: 8px;
    }
  }

  /* Motion is decoration; the readout still carries the information. */
  @media (prefers-reduced-motion: reduce) {
    .splash *,
    .splash {
      animation: none !important;
    }
    .sweep {
      display: none;
    }
    .splash.leaving {
      opacity: 0;
      transition: opacity 400ms ease-out 300ms;
    }

    /* The hairline keeps going even here. Travel is what people object to, so
       it stops travelling and breathes instead, still on the compositor. */
    .shuttle {
      width: 100%;
      transform: none;
      animation: breathe 2.6s ease-in-out infinite !important;
    }
    @keyframes breathe {
      0%, 100% { opacity: 0.16; }
      50%      { opacity: 0.75; }
    }
  }
</style>
