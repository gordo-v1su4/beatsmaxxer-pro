<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    onclick?: () => void;
    accent?: boolean;
    danger?: boolean;
    disabled?: boolean;
    /**
     * Latched on. `accent` only tints the hover, which is right for a one-shot
     * like RANDOMIZE and wrong for a button that puts the app into a mode — a
     * mode has to be readable when the pointer is somewhere else entirely.
     */
    active?: boolean;
    title?: string;
    icon?: Snippet;
  }
  let {
    label,
    onclick,
    accent = false,
    danger = false,
    disabled = false,
    active = false,
    title,
    icon
  }: Props = $props();
  let hov = $state(false);
  const c = $derived(danger ? '#ef4444' : accent ? '#22c55e' : '#6a7080');
  const lit = $derived((hov || active) && !disabled);
</script>

<button
  type="button"
  class="top-btn"
  {disabled}
  {onclick}
  {title}
  aria-pressed={active ? true : undefined}
  onmouseenter={() => (hov = true)}
  onmouseleave={() => (hov = false)}
  style="height:26px;padding-inline:7px;background:{lit
    ? `linear-gradient(180deg,${c}${active ? '2c' : '18'},${c}0c)`
    : 'linear-gradient(180deg,#191b1d,#131517)'};border-style:solid;border-width:1px;border-color:{lit
    ? `${c}${active ? '55' : '22'}`
    : '#222428'} {lit ? `${c}${active ? '55' : '33'}` : '#1a1c1e'} {lit
    ? `${c}${active ? '55' : '33'}`
    : '#1a1c1e'} {lit
    ? `${c}${active ? '55' : '33'}`
    : '#1a1c1e'};border-radius:3px;cursor:{disabled ? 'not-allowed' : 'pointer'};color:{lit ? c : 'var(--ink-faint)'};opacity:{disabled ? 0.45 : 1};font-family:var(--font-ui);font-weight:500;font-size:9px;letter-spacing:0.1em;display:flex;align-items:center;gap:4px;transition:background var(--dur-control) var(--ease-out),border-color var(--dur-control) var(--ease-out),color var(--dur-control) var(--ease-out),box-shadow var(--dur-control) var(--ease-out),transform var(--dur-press) var(--ease-out);box-shadow:{lit ? `inset 0 1px 0 rgba(255,255,255,0.04),0 0 8px ${c}20` : 'var(--control-shadow)'}"
>
  {#if icon}{@render icon()}{/if}{label}
</button>

<style>
  .top-btn:active:not(:disabled) {
    transform: translateY(0.5px);
    box-shadow: var(--control-shadow-pressed) !important;
  }
  @media (prefers-reduced-motion: reduce) {
    .top-btn { transition-duration: 0ms !important; }
  }
</style>
