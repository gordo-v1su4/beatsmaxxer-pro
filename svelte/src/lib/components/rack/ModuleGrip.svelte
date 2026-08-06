<script lang="ts">
  import Screw from '$lib/components/rack/Screw.svelte';

  interface Props {
    onHeaderPointerDown?: (e: PointerEvent) => void;
  }

  let { onHeaderPointerDown }: Props = $props();
</script>

<!--
  The only place a module can be picked up from.

  The drag used to live on the whole header, so pressing BYPASS, MUTE, COLLAPSE
  or CLIP started a reorder before the button's own click landed — the ghost
  would appear every time you tried to work the controls. Confining the gesture
  to this grip also gives the affordance one fixed home: the dotted patch in the
  top-left, which is where a drag handle sits everywhere else.

  Shared by both rack rows so the two can never drift apart again.
-->
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
