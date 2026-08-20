<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ChevronDown } from '@lucide/svelte';
  import { onMount } from 'svelte';

  interface Props {
    id: string;
    label: string;
    openId: string | null;
    onOpen: (id: string | null) => void;
    active?: boolean;
    title?: string;
    children: Snippet;
  }

  let {
    id,
    label,
    openId,
    onOpen,
    active = false,
    title,
    children
  }: Props = $props();

  const open = $derived(openId === id);
  let root = $state<HTMLDivElement>();

  onMount(() => {
    const onPointer = (event: PointerEvent) => {
      if (!open) return;
      if (root?.contains(event.target as Node)) return;
      onOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpen(null);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="top-menu" bind:this={root} data-open={open}>
  <button
    type="button"
    class="top-menu-btn"
    data-active={active}
    data-open={open}
    {title}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => onOpen(open ? null : id)}
  >
    {label}
    <ChevronDown size={9} />
  </button>
  {#if open}
    <div class="top-menu-panel" role="menu">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .top-menu {
    position: relative;
    flex-shrink: 0;
  }

  .top-menu-btn {
    height: 26px;
    padding-inline: 8px 6px;
    display: flex;
    align-items: center;
    gap: 4px;
    border-style: solid;
    border-width: 1px;
    border-radius: 3px;
    cursor: pointer;
    font-family: var(--font-ui);
    font-weight: 500;
    font-size: 9px;
    letter-spacing: 0.1em;
    color: #3a4050;
    background: linear-gradient(180deg, #191b1d, #131517);
    border-color: #222428 #1a1c1e #1a1c1e #1a1c1e;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.4);
  }

  .top-menu-btn[data-active='true'],
  .top-menu-btn[data-open='true'] {
    color: #22c55e;
    background: linear-gradient(180deg, #22c55e2c, #22c55e0c);
    border-color: #22c55e55;
  }

  .top-menu-panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 40;
    min-width: 220px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: linear-gradient(180deg, #1a1c1e, #121416);
    border: 1px solid #25282c;
    border-radius: 4px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.72);
  }
</style>
