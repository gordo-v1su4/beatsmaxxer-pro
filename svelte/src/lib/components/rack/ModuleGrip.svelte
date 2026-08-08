<script lang="ts">
  import Screw from '$lib/components/rack/Screw.svelte';

  interface Props {
    onHeaderPointerDown?: (e: PointerEvent) => void;
  }

  let { onHeaderPointerDown }: Props = $props();
</script>

<!-- The only place a module can be picked up from. The drag used to live on the
  whole header, so BYPASS/MUTE/COLLAPSE/CLIP each started a reorder before their
  own click landed. Shared by both rack rows so they cannot drift apart. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  data-drag-handle
  onpointerdown={onHeaderPointerDown}
  title="Drag to reorder"
  style="display:flex;align-items:center;gap:3px;flex-shrink:0;cursor:grab;align-self:stretch;padding-right:2px"
>
  <Screw />
  <div style="display:flex;flex-direction:column;gap:1.5px;margin-left:1px">
    {#each [0, 1, 2] as i (i)}
      <div style="display:flex;gap:1.5px">
        <div style="width:2px;height:2px;background:#2a2e34;border-radius:50%"></div>
        <div style="width:2px;height:2px;background:#2a2e34;border-radius:50%"></div>
      </div>
    {/each}
  </div>
</div>
