<script lang="ts">
  import { onMount } from 'svelte';
  import { ChevronDown } from '@lucide/svelte';

  type Option = { value: string | number; label: string };
  let { label, value, options, onchange }: { label: string; value: string | number; options: Option[]; onchange: (value: string | number) => void } = $props();
  let open = $state(false);
  let root = $state<HTMLDivElement>();
  const selectedLabel = $derived(options.find(option => String(option.value) === String(value))?.label ?? String(value));

  onMount(() => {
    const onPointer = (event: PointerEvent) => { if (open && !root?.contains(event.target as Node)) open = false; };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') open = false; };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onPointer); window.removeEventListener('keydown', onKey); };
  });
</script>

<div class="footer-menu" bind:this={root} data-open={open}>
  <span class="footer-menu-label">{label}</span>
  <button type="button" class="footer-menu-btn" aria-haspopup="menu" aria-expanded={open} aria-label={label} onclick={() => open = !open}>
    {selectedLabel}<ChevronDown size={9} />
  </button>
  {#if open}
    <div class="footer-menu-panel" role="menu">
      {#each options as option}
        <button type="button" role="menuitemradio" aria-checked={String(option.value) === String(value)} class:selected={String(option.value) === String(value)} onclick={() => { onchange(option.value); open = false; }}>{option.label}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .footer-menu { position:relative; display:flex; align-items:center; gap:6px; flex-shrink:0; }
  .footer-menu-label { font:7px var(--font-ui); letter-spacing:.08em; color:#6a7a8a; }
  .footer-menu-btn { height:26px; min-width:68px; padding-inline:7px 5px; display:flex; align-items:center; justify-content:space-between; gap:4px; border:1px solid #222428; border-radius:3px; color:#7faaa3; background:linear-gradient(180deg,#191b1d,#131517); box-shadow:inset 0 1px 2px rgba(0,0,0,.4); cursor:pointer; font:8px var(--font-ui); letter-spacing:.06em; }
  .footer-menu-btn[aria-expanded='true'], .footer-menu-btn:focus-visible { color:#22c55e; border-color:#22c55e55; outline:none; background:linear-gradient(180deg,#22c55e2c,#22c55e0c); }
  .footer-menu-panel { position:absolute; right:0; bottom:calc(100% + 6px); z-index:40; min-width:112px; padding:8px; display:flex; flex-direction:column; gap:4px; background:linear-gradient(180deg,#1a1c1e,#121416); border:1px solid #25282c; border-radius:4px; box-shadow:0 10px 28px rgba(0,0,0,.72); }
  .footer-menu-panel button { min-height:24px; padding:4px 7px; border:1px solid transparent; border-radius:2px; color:#7f8d97; background:linear-gradient(180deg,#191b1d,#131517); text-align:left; cursor:pointer; font:8px var(--font-ui); letter-spacing:.06em; }
  .footer-menu-panel button:hover, .footer-menu-panel button.selected { color:#22c55e; border-color:#22c55e55; background:linear-gradient(180deg,#22c55e2c,#22c55e0c); }
</style>
