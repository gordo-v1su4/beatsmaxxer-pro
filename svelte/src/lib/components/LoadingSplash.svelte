<script lang="ts">
  /**
   * First-load title card. It rises out of black, holds while the real work
   * runs (GPU device, then ~40 effect pipelines compiling), and hands off into
   * the app: the mark wipes away first, then the black lifts.
   *
   * Two marks, chosen with `?logo=`:
   *
   *   bolt (default)  the lightning logo, its letterforms traced from the art
   *                   (svelte/scripts/splash/trace.py). `?look=neon` gives it
   *                   lit outlines inside a ring.
   *   wordmark        BEATSMAXXER set in a display face over a chrome bar with
   *                   a lens flare. The face is a CSS variable (`--wm-face`
   *                   and friends), a stand-in until the real one is chosen.
   *
   * Colour is two numbers at the top of the style block, `--logo-hue` and
   * `--logo-shift`; `?hue=210` tries another hue. `?splash=hold` keeps the
   * card up, `?bootlog=1` shows the step-by-step boot log under it.
   *
   * Every keyframe animates `transform` or `opacity`, nothing else. The stall
   * behind this card blocks the main thread for whole seconds and only
   * compositor-driven animations keep running through that (V1S-161). Wipes
   * and the light sweep are therefore not clip-path or background-position
   * animations: each is a pair of boxes sliding in opposite directions, an
   * overflow-hidden window moving one way and its content moving back the
   * other, so the content stays put while the window uncovers it.
   */
  import { bootLog } from '$lib/stores/bootLog';
  import { BOLT_LOGO } from './splashLogoPaths';

  interface Props {
    /** 'gpu' while the adapter/device is acquired, 'shaders' while pipelines
        compile, 'armed' once the work is done but the minimum hold has not
        run out, 'go' to play the exit, 'ready' to unmount. */
    phase: 'gpu' | 'shaders' | 'armed' | 'go' | 'ready';
    done?: number;
    total?: number;
  }
  let { phase }: Props = $props();

  const leaving = $derived(phase === 'go');
  const armed = $derived(phase === 'armed' || phase === 'go');
  const status = $derived(armed ? 'Ready' : 'Loading');

  const params =
    typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);

  const logo = params.get('logo') === 'wordmark' ? 'wordmark' : 'bolt';
  const look = params.get('look') === 'neon' ? 'neon' : 'chrome';
  const showBootLog = params.has('bootlog');
  const hueOverride = (() => {
    const hue = Number(params.get('hue'));
    return Number.isFinite(hue) && hue > 0 ? `--logo-hue:${hue}` : '';
  })();

  // Last five only: the strip grows upward from the bottom of the screen.
  const tail = $derived($bootLog.slice(-5));

  /** The bolt logo's sweep is masked to its letterforms with a static mask. */
  const boltWordMask = `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2000 848'><path fill-rule='evenodd' d='${BOLT_LOGO.word}'/></svg>`
  )}")`;
</script>

