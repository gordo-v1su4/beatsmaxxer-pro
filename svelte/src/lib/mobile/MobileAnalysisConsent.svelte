<script lang="ts">
  /**
   * The phone's hosted-analysis disclosure.
   *
   * Same decision and same stored answer as the desktop bar — audio leaving the
   * device is not something a shell decides on the operator's behalf, and the
   * phone had no way to ask, which is why it never offered hosted analysis at
   * all. Its own sheet rather than a reuse of the desktop markup: that prompt is
   * inline in TopBar, sized for a pointer, and this has to clear a thumb.
   */
  interface Props {
    fileName: string;
    onResolve: (choice: 'analyze' | 'local' | 'cancel', remember: boolean) => void;
  }

  let { fileName, onResolve }: Props = $props();
  let remember = $state(false);
  let analyzeButton = $state<HTMLButtonElement>();

  $effect(() => {
    // Focus the conservative option, not the one that uploads.
    analyzeButton?.focus();
  });
</script>

<div
  class="consent-backdrop"
  role="presentation"
  onclick={(e) => {
    // A tap outside is a dismissal, not consent.
    if (e.target === e.currentTarget) onResolve('cancel', false);
  }}
>
  <div
    class="consent-sheet"
    role="dialog"
    aria-modal="true"
    aria-labelledby="mobile-consent-title"
    aria-describedby="mobile-consent-description"
  >
    <h2 id="mobile-consent-title">Analyze this upload?</h2>
    <p id="mobile-consent-description">
      Analyze loads the song locally and sends a bounded, prepared excerpt to the configured
      hosted analysis service. Repository evidence does not establish that service's retention
      or ownership terms.
    </p>
    <p class="consent-file">{fileName}</p>

    <label class="consent-remember">
      <input type="checkbox" bind:checked={remember} />
      <span>Remember this choice and apply it to new songs automatically</span>
    </label>

    <div class="consent-actions">
      <button
        bind:this={analyzeButton}
        type="button"
        class="consent-btn consent-btn-local"
        onclick={() => onResolve('local', remember)}
      >
        LOCAL ONLY
      </button>
      <button
        type="button"
        class="consent-btn consent-btn-analyze"
        onclick={() => onResolve('analyze', remember)}
      >
        ANALYZE
      </button>
    </div>
    <button type="button" class="consent-cancel" onclick={() => onResolve('cancel', false)}>
      CANCEL
    </button>
  </div>
</div>

<style>
  .consent-backdrop {
    position: fixed;
    inset: 0;
    /* Above everything, including the first-run PHONE EDITION note at 3200.
       A disclosure that decides whether audio leaves the device must never end
       up under an informational panel, where it would be invisible and its
       buttons untappable while a song sat waiting on an answer. */
    z-index: 4000;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  /* Bottom sheet rather than a centred modal: the actions have to sit under a
     thumb, and the drawer this rises from is already anchored to that edge. */
  .consent-sheet {
    width: 100%;
    max-width: 520px;
    background: #101215;
    border-top: 1px solid #1e2228;
    border-radius: 14px 14px 0 0;
    padding: 18px 18px calc(18px + env(safe-area-inset-bottom, 0px));
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.6);
  }

  h2 {
    margin: 0;
    font-family: var(--font-ui);
    font-size: 15px;
    font-weight: 600;
    color: #e8eaed;
    letter-spacing: 0.02em;
  }

  p {
    margin: 0;
    font-family: var(--font-ui);
    font-size: 12px;
    line-height: 1.5;
    color: #8b939e;
  }

  .consent-file {
    font-family: var(--font-mono);
    font-size: 11px;
    color: #2dd4bf;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .consent-remember {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    font-family: var(--font-ui);
    font-size: 12px;
    color: #8b939e;
    cursor: pointer;
  }

  .consent-remember input {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    accent-color: #2dd4bf;
  }

  .consent-actions {
    display: flex;
    gap: 10px;
  }

  .consent-btn {
    flex: 1;
    min-height: 48px;
    border-radius: 8px;
    border: 1px solid #2a3038;
    background: #171a1f;
    color: #c8cdd4;
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.1em;
    cursor: pointer;
  }

  .consent-btn-analyze {
    border-color: #2dd4bf55;
    background: linear-gradient(180deg, #123330, #0e2724);
    color: #2dd4bf;
  }

  .consent-btn-local {
    border-color: #3a424c;
  }

  .consent-cancel {
    min-height: 44px;
    background: none;
    border: none;
    color: #5b636e;
    font-family: var(--font-ui);
    font-size: 11px;
    letter-spacing: 0.1em;
    cursor: pointer;
  }
</style>
