<script lang="ts">
  /**
   * First-load title card. The stall it covers is real work, not a fake delay:
   * the GPU device has to be acquired, then the 52KB module shader compiles
   * once per canvas as each preview builds its pipeline.
   *
   * BEATS flies in from the left, MAXXER from the right, they collide on the
   * centre line and flash, then PRO scoots in small at the end. On completion
   * it says HERE WE GO and animates off rather than blinking out.
   *
   * The meter is one segment per preview pipeline, so the blocks lighting up
   * are the actual work finishing — not a timer dressed up as progress. The
   * status line names the step underneath it.
   *
   * No webfont and no asset: this has to render instantly and offline inside
   * the Tauri shell, before anything else in the app exists.
   *
   * Add ?splash=hold to keep it up while iterating on the design.
   */
  interface Props {
    /** 'gpu' while the adapter/device is acquired, 'shaders' while pipelines
        compile, 'go' to play the exit, 'ready' to unmount. */
    phase: 'gpu' | 'shaders' | 'go' | 'ready';
    done?: number;
    total?: number;
  }
  let { phase, done = 0, total = 0 }: Props = $props();

  const leaving = $derived(phase === 'go');
  // Fall back to a plausible block count only for the pre-count phase, so the
  // meter has something to sweep across before the denominator is known.
  const segments = $derived(total > 0 ? total : 12);
  const filled = $derived(phase === 'go' ? segments : Math.min(done, segments));
  const known = $derived(phase === 'shaders' && total > 0);

  const label = $derived(phase === 'gpu' ? 'ACQUIRING GPU DEVICE' : 'COMPILING SHADERS');
  const detail = $derived(known ? `PREVIEW PIPELINE ${done} / ${total}` : 'INITIALISING');
</script>

