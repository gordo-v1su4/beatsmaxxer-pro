<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    onclick?: () => void;
    accent?: boolean;
    danger?: boolean;
    icon?: Snippet;
  }
  let { label, onclick, accent = false, danger = false, icon }: Props = $props();
  let hov = $state(false);
  const c = $derived(danger ? '#ef4444' : accent ? '#22c55e' : '#6a7080');
</script>

<button
  type="button"
  {onclick}
  onmouseenter={() => (hov = true)}
  onmouseleave={() => (hov = false)}
  style="height:26px;padding-inline:7px;background:{hov
    ? `linear-gradient(180deg,${c}18,${c}0c)`
    : 'linear-gradient(180deg,#191b1d,#131517)'};border-style:solid;border-width:1px;border-color:{hov
    ? `${c}22`
    : '#222428'} {hov ? `${c}33` : '#1a1c1e'} {hov ? `${c}33` : '#1a1c1e'} {hov
    ? `${c}33`
    : '#1a1c1e'};border-radius:3px;cursor:pointer;color:{hov ? c : '#3a4050'};font-family:var(--font-ui);font-weight:700;font-size:9px;letter-spacing:0.1em;display:flex;align-items:center;gap:4px;transition:all 0.1s;box-shadow:inset 0 1px 2px rgba(0,0,0,0.4)"
>
  {#if icon}{@render icon()}{/if}{label}
</button>
