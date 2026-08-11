<script lang="ts">
  import {
    cacheState,
    cachedState,
    fetchAccessState,
    submitPin,
    type AccessState
  } from '$lib/access/accessGate';

  // Not named `state`: Svelte reads `$state` as a store subscription to a
  // variable of that name, which shadows the rune and fails svelte-check.
  let access = $state<AccessState>(cachedState());
  let pin = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);
  let pinInput = $state<HTMLInputElement>();

  $effect(() => {
    void (async () => {
      const next = await fetchAccessState();
      access = next;
      cacheState(next);
      if (next === 'locked') setTimeout(() => pinInput?.focus(), 0);
    })();
  });

  async function unlock(event: SubmitEvent) {
    event.preventDefault();
    if (busy || pin.length === 0) return;
    busy = true;
    error = null;
    const result = await submitPin(pin);
    busy = false;

    if (result === 'accepted') {
      pin = '';
      access = 'open';
      cacheState('open');
      return;
    }
    pin = '';
    error =
      result === 'throttled'
        ? 'Too many attempts. Wait a few minutes.'
        : result === 'rejected'
          ? 'Incorrect code.'
          : 'Could not reach the gate. Try again.';
    pinInput?.focus();
  }
</script>

{#if access === 'locked'}
  <div class="gate-backdrop">
    <form class="gate-panel" onsubmit={unlock}>
      <h1>BEATSMAXXER PRO</h1>
      <p>This deployment is private. Enter the access code to continue.</p>
      <input
        bind:this={pinInput}
        bind:value={pin}
        type="password"
        inputmode="numeric"
        autocomplete="off"
        aria-label="Access code"
        placeholder="ACCESS CODE"
        disabled={busy}
      />
      {#if error}<p class="gate-error" role="alert">{error}</p>{/if}
      <button type="submit" disabled={busy || pin.length === 0}>
        {busy ? 'CHECKING…' : 'UNLOCK'}
      </button>
    </form>
  </div>
{/if}

<style>
  /*
   * Sizing is driven by the custom properties below rather than by duplicated
   * rules, because the phone case has two independent triggers — a real phone
   * (media query) and the review path (`?mobile=1` on a desktop browser, which
   * puts `mobile-shell-active` on the wrapper but keeps a fine pointer and a
   * wide window). One set of values, two switches, and the desktop defaults are
   * never touched.
   */
  .gate-backdrop {
    --g-width: 320px;
    --g-pad: 22px;
    --g-h1: 13px;
    --g-p: 10.5px;
    --g-err: 10px;
    --g-field-h: 0px;
    --g-field-fs: 13px;
    --g-btn-h: 32px;
    --g-btn-fs: 9px;
    --g-btn-track: 0.14em;
    --g-stack: 16px;
    --g-align: center;
  }

  /* A phone. */
  @media (max-width: 820px), (pointer: coarse) and (max-height: 500px) {
    .gate-backdrop {
      --g-width: 360px;
      --g-pad: 18px;
      --g-h1: 14px;
      --g-p: 12px;
      --g-err: 11px;
      /* 44px is the tap floor and 16px is the iOS auto-zoom threshold — below
         it the field focus zooms the page in and never zooms back out. */
      --g-field-h: 44px;
      --g-field-fs: 16px;
      --g-btn-h: 44px;
      --g-btn-fs: 11px;
      --g-btn-track: 0.18em;
    }
  }

  /* The phone shell mounted on a desktop browser for review. */
  :global(.mobile-shell) .gate-backdrop,
  :global(.mobile-shell-active) .gate-backdrop {
    --g-width: 360px;
    --g-pad: 18px;
    --g-h1: 14px;
    --g-p: 12px;
    --g-err: 11px;
    --g-field-h: 44px;
    --g-field-fs: 16px;
    --g-btn-h: 44px;
    --g-btn-fs: 11px;
    --g-btn-track: 0.18em;
  }

  /* Phone lying down, or a short window: ~390px of height, most of which the
     software keyboard takes. Top-align and tighten so the submit button is
     never the thing that falls off the bottom. */
  @media (max-height: 460px) {
    .gate-backdrop {
      --g-align: flex-start;
      --g-pad: 15px;
      --g-stack: 10px;
    }
  }

  /* Same treatment as the analysis prompt: BEAT FX teal, dark glass, square. */
  .gate-backdrop {
    position: fixed;
    inset: 0;
    z-index: 4000;
    display: flex;
    align-items: var(--g-align);
    justify-content: center;
    padding: calc(20px + env(safe-area-inset-top, 0px)) calc(20px + env(safe-area-inset-right, 0px))
      calc(20px + env(safe-area-inset-bottom, 0px)) calc(20px + env(safe-area-inset-left, 0px));
    /* The keyboard shrinks the viewport under the panel; without a scroll here
       the button ends up behind the keys with no way to reach it. */
    overflow-y: auto;
    background: rgba(6, 8, 9, 0.82);
    backdrop-filter: blur(16px) saturate(0.6);
    -webkit-backdrop-filter: blur(16px) saturate(0.6);
  }

  .gate-panel {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    width: min(var(--g-width), 100%);
    padding: var(--g-pad);
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

  .gate-panel h1 {
    margin: 0 0 8px;
    color: #99f6e4;
    font-size: var(--g-h1);
    font-weight: 500;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }

  .gate-panel p {
    margin: 0;
    font-size: var(--g-p);
    line-height: 1.5;
  }

  .gate-panel input {
    min-height: var(--g-field-h);
    margin-top: var(--g-stack);
    padding: 9px 10px;
    border: 1px solid #37414a;
    border-radius: 2px;
    background: #0a0c0d;
    color: #ccfbf1;
    font-family: var(--font-mono);
    font-size: var(--g-field-fs);
    letter-spacing: 0.3em;
    text-align: center;
  }

  .gate-panel input:focus {
    border-color: #14b8a6;
    outline: none;
  }

  .gate-error {
    margin-top: 9px !important;
    color: #c46b6b;
    font-size: var(--g-err);
  }

  .gate-panel button {
    min-height: var(--g-btn-h);
    margin-top: calc(var(--g-stack) - 2px);
    border: 1px solid #14b8a6;
    border-radius: 2px;
    background: linear-gradient(180deg, #0d2b28, #08201d);
    box-shadow: inset 0 1px 0 rgba(153, 246, 228, 0.12);
    color: #99f6e4;
    cursor: pointer;
    font-family: var(--font-ui);
    font-size: var(--g-btn-fs);
    font-weight: 500;
    letter-spacing: var(--g-btn-track);
  }

  .gate-panel button:disabled {
    border-color: #2a3138;
    background: #101315;
    color: #5d666f;
    cursor: not-allowed;
  }
</style>
