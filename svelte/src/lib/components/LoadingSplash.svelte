<script lang="ts">
  /**
   * First-load title card: the logo on black while the real work runs (GPU
   * device, then ~40 effect pipelines compiling), then a fade into the app.
   *
   * Deliberately minimal. The animated version is being designed separately;
   * this is the light placeholder until then: one fade in, three pulsing dots,
   * one fade out.
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
    <div class="stage">
      <!-- One SVG for the whole mark: fewer layers to composite than one per
           part, and nothing inside it animates. -->
      <svg class="mark" viewBox="0 0 2000 848" aria-hidden="true">
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

        <g class="bolt">
          <path class="edge" d={BOLT_LOGO.bolt} fill-rule="evenodd" />
          <path d={BOLT_LOGO.bolt} fill-rule="evenodd" fill="url(#bmx-bolt-fill)" />
          <path d={BOLT_LOGO.bolt} fill-rule="evenodd" fill="url(#bmx-scan)" />
        </g>
        <g class="word">
          <path class="edge" d={BOLT_LOGO.word} fill-rule="evenodd" />
          <path d={BOLT_LOGO.word} fill-rule="evenodd" fill="url(#bmx-face)" />
          <path d={BOLT_LOGO.word} fill-rule="evenodd" fill="url(#bmx-scan)" />
        </g>
        <g class="pro">
          <path class="edge" d={BOLT_LOGO.pro} fill-rule="evenodd" />
          <path d={BOLT_LOGO.pro} fill-rule="evenodd" fill="url(#bmx-pro-fill)" />
          <path d={BOLT_LOGO.pro} fill-rule="evenodd" fill="url(#bmx-scan)" />
        </g>
      </svg>

      <div class="readout">
        {#if armed}
          <span class="press">
            <span class="fine">PRESS ANY KEY</span><span class="coarse">TAP TO START</span>
          </span>
        {:else}
          <span class="dots" aria-hidden="true"><span></span><span></span><span></span></span>
        {/if}
      </div>
    </div>

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
    animation: fade-out 500ms ease-out 200ms both;
  }

  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .mark {
    display: block;
    width: var(--logo-w);
    height: auto;
    overflow: visible;
    filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.7)) drop-shadow(0 0 22px var(--c-glow));
    will-change: opacity, transform;
    animation: mark-in 700ms cubic-bezier(0.22, 1, 0.36, 1) 150ms both;
  }
  .leaving .mark {
    animation: mark-out 400ms ease-in both;
  }
  @keyframes mark-in {
    from { opacity: 0; transform: scale(0.97); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes mark-out {
    from { opacity: 1; transform: scale(1); }
    to   { opacity: 0; transform: scale(1.03); }
  }

  /* The ink outline: a wide stroke under each fill. */
  .edge {
    fill: var(--c-ink);
    stroke: var(--c-ink);
    stroke-width: 9;
    stroke-linejoin: round;
  }
  .bolt {
    opacity: 0.92;
  }

  /* ---- readout ---- */
  .readout {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 16px;
    margin-top: clamp(24px, 6vh, 64px);
    animation: fade-in 500ms ease-out 700ms both;
  }
  .leaving .readout {
    animation: fade-out 200ms ease-out both;
  }

  .dots {
    display: inline-flex;
    gap: 10px;
  }
  .dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--c-ui);
    animation: dot 1.4s ease-in-out infinite;
  }
  .dots span:nth-child(2) { animation-delay: 0.2s; }
  .dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes dot {
    0%, 100% { opacity: 0.15; }
    40%      { opacity: 1; }
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
