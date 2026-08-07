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
      <h1>BEATSMAXXING</h1>
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
  /* Same treatment as the analysis prompt: BEAT FX teal, dark glass, square. */
  .gate-backdrop {
    position: fixed;
    inset: 0;
    z-index: 4000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(6, 8, 9, 0.82);
    backdrop-filter: blur(16px) saturate(0.6);
    -webkit-backdrop-filter: blur(16px) saturate(0.6);
  }

  .gate-panel {
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

  .gate-panel h1 {
    margin: 0 0 8px;
    color: #99f6e4;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }

  .gate-panel p {
    margin: 0;
    font-size: 10.5px;
    line-height: 1.5;
  }

  .gate-panel input {
    margin-top: 16px;
    padding: 9px 10px;
    border: 1px solid #37414a;
    border-radius: 2px;
    background: #0a0c0d;
    color: #ccfbf1;
    font-family: var(--font-mono);
    font-size: 13px;
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
    font-size: 10px;
  }

  .gate-panel button {
    min-height: 32px;
    margin-top: 14px;
    border: 1px solid #14b8a6;
    border-radius: 2px;
    background: linear-gradient(180deg, #0d2b28, #08201d);
    box-shadow: inset 0 1px 0 rgba(153, 246, 228, 0.12);
    color: #99f6e4;
    cursor: pointer;
    font-family: var(--font-ui);
    font-size: 9px;
    font-weight: 500;
    letter-spacing: 0.14em;
  }

  .gate-panel button:disabled {
    border-color: #2a3138;
    background: #101315;
    color: #5d666f;
    cursor: not-allowed;
  }
</style>
