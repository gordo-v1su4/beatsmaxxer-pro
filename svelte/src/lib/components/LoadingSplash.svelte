<script lang="ts">
  /**
   * First-load title card: the logo on black while the real work runs (GPU
   * device, then ~40 effect pipelines compiling), then a fade into the app.
   *
   * Logo only, no scenery: the bolt, BEATS, MAXXER, the swoosh and PRO arrive
   * as separate pieces in about a second, over a short warp burst, with a
   * loading percentage and the current boot step underneath.
   *
   * The letterforms are traced from the logo art (svelte/scripts/splash/
   * trace.py). Colour is `--logo-hue` / `--logo-shift` at the top of the style
   * block; `?splash=hold` keeps the card up, `?bootlog=1` shows the boot log.
   *
   * Everything that moves animates `opacity` or `transform` only. The stall
   * behind this card blocks the main thread for whole seconds and only
   * compositor-driven animations keep running through it (V1S-161). Filters
   * are static and the logo is never re-rasterised while it fades.
   */
  import { bootLog } from '$lib/stores/bootLog';
  import { BOLT_LOGO } from './splashLogoPaths';
  import { splitWordmark } from './splashLogoParts';

  const { beats, maxxer, swoosh, pro } = splitWordmark(BOLT_LOGO);
  const WORD = BOLT_LOGO.word;

  // Back to front, in the order they arrive.
  const LAYERS = [
    { cls: 'bolt', d: BOLT_LOGO.bolt, fill: 'url(#bmx-bolt-fill)' },
    { cls: 'beats', d: beats, fill: 'url(#bmx-face)' },
    { cls: 'maxxer', d: maxxer, fill: 'url(#bmx-face)' },
    { cls: 'swoosh', d: swoosh, fill: 'url(#bmx-face)' },
    { cls: 'pro', d: pro, fill: 'url(#bmx-pro-fill)' }
  ];

  // The glint is clipped to the whole mark with a CSS mask, which wants an image.
  const GLINT_MASK = `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 848"><path fill-rule="evenodd" d="${BOLT_LOGO.word}${BOLT_LOGO.pro}"/></svg>`
  )}")`;

  // Fixed, not random: the burst looks the same on every load.
  const STREAKS = Array.from({ length: 18 }, (_, i) => ({
    angle: Math.round((i * 360) / 18 + ((i * 37) % 11) - 5),
    delay: (i * 23) % 140,
    reach: (0.75 + ((i * 53) % 25) / 100).toFixed(2)
  }));

  interface Props {
    /** 'gpu' while the adapter/device is acquired, 'shaders' while pipelines
        compile, 'armed' once the work is done but the minimum hold has not
        run out, 'go' to play the exit, 'ready' to unmount. */
    phase: 'gpu' | 'shaders' | 'armed' | 'go' | 'ready';
    done?: number;
    total?: number;
  }
  let { phase, done = 0, total = 0 }: Props = $props();

  // Device bring-up is the first tenth; shader compiles are the rest.
  const percent = $derived(
    phase === 'gpu'
      ? 4
      : phase === 'shaders'
        ? total > 0
          ? 10 + Math.floor((90 * Math.min(done, total)) / total)
          : 10
        : 100
  );
  const current = $derived($bootLog.at(-1));

  // ?splash=hold: any key or click replays the intro, for reviewing the motion.
  let take = $state(0);
  $effect(() => {
    if (new URLSearchParams(window.location.search).get('splash') !== 'hold') return;
    const replay = () => take++;
    window.addEventListener('keydown', replay);
    window.addEventListener('pointerdown', replay);
    return () => {
      window.removeEventListener('keydown', replay);
      window.removeEventListener('pointerdown', replay);
    };
  });

  const leaving = $derived(phase === 'go');
  const armed = $derived(phase === 'armed' || phase === 'go');

  const showBootLog =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('bootlog');
  // Last five only: the strip grows upward from the bottom of the screen.
  const tail = $derived($bootLog.slice(-5));
</script>

