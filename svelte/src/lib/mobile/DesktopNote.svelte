<script lang="ts">
  /**
   * "You are looking at the small version" — shown once per session, portrait
   * only.
   *
   * The phone is a representation of the rack, not the rack. Someone who lands
   * here from a link has no way to know that ten modules exist, so the note
   * says it plainly and hands them the address to open on a computer. It is
   * deliberately not a modal: it sits under the top bar, the app runs behind
   * it, and it is gone the moment it is dismissed.
   *
   * Portrait only because landscape is the performance posture — nothing that
   * is merely informative belongs over the picture while someone is playing.
   */
  import { Monitor, X, Copy, Check } from '@lucide/svelte';
  import { isMobileShell, orientation } from './mobileEnv';
  import { desktopNoteDismissed } from './mobileUi';

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  // The address a person should type on their computer — not `location.href`.
  // href here usually carries ?mobile=1, and handing someone the one parameter
  // that forces the phone shell on a desktop browser is exactly backwards.
  const address = $derived.by(() => {
    if (typeof window === 'undefined') return '';
    const { origin, pathname } = window.location;
    return (origin + (pathname === '/' ? '' : pathname)).replace(/^https?:\/\//, '');
  });

  const show = $derived($isMobileShell && $orientation === 'portrait' && !$desktopNoteDismissed);

  function dismiss() {
    desktopNoteDismissed.set(true);
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(window.location.origin + window.location.pathname);
      copied = true;
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = false), 1600);
    } catch {
      // Clipboard is permission-gated and http:// origins do not get it at all.
      // The address is on screen either way, so a failure needs no message.
    }
  }
</script>

{#if show}
  <aside class="note" aria-label="About the phone version">
    <div class="head">
      <span class="icon" aria-hidden="true"><Monitor size={13} strokeWidth={1.75} /></span>
      <span class="kicker">PHONE EDITION</span>
      <button class="close" type="button" onclick={dismiss} aria-label="Dismiss">
        <X size={15} strokeWidth={2} />
      </button>
    </div>

    <p class="body">
      This is a stripped-down representation of the rack — <strong>one video, one effect</strong>
      at a time. The full ten-module rack, the arrangement lanes and the program bus run on desktop.
    </p>

    <button class="address" type="button" onclick={copyAddress} aria-label="Copy address">
      <span class="addr-label">OPEN ON A COMPUTER</span>
      <span class="addr-row">
        <span class="addr-text">{address}</span>
        <span class="addr-copy" class:done={copied} aria-hidden="true">
          {#if copied}<Check size={13} strokeWidth={2} />{:else}<Copy size={13} strokeWidth={1.75} />{/if}
        </span>
      </span>
    </button>
  </aside>
{/if}

<style>
  .note {
    position: fixed;
    /* Clears the phone top bar. The bar owns --m-topbar-h; 48px is the fallback
       so this never lands underneath it if the token is absent. */
    top: calc(var(--m-safe-top, 0px) + var(--m-topbar-h, 48px) + 8px);
    left: calc(var(--m-safe-left, 0px) + 10px);
    right: calc(var(--m-safe-right, 0px) + 10px);
    z-index: 3200;

    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 12px 12px 11px;
    border: 1px solid var(--m-line-soft, #1e2226);
    border-top-color: #2c3a3a;
    border-radius: var(--m-radius, 2px);
    background:
      radial-gradient(120% 120% at 0% 0%, rgba(45, 212, 191, 0.09), transparent 62%),
      rgba(19, 20, 22, 0.97);
    box-shadow: var(--m-card-shadow, 0 18px 46px rgba(0, 0, 0, 0.78));
    backdrop-filter: blur(14px) saturate(0.7);
    -webkit-backdrop-filter: blur(14px) saturate(0.7);
    font-family: var(--font-ui);
    animation: note-in 320ms cubic-bezier(0.2, 0.9, 0.25, 1) 420ms both;
  }

  @keyframes note-in {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .head {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 18px;
  }

  .icon {
    display: flex;
    color: var(--m-accent, #2dd4bf);
  }

  .kicker {
    flex: 1;
    color: var(--m-accent-soft, #99f6e4);
    font-size: var(--m-text-xs, 11px);
    font-weight: 500;
    letter-spacing: var(--m-track-wide, 0.26em);
    text-transform: uppercase;
    line-height: 1;
  }

  /* 44px of hit area, pulled back into the padding so it does not stretch the
     header row it sits in. */
  .close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--m-tap, 44px);
    height: var(--m-tap, 44px);
    margin: -13px -12px -13px 0;
    border: 0;
    background: none;
    color: var(--m-ink-faint, #4a515c);
  }
  .close:active {
    color: var(--m-ink, #e5e7eb);
  }

  .body {
    margin: 0;
    color: #9aa3ad;
    font-size: var(--m-text-md, 13px);
    line-height: 1.45;
    letter-spacing: 0.005em;
  }
  .body strong {
    color: #d6dde4;
    font-weight: 500;
  }

  .address {
    display: flex;
    flex-direction: column;
    gap: 5px;
    width: 100%;
    min-height: var(--m-tap, 44px);
    padding: 7px 9px;
    border: 1px solid var(--m-line-soft, #1e2226);
    border-radius: var(--m-radius, 2px);
    background: var(--m-sunken, #070809);
    text-align: left;
  }
  .address:active {
    border-color: #2a3a3a;
  }

  .addr-label {
    color: var(--m-ink-faint, #4a515c);
    font-family: var(--font-ui);
    font-size: var(--m-text-xs, 11px);
    font-weight: 500;
    letter-spacing: var(--m-track, 0.16em);
    line-height: 1;
  }

  .addr-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .addr-text {
    flex: 1;
    overflow: hidden;
    color: #c9d3da;
    font-family: var(--font-mono);
    font-size: var(--m-text-md, 13px);
    letter-spacing: 0.02em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .addr-copy {
    display: flex;
    flex: 0 0 auto;
    color: var(--m-ink-faint, #4a515c);
  }
  .addr-copy.done {
    color: var(--m-accent, #2dd4bf);
  }

  @media (prefers-reduced-motion: reduce) {
    .note {
      animation: none;
    }
  }
</style>
