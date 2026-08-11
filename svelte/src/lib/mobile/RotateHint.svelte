<script lang="ts">
  import { Smartphone, X } from '@lucide/svelte';
  import { isMobileShell, orientation } from './mobileEnv';
  import { rotateHintDismissed } from './mobileUi';

  /**
   * Rotating the phone to perform is the product, not a defect, so this is a
   * nudge rather than a wall: it never covers the picture, never intercepts a
   * tap meant for anything underneath it, and goes away for good the first time
   * it is acknowledged or the first time the phone actually turns.
   */

  const visible = $derived($isMobileShell && $orientation === 'portrait' && !$rotateHintDismissed);

  // Turning the phone is the acknowledgement. Coming back to portrait afterwards
  // and being told again would be nagging.
  $effect(() => {
    if ($orientation === 'landscape') rotateHintDismissed.set(true);
  });
</script>

{#if visible}
  <div class="rotate-hint-layer">
    <button
      type="button"
      class="rotate-hint"
      onclick={() => rotateHintDismissed.set(true)}
      aria-label="Dismiss: turn the phone sideways to perform"
    >
      <span class="glyph"><Smartphone size={16} /></span>
      <span class="label">TURN SIDEWAYS TO PERFORM</span>
      <span class="close" aria-hidden="true"><X size={14} /></span>
    </button>
  </div>
{/if}

<style>
  /*
    The layer spans the width so the pill can be centred, but it is transparent
    to input — only the pill itself takes pointer events, so the transport and
    the stepper directly underneath stay live while the hint is up.
  */
  .rotate-hint-layer {
    position: fixed;
    left: 0;
    right: 0;
    /* Clears the transport strip (two 48px rows plus its padding) so the nudge
       sits in the picture's dead space, not on top of the stepper. */
    bottom: calc(var(--m-safe-bottom, 0px) + 132px);
    z-index: 35;
    display: flex;
    justify-content: center;
    padding: 0 12px;
    pointer-events: none;
  }

  .rotate-hint {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 9px;
    /* Tall enough to hit, short enough not to read as a dialog. */
    min-height: 44px;
    max-width: 100%;
    padding: 0 8px 0 14px;
    margin: 0;
    border: 1px solid #23282e;
    border-radius: 22px;
    background: rgba(19, 20, 22, 0.94);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    color: #9aa4b0;
    cursor: pointer;
    font-family: var(--font-ui);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    animation: hint-in 260ms ease-out;
  }
  .rotate-hint:active {
    background: rgba(26, 28, 31, 0.96);
  }

  .glyph {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    color: #8ec5ff;
    /* The glyph does the explaining — a phone tipping onto its side. */
    animation: hint-tip 2.6s ease-in-out infinite;
    transform-origin: 50% 60%;
  }

  .label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.18em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .close {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    color: #4d545d;
  }

  @keyframes hint-tip {
    0%,
    55%,
    100% {
      transform: rotate(0deg);
    }
    25%,
    40% {
      transform: rotate(-90deg);
    }
  }

  @keyframes hint-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .glyph {
      animation: none;
      transform: rotate(-90deg);
    }
    .rotate-hint {
      animation: none;
    }
  }
</style>
