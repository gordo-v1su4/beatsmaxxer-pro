<script lang="ts">
  /**
   * First-load title card. The stall it covers is real work, not a fake delay:
   * the GPU device has to be acquired, then the effect pipelines compile.
   *
   * The mark is the Beatsmaxxer Pro logo, its letterforms traced from the art
   * (svelte/scripts/splash/trace.py) and filled here, rather than
   * shipped as a raster, so it stays sharp at any size and every colour can
   * be changed from one place: `--logo-hue` (and `--logo-shift` for the warm
   * accents) at the top of the style block. `?hue=210` overrides it in the
   * browser for quick comparisons; `?splash=hold` keeps the card up.
   *
   * The animation plays in beats: the ring opens, the bolt strikes and flashes
   * the screen, BEATSMAXXER slams in from the left with a chromatic glitch,
   * PRO follows, then the sparkles come on. Once loading
   * is done (`armed`), it shows PRESS ANY KEY until the minimum hold runs out.
   * On `go` the mark punches forward and the card fades out.
   *
   * Every keyframe in this file animates `transform` or `opacity`, and nothing
   * else. The stall behind this card blocks the main thread: the GPU device
   * request and pipeline compiles hold it for whole seconds. Compositor-driven
   * animations keep running through that; anything touching layout, paint,
   * `filter` or a rAF tick freezes with the app, which is what made the old
   * card look crashed on first open (V1S-161). Static filters are fine; only
   * animating them is not.
   *
   * The boot log strip underneath is written from JS, so it *does* freeze
   * during a block, and that is intended: the line frozen on screen is the
   * step that is taking the time. The hairline above it is the liveness proof.
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
  const detail = $derived(known ? `PREVIEW PIPELINE ${done} / ${total}` : 'INITIALISING');

  // Last five only: the strip grows upward from the bottom of the screen, so
  // an uncapped log would eventually walk over the mark.
  const tail = $derived($bootLog.slice(-5));

  /** `?hue=` for trying palettes without editing CSS. */
  const hueOverride = $derived.by(() => {
    if (typeof window === 'undefined') return '';
    const hue = Number(new URLSearchParams(window.location.search).get('hue'));
    return Number.isFinite(hue) && hue > 0 ? `--logo-hue:${hue}` : '';
  });

</script>