{#if phase !== 'ready'}
  <div
    class="splash logo-{logo} look-{look}"
    class:leaving
    role="status"
    aria-live="polite"
    aria-label="Beatsmaxxer Pro, {status}"
    style={hueOverride}
  >
    <span class="halo" aria-hidden="true"></span>

    <div class="stage">
      {#if logo === 'wordmark'}
        <!-- ---- the wordmark ---- -->
        <div class="mark wm" aria-hidden="true">
          <div class="wipe wipe-x">
            <div class="wipe-x-inner">
              <div class="wm-word">BEATSMAXXER</div>
            </div>
          </div>

          <!-- The light sweep: a narrow window carrying a bright copy of the
               word, counter-moved so the copy stays registered on the base. -->
          <div class="sweep-window">
            <div class="sweep-inner">
              <div class="wm-word wm-word-lit">BEATSMAXXER</div>
            </div>
          </div>

          <div class="wm-foot">
            <div class="wm-bar">
              <span class="wm-bar-line"></span>
              <span class="flare">
                <span class="flare-core"></span>
                <span class="flare-h"></span>
                <span class="flare-v"></span>
              </span>
            </div>
            <div class="wm-pro-in">
              <span class="wm-pro">PRO</span>
            </div>
          </div>
        </div>
      {:else}
        <!-- ---- the lightning logo ---- -->
        <!-- Every layer shares the art's 2000 x 848 board, sized in container
             units so one width scales the whole mark together. -->
        <div class="mark bolt-logo" aria-hidden="true">
          <!-- Shared shapes and paints. Each visible layer is its own <svg>
               rather than a <g>, because transforms on SVG children run on the
               main thread and transforms on an HTML-level box do not. -->
          <svg class="defs" width="0" height="0">
            <defs>
              <path id="bmx-word" d={BOLT_LOGO.word} fill-rule="evenodd" />
              <path id="bmx-pro" d={BOLT_LOGO.pro} fill-rule="evenodd" />
              <path id="bmx-bolt" d={BOLT_LOGO.bolt} fill-rule="evenodd" />
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
              <pattern id="bmx-scan" width="20" height="7" patternUnits="userSpaceOnUse">
                <rect width="20" height="1.6" fill="rgba(0,10,20,0.32)" />
              </pattern>
            </defs>
          </svg>

          <span class="ring"></span>

          <div class="art wipe wipe-y">
            <div class="art wipe-y-inner">
              <svg class="art bolt" viewBox="0 0 2000 848">
                <use href="#bmx-bolt" class="edge" />
                <use href="#bmx-bolt" fill="url(#bmx-bolt-fill)" />
                <use href="#bmx-bolt" fill="url(#bmx-scan)" />
                <use href="#bmx-bolt" class="line" />
              </svg>
            </div>
          </div>

          <div class="art wipe wipe-x">
            <div class="art wipe-x-inner">
              <svg class="art word" viewBox="0 0 2000 848">
                <use href="#bmx-word" class="edge" />
                <use href="#bmx-word" class="face" fill="url(#bmx-face)" />
                <use href="#bmx-word" fill="url(#bmx-scan)" />
                <use href="#bmx-word" class="line" />
              </svg>
              <div class="art sweep-mask" style="mask-image:{boltWordMask};-webkit-mask-image:{boltWordMask}">
                <span class="sweep"></span>
              </div>
            </div>
          </div>

          <div class="art pro-in">
            <svg class="art pro" viewBox="0 0 2000 848">
              <use href="#bmx-pro" class="edge" />
              <use href="#bmx-pro" class="face" fill="url(#bmx-pro-fill)" />
              <use href="#bmx-pro" fill="url(#bmx-scan)" />
              <use href="#bmx-pro" class="line" />
            </svg>
          </div>
        </div>
      {/if}

      <!-- Plain words, not a progress readout. The dots are opacity-only
           keyframes, so they keep going through a main-thread stall and are
           themselves the proof the app has not hung. -->
      <div class="readout">
        {#if armed}
          <span class="status press">
            <span class="fine">PRESS ANY KEY</span><span class="coarse">TAP TO START</span>
          </span>
        {:else}
          <span class="status">LOADING<span class="dots"><span>.</span><span>.</span><span>.</span></span></span>
        {/if}
      </div>
    </div>

    {#if showBootLog}
      <ol class="bootlog" aria-hidden="true">
        {#each tail as step (step.id)}
          <li class:done={step.state === 'done'}>
            <span class="mark-ok">{step.state === 'done' ? 'ok' : '>'}</span>
            <span class="text">{step.label}{step.note ? ` ${step.note}` : ''}</span>
          </li>
        {/each}
      </ol>
    {/if}

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
      --logo-shift  how far the accent (bar, flare, PRO, bolt) rotates from
                    it. Positive moves toward blue, which keeps the card cool.

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

    /*
      Wordmark face. A stand-in until the chosen display face is self-hosted
      under static/fonts: Russo One is already there, slanted to match the
      italic of the art. Swap these four for the real face.
    */
    --wm-face: 'Russo One';
    --wm-weight: 400;
    --wm-style: normal;
    --wm-skew: -14deg;

    /* Timeline, in one place so the beats can be re-spaced together. */
    --t-start: 250ms;
    --t-word: 350ms;
    --t-bar: 900ms;
    --t-flare: 1250ms;
    --t-pro: 1150ms;
    --t-sweep: 1700ms;
    --t-readout: 1300ms;
    --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
    --ease-in: cubic-bezier(0.55, 0, 0.8, 0.2);

    --logo-w: min(980px, 90vw, 120vh);
  }

  /* The black is there from the first frame: no fade-in on the card itself,
     only on what is drawn on it. */
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
    background: radial-gradient(120% 80% at 50% 42%, oklch(0.15 0.025 var(--h-acc)), #030507 70%);
  }

  /* Exit: the mark leaves first (below), then the black lifts off the app. */
  .splash.leaving {
    animation: lift 480ms ease-out 380ms both;
  }
  @keyframes lift {
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
    background: radial-gradient(50% 30% at 50% 45%, var(--c-glow), transparent 72%);
    opacity: 0;
    animation:
      fade-in 1200ms ease-out var(--t-word) both,
      halo 5s ease-in-out var(--t-sweep) infinite;
  }
  @keyframes halo {
    0%, 100% { opacity: 0.55; }
    50%      { opacity: 0.85; }
  }
  .leaving .halo {
    animation: lift 400ms ease-out both;
  }

  .stage {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }

  .mark {
    position: relative;
    width: var(--logo-w);
    container-type: inline-size;
  }

  /* ---- wipes ----
     The window slides one way and the content slides back the other at the
     same rate, so the art holds still while it is uncovered. Both keyframes
     share duration and easing; that is what keeps them cancelling. On exit
     they run on past zero, so the mark is wiped away to the right. */
  .wipe {
    overflow: hidden;
  }
  .wipe-x {
    animation: win-in-x 820ms var(--ease-out) var(--t-word) both;
  }
  .wipe-x-inner {
    animation: con-in-x 820ms var(--ease-out) var(--t-word) both;
  }
  @keyframes win-in-x { from { transform: translateX(-100%); } to { transform: translateX(0); } }
  @keyframes con-in-x { from { transform: translateX(100%); }  to { transform: translateX(0); } }

  .leaving .wipe-x {
    animation: win-out-x 460ms var(--ease-in) both;
  }
  .leaving .wipe-x-inner {
    animation: con-out-x 460ms var(--ease-in) both;
  }
  @keyframes win-out-x { from { transform: translateX(0); } to { transform: translateX(100%); } }
  @keyframes con-out-x { from { transform: translateX(0); } to { transform: translateX(-100%); } }

  .wipe-y {
    animation: win-in-y 560ms var(--ease-out) var(--t-start) both;
  }
  .wipe-y-inner {
    animation: con-in-y 560ms var(--ease-out) var(--t-start) both;
  }
  @keyframes win-in-y { from { transform: translateY(-100%); } to { transform: translateY(0); } }
  @keyframes con-in-y { from { transform: translateY(100%); }  to { transform: translateY(0); } }

  .leaving .wipe-y,
  .leaving .wipe-y-inner,
  .leaving .pro-in,
  .leaving .wm-pro-in,
  .leaving .wm-bar,
  .leaving .ring,
  .leaving .sweep-window {
    animation: lift 300ms ease-out both;
  }

  /* ================= the wordmark ================= */

  .wm {
    display: flex;
    flex-direction: column;
  }
  /* The slant pushes the last letter past the text box; the wipe window gets
     room on both sides so it does not crop the R once it has finished. */
  .wm > .wipe {
    margin: 0 -4cqw;
    padding: 0 4cqw;
  }

  .wm-word {
    font-family: var(--wm-face), var(--font-ui), sans-serif;
    font-weight: var(--wm-weight);
    font-style: var(--wm-style);
    font-size: 13.4cqw;
    line-height: 1.05;
    letter-spacing: -0.01em;
    white-space: nowrap;
    text-align: center;
    padding: 0 0.12em;
    transform: skewX(var(--wm-skew));
    /* Two-tone chrome with a bright horizon, scanlines laid over it. */
    background-image:
      repeating-linear-gradient(180deg, transparent 0 0.05em, rgba(0, 10, 20, 0.28) 0.05em 0.065em),
      linear-gradient(
        180deg,
        var(--c-chrome-top) 16%,
        var(--c-chrome-hi) 42%,
        var(--c-chrome-white) 49%,
        var(--c-chrome-deep) 52%,
        var(--c-chrome-low) 80%,
        var(--c-chrome-rim) 94%
      );
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    -webkit-text-stroke: 0.018em var(--c-ink);
    filter: drop-shadow(0 0.03em 0.05em rgba(0, 0, 0, 0.7)) drop-shadow(0 0 0.2em var(--c-glow));
  }

  .sweep-window {
    position: absolute;
    top: 0;
    left: 0;
    width: 12%;
    height: calc(13.4cqw * 1.05);
    overflow: hidden;
    transform: translateX(-120%) skewX(-20deg);
    animation: sweep-win 4.4s cubic-bezier(0.45, 0, 0.25, 1) var(--t-sweep) infinite;
  }
  .sweep-inner {
    position: absolute;
    top: 0;
    left: 0;
    width: 100cqw;
    transform: skewX(20deg) translateX(14.4%);
    animation: sweep-con 4.4s cubic-bezier(0.45, 0, 0.25, 1) var(--t-sweep) infinite;
  }
  /* The window is 12% of the board and travels in its own widths; the copy
     inside is the board's width, so it travels back the same distance in
     units of 0.12 of itself (-120% of the window = 14.4% of the board). */
  @keyframes sweep-win {
    0%        { transform: translateX(-120%) skewX(-20deg); }
    36%, 100% { transform: translateX(950%) skewX(-20deg); }
  }
  @keyframes sweep-con {
    0%        { transform: skewX(20deg) translateX(14.4%); }
    36%, 100% { transform: skewX(20deg) translateX(-114%); }
  }
  .wm-word-lit {
    background-image: linear-gradient(180deg, var(--c-chrome-white), oklch(0.9 0.08 var(--h)));
    filter: none;
    -webkit-text-stroke: 0.018em transparent;
    opacity: 0.85;
  }

  .wm-foot {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 2cqw;
    margin-top: -0.6cqw;
    padding: 0 2.5cqw 0 3cqw;
  }

  .wm-bar {
    position: relative;
    flex: 1 1 auto;
    height: 1.4cqw;
    margin-top: 1.2cqw;
    transform: skewX(-24deg);
  }
  .wm-bar-line {
    position: absolute;
    inset: 0;
    border-radius: 0.2cqw;
    background: linear-gradient(180deg, var(--c-chrome-white) 0 35%, var(--c-accent) 55%, var(--c-accent-deep) 100%);
    box-shadow: 0 0 0 0.15cqw var(--c-ink), 0 0 1.2cqw var(--c-accent);
    transform-origin: 0 50%;
    animation: bar-in 620ms var(--ease-out) var(--t-bar) both;
  }
  @keyframes bar-in {
    from { opacity: 0; transform: scaleX(0); }
    to   { opacity: 1; transform: scaleX(1); }
  }

  /* Lens flare where the bar catches the light. */
  .flare {
    position: absolute;
    left: 74%;
    top: 50%;
    width: 0;
    height: 0;
    transform: skewX(24deg);
    opacity: 0;
    animation:
      flare-in 520ms var(--ease-out) var(--t-flare) both,
      flare-breathe 3.6s ease-in-out calc(var(--t-flare) + 600ms) infinite;
  }
  .flare-core,
  .flare-h,
  .flare-v {
    position: absolute;
    left: 0;
    top: 0;
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }
  .flare-core {
    width: 7cqw;
    height: 7cqw;
    background: radial-gradient(circle, #fff 0 6%, oklch(0.92 0.06 var(--h-acc) / 0.9) 14%, oklch(0.7 0.14 var(--h-acc) / 0.35) 34%, transparent 66%);
  }
  .flare-h {
    width: 46cqw;
    height: 0.5cqw;
    background: linear-gradient(90deg, transparent, oklch(0.9 0.08 var(--h-acc) / 0.9) 50%, transparent);
  }
  .flare-v {
    width: 0.3cqw;
    height: 9cqw;
    background: linear-gradient(180deg, transparent, oklch(0.9 0.06 var(--h-acc) / 0.6) 50%, transparent);
  }
  @keyframes flare-in {
    0%   { opacity: 0; transform: skewX(24deg) scale(0.2); }
    60%  { opacity: 1; transform: skewX(24deg) scale(1.15); }
    100% { opacity: 1; transform: skewX(24deg) scale(1); }
  }
  @keyframes flare-breathe {
    0%, 100% { opacity: 1;    transform: skewX(24deg) scale(1); }
    50%      { opacity: 0.75; transform: skewX(24deg) scale(0.92); }
  }

  .wm-pro-in {
    flex: none;
    animation: pro-in 560ms var(--ease-out) var(--t-pro) both;
  }
  .wm-pro {
    display: block;
    font-family: var(--wm-face), var(--font-ui), sans-serif;
    font-weight: var(--wm-weight);
    font-style: var(--wm-style);
    font-size: 7.6cqw;
    line-height: 1;
    transform: skewX(var(--wm-skew));
    background-image:
      repeating-linear-gradient(180deg, transparent 0 0.09em, rgba(0, 10, 20, 0.4) 0.09em 0.12em),
      linear-gradient(180deg, var(--c-chrome-white) 12%, var(--c-accent-hi) 50%, var(--c-accent) 92%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    -webkit-text-stroke: 0.02em var(--c-ink);
    filter: drop-shadow(0 0 0.18em var(--c-glow));
  }
  @keyframes pro-in {
    0%   { opacity: 0; transform: translateY(2.4cqw); }
    100% { opacity: 1; transform: translateY(0); }
  }

  /* ================= the lightning logo ================= */

  .bolt-logo {
    aspect-ratio: 2000 / 848;
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
  .wipe.art {
    overflow: hidden;
  }
  /* The ink outline: a wide stroke under the fill. */
  .edge {
    fill: var(--c-ink);
    stroke: var(--c-ink);
    stroke-width: 9;
    stroke-linejoin: round;
  }

  .bolt {
    filter: drop-shadow(0 0 1cqw var(--c-accent));
    opacity: 0.92;
  }
  .word {
    filter: drop-shadow(0 0.4cqw 0.8cqw rgba(0, 0, 0, 0.7)) drop-shadow(0 0 1.6cqw var(--c-glow));
  }
  .pro {
    filter: drop-shadow(0 0 1cqw var(--c-glow));
  }
  .pro-in {
    animation: pro-in 560ms var(--ease-out) var(--t-pro) both;
  }

  .sweep-mask {
    overflow: hidden;
    mask-size: 100% 100%;
    -webkit-mask-size: 100% 100%;
  }
  .sweep {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 14%;
    background: linear-gradient(90deg, transparent, oklch(0.98 0.03 var(--h) / 0.75) 50%, transparent);
    transform: translateX(-120%) skewX(-24deg);
    animation: sweep 4.2s cubic-bezier(0.5, 0, 0.3, 1) var(--t-sweep) infinite;
  }
  @keyframes sweep {
    0%        { transform: translateX(-120%) skewX(-24deg); }
    32%, 100% { transform: translateX(760%) skewX(-24deg); }
  }

  /* `.line` and `.ring` are only switched on by the neon look. */
  .line,
  .ring {
    display: none;
  }

  /* Neon: lit outlines over a dark, faintly tinted fill, inside a ring. */
  .look-neon .line {
    display: inline;
    fill: none;
    stroke: var(--c-chrome-top);
    stroke-width: 3.5;
    stroke-linejoin: round;
  }
  .look-neon .face,
  .look-neon .bolt use[fill^='url(#bmx-bolt-fill)'] {
    opacity: 0.16;
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
    box-shadow: 0 0 1.2cqw var(--c-accent), inset 0 0 1.2cqw var(--c-accent);
    animation: ring-in 700ms var(--ease-out) var(--t-start) both;
  }
  @keyframes ring-in {
    0%   { opacity: 0; transform: scale(0.92); }
    100% { opacity: 0.85; transform: scale(1); }
  }

  /* ================= readout ================= */

  .readout {
    display: flex;
    justify-content: center;
    margin-top: clamp(24px, 6vh, 64px);
    animation: fade-in 600ms ease-out var(--t-readout) both;
  }
  .leaving .readout {
    animation: lift 250ms ease-out both;
  }

  .status {
    color: var(--c-ui);
    font-family: var(--font-ui), system-ui, sans-serif;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.4em;
    /* Letter-spacing trails the last glyph; this re-centres the word. */
    margin-right: -0.4em;
  }

  .dots span {
    animation: dot 1.4s ease-in-out infinite;
  }
  .dots span:nth-child(2) { animation-delay: 0.2s; }
  .dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes dot {
    0%, 100% { opacity: 0.15; }
    40%      { opacity: 1; }
  }

  .press {
    animation: pulse 1.8s ease-in-out infinite;
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

  /* ---- boot log (debug, ?bootlog=1) ---- */
  .bootlog {
    position: absolute;
    left: 50%;
    bottom: max(14px, env(safe-area-inset-bottom, 0px));
    z-index: 3;
    transform: translateX(-50%);
    width: min(560px, calc(100% - 28px));
    margin: 0;
    padding: 0;
    list-style: none;
    pointer-events: none;
  }
  .bootlog li {
    display: flex;
    gap: 8px;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    line-height: 1.5;
    color: oklch(0.62 0.03 var(--h));
  }
  .bootlog li.done { color: oklch(0.4 0.02 var(--h)); }
  .mark-ok { flex: none; width: 2ch; text-align: right; color: var(--c-ui-strong); }
  .text { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

  /* ---- scanlines: the one retro note, fine and faint over everything ---- */
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
      --logo-w: min(980px, 94vw, 110vh);
    }
  }

  /* Motion is decoration. */
  @media (prefers-reduced-motion: reduce) {
    .splash *,
    .splash {
      animation: none !important;
    }
    .sweep,
    .sweep-window {
      display: none;
    }
    .halo,
    .flare {
      opacity: 0.6;
    }
    .splash.leaving {
      opacity: 0;
      transition: opacity 400ms ease-out 200ms;
    }
  }
</style>