{#if phase !== 'ready'}
  <div
    class="splash"
    class:leaving
    role="status"
    aria-live="polite"
    aria-label={armed ? 'Beatsmaxxer Pro, ready' : 'Beatsmaxxer Pro, loading'}
  >
    {#key take}
    <!-- Warp streaks: one short burst out from behind the logo, then gone. -->
    <div class="warp" aria-hidden="true">
      {#each STREAKS as s, i (i)}
        <span style="--a: {s.angle}deg; --d: {s.delay}ms; --r: {s.reach}"></span>
      {/each}
    </div>

    <div class="stage">
      <!-- One SVG per moving part, stacked on the same board, so each one is
           its own compositor layer and moves by transform alone. -->
      <div class="mark" aria-hidden="true">
        <svg class="defs" viewBox="0 0 2000 848">
          <defs>
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

        <div class="glow"></div>

        {#each LAYERS as layer (layer.cls)}
          <svg class="part {layer.cls}" viewBox="0 0 2000 848">
            <path class="edge" d={layer.d} fill-rule="evenodd" />
            <path d={layer.d} fill-rule="evenodd" fill={layer.fill} />
            <path d={layer.d} fill-rule="evenodd" fill="url(#bmx-scan)" />
          </svg>
        {/each}

        <!-- The strike: a flat white bolt that flashes as it lands. -->
        <svg class="part bolt-flash" viewBox="0 0 2000 848">
          <path d={BOLT_LOGO.bolt} fill-rule="evenodd" />
        </svg>

        <!-- RGB split on impact: flat cyan and magenta copies of the word that
             snap together into the chrome one. -->
        <svg class="part ghost ghost-c" viewBox="0 0 2000 848">
          <path d={WORD} fill-rule="evenodd" />
        </svg>
        <svg class="part ghost ghost-m" viewBox="0 0 2000 848">
          <path d={WORD} fill-rule="evenodd" />
        </svg>

        <!-- One glint across the finished mark, masked to its silhouette. -->
        <div class="glint" style="--mask: {GLINT_MASK}"><span></span></div>
      </div>

      <div class="readout">
        <div class="load">
          <span class="lbl">LOADING</span>
          <span class="pct">{String(percent).padStart(3, '0')}<small>%</small></span>
        </div>
        <div class="task">
          {#if armed}
            <span class="press">
              <span class="fine">PRESS ANY KEY</span><span class="coarse">TAP TO START</span>
            </span>
          {:else if current}
            {current.label}{current.note ? ` ${current.note}` : ''}
          {/if}
        </div>
      </div>
    </div>
    {/key}

    {#if showBootLog}
      <ol class="bootlog" aria-hidden="true">
        {#each tail as step (step.id)}
          <li class:done={step.state === 'done'}>
            <span class="ok">{step.state === 'done' ? 'ok' : '>'}</span>
            <span class="text">{step.label}{step.note ? ` ${step.note}` : ''}</span>
          </li>
        {/each}
      </ol>
    {/if}

    <div class="scanlines" aria-hidden="true"></div>
  </div>
{/if}

<style>
  /*
    Palette: every colour derives from two numbers.
      --logo-hue    the lead colour (chrome, UI, glow)
      --logo-shift  how far the accent (PRO, bolt) rotates from it; positive
                    moves toward blue
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

    --logo-w: min(900px, 88vw, 110vh);
  }

  /* The black is there from the first frame (app.html paints it too); only
     the mark fades in on top of it. */
  .splash {
    position: fixed;
    inset: 0;
    z-index: 4200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
      env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
    background: radial-gradient(60% 40% at 50% 45%, oklch(0.17 0.03 var(--h-acc)), #030507 75%);
  }
  .splash.leaving {
    animation: fade-out 250ms ease-out 50ms both;
  }

  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  /*
    Intro, ~1.4s from first paint, everything on transform/opacity:
      0      glow blooms, warp streaks burst out, the bolt drops from above
      140    the bolt lands: white flash, flicker
      180    BEATS slams in from the left edge
      240    MAXXER slams in from the right edge
      540    swoosh wipes out under the word
      560    impact: cyan/magenta copies snap together into the chrome
      680    PRO stamps down
      920    one glint runs across the finished mark
      1400+  the bolt crackles every 2.4s until the app is ready
  */
  .mark {
    position: relative;
    width: var(--logo-w);
    aspect-ratio: 2000 / 848;
  }
  .leaving .mark {
    animation: mark-out 200ms ease-in both;
  }
  @keyframes mark-out {
    from { opacity: 1; transform: scale(1); }
    to   { opacity: 0; transform: scale(1.03); }
  }

  /* Gradient and pattern defs shared by every part. Hidden by size, not
     display:none, which would drop the gradients in Chrome. */
  .defs {
    position: absolute;
    width: 0;
    height: 0;
  }

  .part {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.7)) drop-shadow(0 0 22px var(--c-glow));
    will-change: transform, opacity;
  }

  /* The ink outline: a wide stroke under each fill. */
  .edge {
    fill: var(--c-ink);
    stroke: var(--c-ink);
    stroke-width: 9;
    stroke-linejoin: round;
  }

  .glow {
    position: absolute;
    inset: -30% -10%;
    background: radial-gradient(50% 45% at 50% 52%, oklch(0.55 0.12 var(--h) / 0.32), transparent 70%);
    will-change: transform, opacity;
    animation: glow-in 500ms ease-out both;
  }
  @keyframes glow-in {
    from { opacity: 0; transform: scale(0.7); }
    to   { opacity: 1; transform: scale(1); }
  }

  /* The bolt drops from above, lands with a white flash, flickers, then
     crackles every few seconds while loading continues. */
  .bolt {
    transform-origin: 52% 40%;
    animation:
      bolt-strike 320ms cubic-bezier(0.55, 0, 1, 0.45) both,
      bolt-crackle 2.4s linear 1.4s infinite;
  }
  @keyframes bolt-strike {
    0%   { opacity: 0;    transform: translate(4%, -45%) scale(1.05); }
    20%  { opacity: 1; }
    45%  { opacity: 1;    transform: none; }
    60%  { opacity: 0.3; }
    75%  { opacity: 1; }
    85%  { opacity: 0.55; }
    100% { opacity: 0.92; transform: none; }
  }
  @keyframes bolt-crackle {
    0%, 8%, 100% { opacity: 0.92; }
    2%           { opacity: 0.35; }
    4%           { opacity: 1; }
    6%           { opacity: 0.5; }
  }

  .bolt-flash {
    fill: #fff;
    filter: drop-shadow(0 0 18px oklch(0.95 0.08 var(--h))) drop-shadow(0 0 48px var(--c-glow));
    opacity: 0;
    animation:
      flash 260ms ease-out 140ms both,
      flash-crackle 2.4s linear 1.4s infinite;
  }
  @keyframes flash {
    0%   { opacity: 0; }
    15%  { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes flash-crackle {
    0%, 6%, 100% { opacity: 0; }
    2%           { opacity: 0.55; }
  }

  /* BEATS and MAXXER come in from nearly off-screen on their own sides and
     meet under the bolt. */
  .beats { animation: slam-left 380ms cubic-bezier(0.16, 1, 0.3, 1) 180ms both; }
  .maxxer { animation: slam-right 380ms cubic-bezier(0.16, 1, 0.3, 1) 240ms both; }
  @keyframes slam-left {
    from { opacity: 0; transform: translateX(-75%) skewX(-18deg); }
    25%  { opacity: 1; }
    to   { opacity: 1; transform: none; }
  }
  @keyframes slam-right {
    from { opacity: 0; transform: translateX(75%) skewX(-18deg); }
    25%  { opacity: 1; }
    to   { opacity: 1; transform: none; }
  }

  .ghost {
    filter: none;
    mix-blend-mode: screen;
    opacity: 0;
  }
  .ghost-c { fill: oklch(0.82 0.15 200); animation: ghost-c 260ms ease-out 560ms both; }
  .ghost-m { fill: oklch(0.65 0.25 340); animation: ghost-m 260ms ease-out 560ms both; }
  @keyframes ghost-c {
    from { opacity: 0.9; transform: translate(-1.1%, 0.3%); }
    to   { opacity: 0;   transform: none; }
  }
  @keyframes ghost-m {
    from { opacity: 0.9; transform: translate(1.1%, -0.3%); }
    to   { opacity: 0;   transform: none; }
  }

  .swoosh {
    transform-origin: 23.8% 72%;
    animation: wipe 240ms cubic-bezier(0.3, 0.9, 0.3, 1) 540ms both;
  }
  @keyframes wipe {
    from { opacity: 0; transform: scaleX(0); }
    20%  { opacity: 1; }
    to   { opacity: 1; transform: scaleX(1); }
  }

  .pro {
    transform-origin: 72.5% 70%;
    animation: stamp 240ms cubic-bezier(0.34, 1.56, 0.64, 1) 680ms both;
  }
  @keyframes stamp {
    from { opacity: 0; transform: scale(1.6); }
    40%  { opacity: 1; }
    to   { opacity: 1; transform: scale(1); }
  }

  .glint {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    -webkit-mask: var(--mask) center / 100% 100% no-repeat;
    mask: var(--mask) center / 100% 100% no-repeat;
  }
  .glint span {
    position: absolute;
    top: -10%;
    bottom: -10%;
    left: 0;
    width: 16%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.9) 50%, transparent);
    will-change: transform;
    animation: glint 480ms cubic-bezier(0.45, 0, 0.25, 1) 920ms both;
  }
  @keyframes glint {
    from { transform: translateX(-160%) skewX(-22deg); }
    to   { transform: translateX(700%) skewX(-22deg); }
  }

  /* ---- warp burst ---- */
  .warp {
    position: absolute;
    left: 50%;
    top: 46%;
    width: 0;
    height: 0;
    pointer-events: none;
  }
  .warp span {
    position: absolute;
    left: 0;
    top: 0;
    width: 22vmax;
    height: 1.5px;
    background: linear-gradient(90deg, transparent, oklch(0.9 0.06 var(--h) / 0.8));
    transform-origin: 0 50%;
    opacity: 0;
    will-change: transform, opacity;
    animation: streak 620ms cubic-bezier(0.5, 0, 0.75, 0.4) var(--d) both;
  }
  @keyframes streak {
    from { opacity: 0;   transform: rotate(var(--a)) translateX(6vmax) scaleX(0.1); }
    25%  { opacity: 0.7; }
    to   { opacity: 0;   transform: rotate(var(--a)) translateX(calc(var(--r) * 70vmax)) scaleX(1); }
  }

  /* ---- readout ---- */
  .readout {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-top: clamp(20px, 5vh, 56px);
    font-family: var(--font-mono, ui-monospace, monospace);
    text-transform: uppercase;
    animation: fade-in 200ms ease-out 300ms both;
  }
  .leaving .readout {
    animation: fade-out 120ms ease-out both;
  }

  .load {
    display: flex;
    align-items: baseline;
    gap: 10px;
    font-variant-numeric: tabular-nums;
  }
  .lbl {
    font-size: 11px;
    letter-spacing: 0.3em;
    color: oklch(0.7 0.06 var(--h));
  }
  .pct {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--c-chrome-top);
    text-shadow: 0 0 12px var(--c-glow);
  }
  .pct small {
    font-size: 14px;
    margin-left: 2px;
    color: var(--c-accent-hi);
  }

  .task {
    height: 16px;
    max-width: min(560px, 90vw);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 11px;
    letter-spacing: 0.22em;
    color: oklch(0.68 0.05 var(--h));
  }

  .press {
    color: var(--c-ui);
    font-family: var(--font-ui), system-ui, sans-serif;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.32em;
    margin-right: -0.32em;
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

  @keyframes fade-in  { from { opacity: 0; } to { opacity: 1; } }
  @keyframes fade-out { from { opacity: 1; } to { opacity: 0; } }

  /* ---- boot log (debug, ?bootlog=1) ---- */
  .bootlog {
    position: absolute;
    left: 50%;
    bottom: max(14px, env(safe-area-inset-bottom, 0px));
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
  .ok { flex: none; width: 2ch; text-align: right; color: var(--c-ui); }
  .text { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

  /* ---- scanlines: static, faint, over everything ---- */
  .scanlines {
    position: absolute;
    inset: 0;
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

  @media (prefers-reduced-motion: reduce) {
    .splash *,
    .splash {
      animation: none !important;
    }
    .splash.leaving {
      opacity: 0;
      transition: opacity 300ms ease-out;
    }
  }
</style>
