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
  style="border-bottom:{noBorder ? 'none' : '1px solid #0d0e0f'};display:flex;align-items:stretch;flex-shrink:0"
>
  <div
    style="width:11px;background:linear-gradient(180deg,#111214,#0f1012);border-right:1px solid #0d0e0f;display:flex;align-items:center;justify-content:center;flex-shrink:0"
  >
    <VertLabel text={label} {color} />
  </div>
  <div style="flex:1;padding:4px 5px">{@render children()}</div>
</div>