{#if phase !== 'ready'}
  <div class="splash" class:leaving role="status" aria-live="polite" aria-label="Loading Beatsmaxxer Pro">
    <div class="stage">
      <div class="title">
        <span class="half left">BEATS</span><span class="half right">MAXXER</span><span class="pro">PRO</span>
        <span class="impact" aria-hidden="true"></span>
      </div>

      <div class="readout">
        <span class="phase">{label}</span>

        <div class="meter" class:sweeping={!known && phase !== 'go'} aria-hidden="true">
          {#each Array(segments) as _, i (i)}
            <span class="seg" class:on={i < filled} style="--i:{i}"></span>
          {/each}
        </div>

        <span class="detail">{detail}</span>
      </div>
    </div>

    <div class="scanlines" aria-hidden="true"></div>
    <div class="vignette" aria-hidden="true"></div>
  </div>
{/if}

<style>
  .splash {
    position: fixed;
    inset: 0;
    z-index: 4200;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background:
      radial-gradient(120% 90% at 50% 45%, rgba(20, 184, 166, 0.10), transparent 62%),
      rgba(4, 6, 7, 0.95);
    backdrop-filter: blur(18px) saturate(0.55);
    -webkit-backdrop-filter: blur(18px) saturate(0.55);
    animation: fade-in 220ms ease-out both;
  }

  /* Hand off rather than blink out: lift, brighten, then go. */
  .splash.leaving {
    animation: fade-out 620ms cubic-bezier(0.4, 0, 0.9, 0.4) 260ms both;
  }
  @keyframes fade-out {
    0%   { opacity: 1; transform: scale(1); }
    30%  { opacity: 1; transform: scale(1.012); }
    100% { opacity: 0; transform: scale(1.055); }
  }

  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: min(1100px, 92vw);
  }

  /* One baseline, so PRO sits at the end of the word rather than under it. */
  .title {
    position: relative;
    display: flex;
    align-items: baseline;
    justify-content: center;
    white-space: nowrap;
    font-family: var(--font-ui), system-ui, sans-serif;
    font-weight: 800;
    line-height: 1;
  }

  .half {
    font-size: clamp(32px, 6.2vw, 86px);
    letter-spacing: 0.01em;
    background: linear-gradient(180deg, #ffffff 0%, #a7fff2 26%, #2dd4bf 54%, #0d9488 82%, #0b5f57 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 0 12px rgba(45, 212, 191, 0.40));
  }

  /* The collision: each half arrives from its own side, overshoots slightly
     past the seam, then settles — that snap back is what reads as impact. */
  .left  { animation: slam-left  600ms cubic-bezier(0.16, 1.02, 0.28, 1) 120ms both; }
  .right { animation: slam-right 600ms cubic-bezier(0.16, 1.02, 0.28, 1) 120ms both; }

  @keyframes slam-left {
    0%   { opacity: 0; transform: translateX(-58vw); }
    64%  { opacity: 1; transform: translateX(12px); }
    100% { opacity: 1; transform: translateX(0); }
  }
  @keyframes slam-right {
    0%   { opacity: 0; transform: translateX(58vw); }
    64%  { opacity: 1; transform: translateX(-12px); }
    100% { opacity: 1; transform: translateX(0); }
  }

  /* Smaller, and after the word — not stacked under it. */
  .pro {
    margin-left: clamp(7px, 0.9vw, 15px);
    font-size: clamp(12px, 2.1vw, 28px);
    font-weight: 600;
    letter-spacing: 0.30em;
    color: #7fe8dc;
    animation: scoot 440ms cubic-bezier(0.2, 0.9, 0.25, 1) 680ms both;
  }
  @keyframes scoot {
    0%   { opacity: 0; transform: translateX(22px); }
    100% { opacity: 1; transform: translateX(0); }
  }

  /* White flash on the seam at the moment the halves meet. */
  .impact {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 3px;
    height: 116%;
    background: #eafffb;
    opacity: 0;
    transform: translate(-50%, -50%) scaleY(0.2);
    animation: impact 360ms ease-out 600ms both;
  }
  @keyframes impact {
    0%   { opacity: 0;    transform: translate(-50%, -50%) scaleY(0.2); filter: blur(0); }
    18%  { opacity: 0.95; transform: translate(-50%, -50%) scaleY(1);   filter: blur(2px); }
    100% { opacity: 0;    transform: translate(-50%, -50%) scaleY(1.1); filter: blur(14px); }
  }

  /* ---- readout ---- */
  .readout {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: min(420px, 80vw);
    margin-top: clamp(22px, 4vh, 46px);
    animation: fade-in 400ms ease-out 950ms both;
  }

  .phase {
    color: #99f6e4;
    font-family: var(--font-ui), system-ui, sans-serif;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.30em;
  }

  /* Segmented power meter: one block per preview pipeline. */
  .meter {
    display: flex;
    gap: 3px;
    width: 100%;
    margin: 13px 0 10px;
  }

  .seg {
    flex: 1 1 0;
    height: 9px;
    background: #0e1c1b;
    box-shadow: inset 0 0 0 1px #16302d;
    transition: background 140ms linear, box-shadow 140ms linear;
  }

  .seg.on {
    background: linear-gradient(180deg, #7df0e0, #14b8a6);
    box-shadow:
      inset 0 0 0 1px #5eead4,
      0 0 10px rgba(45, 212, 191, 0.55);
  }

  /* Before the denominator is known there is nothing honest to fill, so run a
     charge across the blocks instead of parking at zero. */
  .meter.sweeping .seg {
    animation: charge 1.25s ease-in-out infinite;
    animation-delay: calc(var(--i) * 70ms);
  }
  @keyframes charge {
    0%, 70%, 100% { background: #0e1c1b; box-shadow: inset 0 0 0 1px #16302d; }
    22%           { background: #14b8a6; box-shadow: inset 0 0 0 1px #5eead4, 0 0 10px rgba(45,212,191,0.5); }
  }

  .detail {
    color: #5c6a72;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 10px;
    letter-spacing: 0.16em;
  }

  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

  /* ---- CRT dressing ---- */
  .scanlines {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.3;
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
    pointer-events: none;
    background: radial-gradient(120% 90% at 50% 50%, transparent 54%, rgba(0, 0, 0, 0.74));
  }

  /* Motion is decoration; the readout still carries the information. */
  @media (prefers-reduced-motion: reduce) {
    .splash, .splash.leaving, .left, .right, .pro, .readout { animation: none; }
    .left, .right, .pro, .readout { opacity: 1; transform: none; }
    .impact { display: none; }
    .meter.sweeping .seg { animation: none; }
  }
</style>
