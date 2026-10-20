<script lang="ts">
  /** Self-contained title card while the GPU and effect pipelines warm up.
   * The supplied image runs through the rack's VHS shader. Motion uses
   * transform/opacity so it can keep running through main-thread stalls.
   * ?splash=hold keeps the card visible; ?bootlog=1 exposes startup details.
   */
  import { bootLog } from '$lib/stores/bootLog';
  import SplashArtwork from './SplashArtwork.svelte';

  interface Props {
    /** 'gpu' while the adapter/device is acquired, 'shaders' while pipelines
        compile, 'armed' for the explicit design preview, 'go' to play the
        automatic exit, 'ready' to unmount. */
    phase: 'gpu' | 'shaders' | 'armed' | 'go' | 'ready' | 'error';
    done?: number;
    total?: number;
    error?: string;
    onGraphicReady: (error?: string) => void;
  }
  let { phase, done = 0, total = 0, error = '', onGraphicReady }: Props = $props();
  // Device bring-up is the first tenth; shader compiles are the rest.
  const percent = $derived(
    phase === 'gpu'
      ? 4
      : phase === 'shaders' || phase === 'error'
        ? total > 0
          ? Math.min(99, 10 + Math.floor((90 * Math.min(done, total)) / total))
          : 10
        : 100
  );
  const current = $derived($bootLog.at(-1));

  const leaving = $derived(phase === 'go');
  const armed = $derived(phase === 'armed' || phase === 'go');

  const showBootLog =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('bootlog');
  // Last five only: the strip grows upward from the bottom of the screen.
  const tail = $derived($bootLog.slice(-5));
  const preview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('splash') === 'hold';
  let replayTake = $state(0);
</script>

{#if phase !== 'ready'}
  <div
    class="splash"
    class:leaving
    role="region"
    aria-label={armed ? 'Beatsmaxxer Pro, ready' : 'Beatsmaxxer Pro, loading'}
  >
    <div class="stage">
      <div class="mark">
        {#key replayTake}<SplashArtwork onReady={onGraphicReady} />{/key}
      </div>

      <div class="readout" role="status" aria-live="polite">
        <span class="lbl">{phase === 'error' ? 'STARTUP PAUSED' : armed ? 'READY' : 'LOADING'}</span>
        <span class="pct">{String(percent).padStart(3, '0')}<small>%</small></span>
        <div class="task">
          {#if phase === 'error'}
            {error} <button class="retry" onclick={() => window.location.reload()}>Reload</button>
          {:else if armed}
            {leaving ? 'Opening workspace…' : 'Workspace ready'}
          {:else if current}
            {current.label}{current.note ? ` ${current.note}` : ''}
          {/if}
        </div>
      </div>
    </div>

    {#if preview && phase === 'armed'}
      <button class="replay" onclick={() => replayTake++}>Replay animation</button>
    {/if}

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

  </div>
{/if}

<style>
  .splash {
    --c-chrome-top: #6bacae;
    --c-accent-hi: #6499bd;
    --c-ui: #93bcc7;
  }

  /* The black is there from the first frame (app.html paints it too); only
     the mark fades in on top of it. */
  .splash {
    position: fixed;
    inset: 0;
    overflow: hidden;
    z-index: 4200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
      env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
    background: #000201;
  }
  .splash.leaving {
    animation: fade-out 250ms ease-out 50ms both;
  }

  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .leaving .mark { animation: mark-out 250ms ease-in both; }
  @keyframes mark-out {
    from { opacity: 1; transform: scale(1); }
    to { opacity: 0; transform: scale(1.02); }
  }

  /* ---- readout ---- */
  .readout {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-top: calc(-1 * min(140px, 11vw, 16svh));
    font-family: 'Press Start 2P', var(--font-mono, ui-monospace, monospace);
    text-transform: uppercase;
    animation: fade-in 200ms ease-out 700ms both;
  }
  .leaving .readout {
    animation: fade-out 120ms ease-out both;
  }

  /* Arcade readout, after the attract-mode references: one pixel face,
     sized on its 8px grid so the glyphs stay crisp. */
  .lbl {
    font-size: 8px;
    letter-spacing: 0.25em;
    color: #649ba4;
  }
  .pct {
    font-size: 24px;
    line-height: 1;
    color: var(--c-chrome-top);
  }
  .pct small {
    font-size: 8px;
    margin-left: 4px;
    color: var(--c-accent-hi);
  }

  .task {
    min-height: 48px;
    max-width: min(640px, 92vw);
    margin-top: 6px;
    overflow: hidden;
    text-align: center;
    font-size: 8px;
    line-height: 10px;
    letter-spacing: 0.18em;
    color: #63818a;
  }

  .retry {
    display: block;
    margin: 12px auto 0;
    padding: 10px 16px;
    border: 1px solid currentColor;
    background: transparent;
    color: var(--c-ui);
    font: inherit;
    cursor: pointer;
  }
  .retry:focus-visible { outline: 2px solid var(--c-ui); outline-offset: 4px; }

  .replay {
    position: absolute;
    bottom: max(28px, env(safe-area-inset-bottom, 0px));
    padding: 10px 16px;
    border: 1px solid #334046;
    border-radius: 3px;
    background: #101518;
    color: #a9bbc2;
    font: 12px var(--font-mono, monospace);
    cursor: pointer;
  }
  .replay:hover { background: #192125; }
  .replay:focus-visible { outline: 2px solid var(--c-ui); outline-offset: 4px; }

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
    color: #63818a;
  }
  .bootlog li.done { color: #425159; }
  .ok { flex: none; width: 2ch; text-align: right; color: var(--c-ui); }
  .text { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

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
