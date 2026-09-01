<script lang="ts">
  import type { Snippet } from 'svelte';
  import VertLabel from './VertLabel.svelte';

  interface Props {
    label: string;
    color: string;
    children: Snippet;
    noBorder?: boolean;
  }
  let { label, color, children, noBorder = false }: Props = $props();
</script>

<div
  class="rack-section"
  style="border-bottom:{noBorder ? 'none' : '1px solid #0d0e0f'}"
>
  <div
    class="rack-section-rail"
  >
    <VertLabel text={label} {color} />
  </div>
  <div class="rack-section-body">{@render children()}</div>
</div>

<style>
  .rack-section {
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.01) 1px, transparent 1px) 0 0 / 48px 100%,
      linear-gradient(180deg, var(--surface-panel), #0d0f11);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.022);
  }
  .rack-section-rail {
    width: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: linear-gradient(180deg, #15181b, #0d0f11);
    border-right: 1px solid var(--edge-dark);
    box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.018);
  }
  .rack-section-body {
    flex: 1;
    min-width: 0;
    padding: 4px 5px;
  }
</style>
