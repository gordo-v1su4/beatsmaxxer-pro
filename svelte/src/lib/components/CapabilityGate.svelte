<script lang="ts">
  /**
   * Corner notice for a browser with no WebGPU. Desktop surface only.
   *
   * On the phone the same news is delivered by `$lib/mobile/NoGpuPanel.svelte`,
   * which takes the place of the picture and keeps the selected module on
   * screen. Two notices saying the same thing is worse than one, and a
   * bottom-right toast is exactly where the phone's transport lives — so this
   * component stands down while the mobile shell is mounted.
   *
   * The markup used to be one long inline `style`, which meant it could not be
   * touched by a media query. It is class-based now so the narrow/short cases
   * (a small desktop window, a phone on the desktop path via ?desktop=1) can be
   * handled without changing the desktop appearance.
   */
  import type { CapabilityState } from '$lib/rendering/webgpu/capability';
  import { isMobileShell } from '$lib/mobile/mobileEnv';

  interface Props {
    state: CapabilityState;
  }

  let { state }: Props = $props();

  const show = $derived(state.renderer === 'webgpu_unavailable' && !$isMobileShell);
</script>

{#if show}
  <div class="cap-note" role="status" aria-live="polite">
    <strong>WebGPU unavailable</strong> — previews may be blank.
    {#if state.reason}
      <span class="cap-reason">{state.reason}</span>
    {/if}
  </div>
{/if}

<style>
  .cap-note {
    position: fixed;
    right: 12px;
    bottom: 12px;
    z-index: 9999;
    max-width: 320px;
    padding: 8px 12px;
    border: 1px solid #ef444455;
    border-radius: 4px;
    background: #1a1212;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    color: #fca5a5;
    font-family: var(--font-ui);
    font-size: 10px;
  }

  .cap-reason {
    display: block;
    margin-top: 4px;
    color: #888;
    font-size: 9px;
    overflow-wrap: anywhere;
  }

  /* Narrow or short viewport: a 320px box pinned 12px from a corner sits under
     the notch cut-out on a phone and half off the screen next to a landscape
     home indicator. Span the width inside the safe area instead. */
  @media (max-width: 520px), (max-height: 460px) {
    .cap-note {
      right: calc(12px + env(safe-area-inset-right, 0px));
      bottom: calc(12px + env(safe-area-inset-bottom, 0px));
      left: calc(12px + env(safe-area-inset-left, 0px));
      max-width: none;
      font-size: 11px;
    }
    .cap-reason {
      font-size: 10px;
    }
  }
</style>
