<script lang="ts">
  /**
   * First-load cover. The stall it hides is real work, not a fake delay: the
   * GPU device has to be acquired, then the 52KB module shader compiles once
   * per canvas as each preview builds its pipeline. Reporting which of those
   * is happening beats a spinner that could mean anything.
   *
   * Same dark-glass treatment as AccessGate and the analysis prompt, so this
   * reads as part of the same family rather than a third overlay style.
   */
  interface Props {
    /** 'gpu' while the adapter/device is being acquired, 'shaders' while
        pipelines compile, 'ready' to dismiss. */
    phase: 'gpu' | 'shaders' | 'ready';
    /** Canvases with pipelines built, for the progress readout. */
    done?: number;
    total?: number;
  }
  let { phase, done = 0, total = 0 }: Props = $props();

  const label = $derived(phase === 'gpu' ? 'ACQUIRING GPU' : 'COMPILING SHADERS');
  // Only claim a count once we know the denominator; a bar that fills to a
  // guessed total is worse than no bar.
  const counted = $derived(phase === 'shaders' && total > 0);
  const pct = $derived(counted ? Math.min(100, Math.round((done / total) * 100)) : 0);
</script>

{#if phase !== 'ready'}
  <div class="splash-backdrop" role="status" aria-live="polite">
    <div class="splash-panel">
      <h1>BEATSMAXXER PRO</h1>
      <p class="splash-phase">{label}</p>

      <div class="splash-track" class:is-indeterminate={!counted}>
        <div class="splash-fill" style={counted ? `width:${pct}%` : ''}></div>
      </div>

      <p class="splash-detail">
        {#if counted}
          {done} / {total} previews
        {:else}
          starting up
        {/if}
      </p>
    </div>
  </div>
{/if}

<style>
  /* Same treatment as AccessGate: BEAT FX teal, dark glass, square. */
  .splash-backdrop {
    position: fixed;
    inset: 0;
    z-index: 4200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(6, 8, 9, 0.82);
    backdrop-filter: blur(16px) saturate(0.6);
    -webkit-backdrop-filter: blur(16px) saturate(0.6);
  }

  .splash-panel {
    display: flex;
    flex-direction: column;
    width: min(320px, 100%);
    padding: 22px;
    border: 1px solid #1d2b2b;
    border-radius: 2px;
    background:
      radial-gradient(120% 100% at 50% 0%, rgba(20, 184, 166, 0.08), transparent 70%),
      rgba(10, 12, 13, 0.94);
    box-shadow:
      0 24px 80px rgba(0, 0, 0, 0.9),
      inset 0 1px 0 rgba(153, 246, 228, 0.07);
    color: #8f9aa6;
    font-family: var(--font-ui);
  }

  .splash-panel h1 {
    margin: 0 0 10px;
    color: #99f6e4;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }

  .splash-phase {
    margin: 0 0 12px;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .splash-track {
    position: relative;
    height: 2px;
    overflow: hidden;
    background: #16201f;
  }

  .splash-fill {
    height: 100%;
    background: #14b8a6;
    transition: width 160ms linear;
  }

  /* No denominator yet, so sweep instead of pretending to measure. */
  .splash-track.is-indeterminate .splash-fill {
    width: 34%;
    animation: splash-sweep 1.1s ease-in-out infinite;
  }

  @keyframes splash-sweep {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(320%); }
  }

  .splash-detail {
    margin: 10px 0 0;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    letter-spacing: 0.08em;
    color: #5c6a72;
  }

  @media (prefers-reduced-motion: reduce) {
    .splash-track.is-indeterminate .splash-fill {
      animation: none;
      width: 100%;
      opacity: 0.4;
    }
    .splash-fill { transition: none; }
  }
</style>