{#if phase !== 'ready'}
  <div
    class="splash"
    class:leaving
    role="status"
    aria-live="polite"
    aria-label="Loading Beatsmaxxer Pro"
    style={hueOverride}
  >
    <span class="halo" aria-hidden="true"></span>
    <span class="stars" aria-hidden="true"></span>

    <div class="stage">
      <!-- The whole mark is laid out in container units, so one width scales
           every part together and nothing drifts apart at phone size. -->
      <div class="logo" aria-hidden="true">
        <div class="ring"><span class="ring-stars"></span></div>

        <!-- Shared shapes and paints. Each visible layer below is its own
             <svg> rather than a <g>: transforms on SVG children run on the
             main thread, transforms on an HTML-level <svg> box run on the
             compositor, and only the latter keeps animating through a stall.
             The letterforms are traced from the logo art (scripts/splash). -->
        <svg class="defs" width="0" height="0">
          <defs>
            <path id="bmx-word" d={LOGO_WORD} fill-rule="evenodd" />
            <path id="bmx-pro" d={LOGO_PRO} fill-rule="evenodd" />
            <path id="bmx-bolt" d={LOGO_BOLT} fill-rule="evenodd" />
            <linearGradient id="bmx-face" gradientUnits="userSpaceOnUse" x1="0" y1="270" x2="0" y2="700">
              <stop offset="0" style="stop-color: var(--c-face-top)" />
              <stop offset="0.3" style="stop-color: var(--c-face-top)" />
              <stop offset="0.42" style="stop-color: var(--c-face-mid)" />
              <stop offset="0.5" style="stop-color: var(--c-face-mid)" />
              <stop offset="0.66" style="stop-color: var(--c-face-low)" />
              <stop offset="1" style="stop-color: var(--c-face-low)" />
            </linearGradient>
            <linearGradient id="bmx-pro-fill" gradientUnits="userSpaceOnUse" x1="0" y1="560" x2="0" y2="645">
              <stop offset="0.1" style="stop-color: var(--c-pro-top)" />
              <stop offset="0.5" style="stop-color: var(--c-face-mid)" />
              <stop offset="0.9" style="stop-color: var(--c-pro-low)" />
            </linearGradient>
            <linearGradient id="bmx-bolt-fill" gradientUnits="userSpaceOnUse" x1="1300" y1="20" x2="700" y2="750">
              <stop offset="0" style="stop-color: var(--c-bolt-hi)" />
              <stop offset="0.55" style="stop-color: var(--c-bolt-mid)" />
              <stop offset="1" style="stop-color: var(--c-bolt-lo)" />
            </linearGradient>
            <pattern id="bmx-scan" width="20" height="9" patternUnits="userSpaceOnUse">
              <rect width="20" height="2.5" fill="rgba(0,16,16,0.28)" />
            </pattern>
          </defs>
        </svg>

        <svg class="art bolt" viewBox="0 0 2000 848">
          <use href="#bmx-bolt" class="edge" />
          <use href="#bmx-bolt" fill="url(#bmx-bolt-fill)" />
          <use href="#bmx-bolt" fill="url(#bmx-scan)" />
        </svg>

        <div class="art word-slam">
          <svg class="art word-base" viewBox="0 0 2000 848">
            <use href="#bmx-word" class="edge" />
            <use href="#bmx-word" fill="url(#bmx-face)" />
            <use href="#bmx-word" fill="url(#bmx-scan)" />
          </svg>
          <svg class="art ghost ga" viewBox="0 0 2000 848"><use href="#bmx-word" /></svg>
          <svg class="art ghost gb" viewBox="0 0 2000 848"><use href="#bmx-word" /></svg>
        </div>

        <div class="art pro-slide">
          <svg class="art" viewBox="0 0 2000 848">
            <use href="#bmx-pro" class="edge" />
            <use href="#bmx-pro" fill="url(#bmx-pro-fill)" />
            <use href="#bmx-pro" fill="url(#bmx-scan)" />
          </svg>
        </div>

        <span class="spark s1"></span>
        <span class="spark s2"></span>
        <span class="spark s3"></span>
        <span class="spark s4"></span>
        <span class="spark s5"></span>
      </div>

      <div class="readout">
        <span class="phase">{label}</span>

        <div class="meter" class:sweeping={!known && !armed} aria-hidden="true">
          {#each Array(segments) as _, i (i)}
            <span class="seg" class:on={i < filled} style="--i:{i}"></span>
          {/each}
        </div>

        {#if armed}
          <span class="detail press">
            <span class="fine">PRESS ANY KEY</span><span class="coarse">TAP TO START</span>
          </span>
        {:else}
          <span class="detail">{detail}</span>
        {/if}
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

    <span class="flash" aria-hidden="true"></span>
    <div class="scanlines" aria-hidden="true"></div>
    <div class="vignette" aria-hidden="true"></div>
  </div>
{/if}

<style>
  /*
    Palette
    ───────
    Every colour on the card derives from two numbers, so changing the look is
    one edit:

      --logo-hue    the lead colour: the wordmark top, the UI accents, the glow
      --logo-shift  how far the warm accents (wordmark bottom, bolt, PRO base)
                    rotate away from it; negative goes toward green and yellow

    The ring and PRO top take fixed offsets the other way, toward blue and
    violet, the same relationships the original art uses. OKLCH keeps the
    lightness steady as the hue moves, so any hue stays legible on black.
  */
  .splash {
    --logo-hue: 178;
    --logo-shift: -48;

    --h: var(--logo-hue);
    --h-warm: calc(var(--logo-hue) + var(--logo-shift));

    --c-face-top: oklch(0.8 0.13 var(--h));
    --c-face-mid: oklch(0.97 0.035 var(--h));
    --c-face-low: oklch(0.9 0.17 var(--h-warm));
    --c-ink: oklch(0.1 0.02 var(--h));
    --c-bolt-hi: oklch(0.93 0.19 calc(var(--h-warm) + 12));
    --c-bolt-mid: oklch(0.8 0.21 calc(var(--h-warm) + 22));
    --c-bolt-lo: oklch(0.55 0.17 calc(var(--h-warm) + 28));
    --c-ring: oklch(0.87 0.055 calc(var(--h) + 100));
    --c-pro-top: oklch(0.83 0.1 calc(var(--h) + 48));
    --c-pro-low: oklch(0.92 0.16 var(--h-warm));
    --c-ghost-a: oklch(0.75 0.17 calc(var(--h) + 30));
    --c-ghost-b: oklch(0.65 0.25 calc(var(--h) + 160));
    --c-glow: oklch(0.75 0.14 var(--h) / 0.4);
    --c-field: oklch(0.13 0.025 var(--h));
    --c-ui: oklch(0.86 0.1 var(--h));
    --c-ui-strong: oklch(0.76 0.13 var(--h));
    --c-ui-deep: oklch(0.6 0.11 var(--h));
    --c-ui-dim: oklch(0.5 0.03 var(--h));
    --c-ui-faint: oklch(0.38 0.02 var(--h));

    /* Timeline, in one place so the beats can be re-spaced together. */
    --t-ring: 100ms;
    --t-bolt: 420ms;
    --t-impact: 760ms;
    --t-word: 640ms;
    --t-glitch: 1060ms;
    --t-pro: 1150ms;
    --t-spark: 1300ms;
    --t-readout: 1350ms;

    /* Size: as wide as the screen allows, but short enough to leave the
       readout and log their room when a phone lies on its side. */
    --logo-w: min(980px, 94vw, 112vh);
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
    background: #030405;
    animation: fade-in 220ms ease-out both;
  }

  .splash.leaving {
    animation: fade-out 560ms cubic-bezier(0.4, 0, 0.9, 0.4) 300ms both;
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
    background: radial-gradient(60% 50% at 50% 44%, var(--c-glow), transparent 70%);
    opacity: 0.35;
    animation: halo 4.2s ease-in-out var(--t-impact) infinite;
  }
  @keyframes halo {
    0%, 100% { opacity: 0.35; }
    50%      { opacity: 0.6; }
  }

  /* Field stars: six repeating dots at coprime spacings read as random. */
  .stars {
    position: absolute;
    inset: -200px;
    pointer-events: none;
    background-image:
      radial-gradient(1.1px 1.1px at 17% 23%, rgba(255, 255, 255, 0.85), transparent 100%),
      radial-gradient(1px 1px at 63% 11%, rgba(210, 255, 245, 0.7), transparent 100%),
      radial-gradient(1.4px 1.4px at 82% 41%, rgba(255, 255, 255, 0.6), transparent 100%),
      radial-gradient(1px 1px at 34% 67%, rgba(220, 255, 240, 0.55), transparent 100%),
      radial-gradient(1.2px 1.2px at 91% 78%, rgba(255, 255, 255, 0.5), transparent 100%),
      radial-gradient(1px 1px at 8% 88%, rgba(200, 240, 255, 0.6), transparent 100%);
    background-size: 163px 149px, 211px 197px, 127px 181px, 241px 173px, 179px 227px, 139px 211px;
    opacity: 0.4;
    animation: drift 240s linear infinite;
  }
  @keyframes drift {
    from { transform: translate3d(0, 0, 0); }
    to   { transform: translate3d(-163px, -149px, 0); }
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
    animation: punch 620ms cubic-bezier(0.3, 0, 0.8, 0.2) both;
  }
  @keyframes punch {
    0%   { transform: scale(1); opacity: 1; }
    25%  { transform: scale(0.97); opacity: 1; }
    100% { transform: scale(1.14); opacity: 0; }
  }

  .ring {
    position: absolute;
    left: 23.5cqw;
    top: 4.5cqw;
    width: 54.5cqw;
    height: 35cqw;
    border-radius: 50%;
    border: 0.75cqw solid var(--c-ring);
    background: radial-gradient(
      closest-side,
      oklch(0.2 0.05 calc(var(--h) - 20)) 0%,
      oklch(0.12 0.03 var(--h)) 70%,
      #040606 100%
    );
    box-shadow:
      0 0 2cqw oklch(0.87 0.06 calc(var(--h) + 100) / 0.35),
      inset 0 0 3cqw rgba(0, 0, 0, 0.8);
    overflow: hidden;
    animation: ring-in 560ms cubic-bezier(0.2, 1.3, 0.4, 1) var(--t-ring) both;
  }
  @keyframes ring-in {
    0%   { opacity: 0; transform: scale(0.5) rotate(-10deg); }
    100% { opacity: 1; transform: scale(1) rotate(0deg); }
  }

  /* Dust inside the ring, the depth in the original. */
  .ring-stars {
    position: absolute;
    inset: 0;
    background-image:
      radial-gradient(0.18cqw 0.18cqw at 20% 30%, rgba(255, 255, 255, 0.9), transparent 100%),
      radial-gradient(0.12cqw 0.12cqw at 70% 20%, rgba(255, 255, 255, 0.7), transparent 100%),
      radial-gradient(0.15cqw 0.15cqw at 40% 75%, rgba(255, 255, 255, 0.6), transparent 100%),
      radial-gradient(0.1cqw 0.1cqw at 85% 65%, rgba(255, 255, 255, 0.8), transparent 100%);
    background-size: 9cqw 7cqw, 13cqw 9cqw, 7cqw 11cqw, 11cqw 8cqw;
    opacity: 0.7;
  }

  /* Every art layer shares the 2000 x 848 board, so they register exactly. */
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
  /* The ink outline: a wide stroke drawn under the fill, which is how the
     art separates its letters from the field. */
  .edge {
    fill: var(--c-ink);
    stroke: var(--c-ink);
    stroke-width: 9;
    stroke-linejoin: round;
  }

  .bolt {
    filter: drop-shadow(0 0 1.2cqw oklch(0.8 0.2 calc(var(--h-warm) + 22) / 0.55));
    transform-origin: 50% 50%;
    animation:
      strike 340ms cubic-bezier(0.6, 0, 0.9, 0.6) var(--t-bolt) both,
      flicker 3.7s steps(1, end) calc(var(--t-impact) + 1.4s) infinite;
  }
  @keyframes strike {
    0%   { opacity: 0; transform: translate(14cqw, -26cqw) scale(1.15); }
    60%  { opacity: 1; }
    100% { opacity: 1; transform: translate(0, 0) scale(1); }
  }
  /* A neon tube losing contact for two frames, now and then. */
  @keyframes flicker {
    0%, 100% { opacity: 1; }
    91%      { opacity: 0.45; }
    93%      { opacity: 1; }
    95%      { opacity: 0.6; }
    97%      { opacity: 1; }
  }

  /* Screen flash on the strike, tinted, not white. */
  .flash {
    position: absolute;
    inset: 0;
    z-index: 5;
    pointer-events: none;
    background: radial-gradient(70% 70% at 52% 45%, oklch(0.95 0.08 var(--h)), transparent 80%);
    opacity: 0;
    animation: flash 420ms ease-out var(--t-impact) both;
  }
  .splash.leaving .flash {
    animation: flash 420ms ease-out both;
  }
  @keyframes flash {
    0%   { opacity: 0; }
    12%  { opacity: 0.55; }
    100% { opacity: 0; }
  }

  /* ---- wordmark ---- */
  .word-slam {
    animation: slam 560ms cubic-bezier(0.16, 1.02, 0.28, 1) var(--t-word) both;
  }
  @keyframes slam {
    0%   { opacity: 0; transform: translateX(-70cqw) scaleX(1.5); }
    55%  { opacity: 1; transform: translateX(1.4cqw) scaleX(0.96); }
    100% { opacity: 1; transform: translateX(0) scaleX(1); }
  }

  .word-base {
    filter: drop-shadow(0 0 1.6cqw var(--c-glow));
  }

  /* Chromatic slivers: the same silhouette in two off-hues, knocked sideways
     for a few frames on landing and then every few seconds. */
  .ghost {
    opacity: 0;
    mix-blend-mode: screen;
  }
  .ga {
    fill: var(--c-ghost-a);
    animation:
      glitch-a 280ms steps(1, end) var(--t-glitch) both,
      glitch-a 280ms steps(1, end) calc(var(--t-glitch) + 5s) infinite;
  }
  .gb {
    fill: var(--c-ghost-b);
    animation:
      glitch-b 280ms steps(1, end) var(--t-glitch) both,
      glitch-b 280ms steps(1, end) calc(var(--t-glitch) + 5s) infinite;
  }
  @keyframes glitch-a {
    0%   { opacity: 0.7;  transform: translate(-0.6cqw, -0.15cqw); }
    30%  { opacity: 0.5;  transform: translate(0.35cqw, 0.08cqw); }
    60%  { opacity: 0.65; transform: translate(-0.25cqw, 0); }
    100% { opacity: 0;    transform: none; }
  }
  @keyframes glitch-b {
    0%   { opacity: 0.65; transform: translate(0.6cqw, 0.15cqw); }
    30%  { opacity: 0.45; transform: translate(-0.4cqw, 0); }
    60%  { opacity: 0.6;  transform: translate(0.2cqw, -0.08cqw); }
    100% { opacity: 0;    transform: none; }
  }

  /* ---- PRO ---- */
  .pro-slide {
    animation: pro-in 460ms cubic-bezier(0.2, 1.25, 0.35, 1) var(--t-pro) both;
  }
  @keyframes pro-in {
    0%   { opacity: 0; transform: translateX(16cqw); }
    100% { opacity: 1; transform: translateX(0); }
  }

  /* ---- sparkles ----
     A four-point star is two crossed gradients clipped to a star; the glow is
     a static drop-shadow, and the twinkle is scale and opacity only. */
  .spark {
    position: absolute;
    width: var(--sz);
    height: var(--sz);
    margin: calc(var(--sz) / -2) 0 0 calc(var(--sz) / -2);
    background: radial-gradient(circle, #fff 0 12%, oklch(0.95 0.06 var(--h)) 30%, transparent 70%);
    clip-path: polygon(50% 0, 55% 45%, 100% 50%, 55% 55%, 50% 100%, 45% 55%, 0 50%, 45% 45%);
    opacity: 0;
    animation:
      spark-in 420ms cubic-bezier(0.2, 1.4, 0.4, 1) var(--d) both,
      twinkle 2.6s ease-in-out calc(var(--d) + 420ms) infinite;
  }
  .s1 { left: 25cqw;   top: 8.5cqw;  --sz: 7cqw;   --d: var(--t-spark); }
  .s2 { left: 75.8cqw; top: 9.3cqw;  --sz: 5.5cqw; --d: calc(var(--t-spark) + 120ms); }
  .s3 { left: 23.5cqw; top: 34.5cqw; --sz: 4cqw;   --d: calc(var(--t-spark) + 240ms); }
  .s4 { left: 76.8cqw; top: 35.6cqw; --sz: 3cqw;   --d: calc(var(--t-spark) + 330ms); }
  .s5 { left: 86cqw;   top: 21.5cqw; --sz: 2.6cqw; --d: calc(var(--t-spark) + 420ms); }
  @keyframes spark-in {
    0%   { opacity: 0; transform: scale(0) rotate(-90deg); }
    100% { opacity: 1; transform: scale(1) rotate(0deg); }
  }
  @keyframes twinkle {
    0%, 100% { opacity: 1;   transform: scale(1) rotate(0deg); }
    50%      { opacity: 0.5; transform: scale(0.7) rotate(12deg); }
  }

  /* ---- readout ---- */
  .readout {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: min(420px, 80vw);
    margin-top: clamp(10px, 3vh, 36px);
    animation: fade-in 400ms ease-out var(--t-readout) both;
  }

  .phase {
    color: var(--c-ui);
    font-family: var(--font-ui), system-ui, sans-serif;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.3em;
  }

  /* Segmented meter: one block per preview pipeline. */
  .meter {
    display: flex;
    gap: 3px;
    width: 100%;
    margin: 13px 0 10px;
  }

  .seg {
    position: relative;
    flex: 1 1 0;
    height: 9px;
    background: oklch(0.2 0.025 var(--h));
    box-shadow: inset 0 0 0 1px oklch(0.28 0.04 var(--h));
  }

  /* The fill is a layer revealed by opacity, never a swapped `background`, so
     the pre-count charge keeps running through a main-thread stall. */
  .seg::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, var(--c-ui), var(--c-ui-strong));
    box-shadow: inset 0 0 0 1px var(--c-ui), 0 0 10px var(--c-glow);
    opacity: 0;
    transition: opacity 140ms linear;
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

  .detail {
    color: var(--c-ui-dim);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 10px;
    letter-spacing: 0.16em;
  }

  .press {
    color: var(--c-ui);
    animation: blink 1.1s steps(1, end) infinite;
  }
  .press .coarse { display: none; }
  @media (pointer: coarse) {
    .press .fine { display: none; }
    .press .coarse { display: inline; }
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.25; }
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
    padding: 0 20px max(12px, env(safe-area-inset-bottom, 0px));
    pointer-events: none;
    animation: fade-in 300ms ease-out 180ms both;
  }

  .wire,
  .lines {
    width: min(640px, 100%);
  }

  /* ---- the liveness hairline ----
     Fixed geometry and a single translated child, so the compositor runs it
     without the main thread and it keeps sweeping through a blocked compile. */
  .wire {
    position: relative;
    height: 2px;
    overflow: hidden;
    background: oklch(0.6 0.11 var(--h) / 0.12);
  }

  .shuttle {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 26%;
    background: linear-gradient(90deg, transparent, var(--c-ui-deep) 42%, var(--c-face-mid) 52%, var(--c-ui-deep) 62%, transparent);
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
    font-size: 12px;
    line-height: 1.5;
    color: oklch(0.65 0.03 var(--h));
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

  /* ---- CRT dressing ---- */
  .scanlines {
    position: absolute;
    inset: 0;
    z-index: 6;
    pointer-events: none;
    opacity: 0.25;
    background: repeating-linear-gradient(
      180deg,
      rgba(0, 0, 0, 0) 0px,
      rgba(0, 0, 0, 0) 2px,
      rgba(0, 0, 0, 0.5) 3px,
      rgba(0, 0, 0, 0.5) 4px
    );
  }
  .vignette {
    position: absolute;
    inset: 0;
    z-index: 6;
    pointer-events: none;
    background: radial-gradient(120% 90% at 50% 50%, transparent 54%, rgba(0, 0, 0, 0.74));
  }

  /* ---- phone ----
     The mark keeps one line at every width: at 375px it is still ~60px tall,
     which reads. Only the type around it shrinks to the phone floor. */
  @media (max-width: 820px), (pointer: coarse) and (max-height: 500px) {
    .splash {
      --logo-w: min(980px, 96vw, 100vh);
    }
    .readout {
      width: min(420px, calc(100% - 28px));
    }
    .phase {
      letter-spacing: 0.24em;
    }
    .detail,
    .lines li {
      font-size: 11px;
    }
    .seg {
      height: 8px;
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
      margin-top: 6px;
    }
    .meter {
      margin: 8px 0 6px;
    }
  }

  /* Motion is decoration; the readout still carries the information. */
  @media (prefers-reduced-motion: reduce) {
    .splash *,
    .splash {
      animation: none !important;
    }
    .ghost,
    .flash {
      opacity: 0;
    }
    .spark {
      opacity: 1;
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
