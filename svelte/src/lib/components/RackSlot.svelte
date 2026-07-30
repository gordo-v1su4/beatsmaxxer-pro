<script lang="ts">
import {
  dragState,
  endDrag,
  moveDrag,
  setHoverTarget,
  startDrag,
  type RackRow
} from '$lib/stores/drag';
import { assignModuleToSlot, swapRackSlots } from '$lib/stores/rack';
  import { getModuleDef } from '$lib/modules/catalog';
  import EffectModule from '$lib/components/EffectModule.svelte';
  import CompactModule from '$lib/components/CompactModule.svelte';
  import { pgmSource } from '$lib/stores/pgm';
  import { videoLayers, midiLayers } from '$lib/stores/rack';
  import { get } from 'svelte/store';

  interface Props {
    row: RackRow;
    slotIndex: number;
    moduleId: string;
    params: Record<string, number>;
    onVideoUpload?: (file: File) => void;
    onVideosUpload?: (files: File[]) => void;
    onClearVideo?: () => void;
    onMidiUpload?: (file: File) => void;
  }

  let {
    row,
    slotIndex,
    moduleId,
    params,
    onVideoUpload,
    onVideosUpload,
    onClearVideo,
    onMidiUpload
  }: Props = $props();

  const mod = $derived(getModuleDef(moduleId));
  const compact = $derived(mod?.compact ?? row === 'bottom');
  const isOnAir = $derived($pgmSource === moduleId);
  const isHover = $derived(
    $dragState.hoverTarget?.row === row && $dragState.hoverTarget?.slotIndex === slotIndex
  );
  const isDragging = $derived(
    $dragState.active &&
      $dragState.payload?.moduleId === moduleId &&
      $dragState.payload?.source === 'rack' &&
      $dragState.payload?.row === row &&
      $dragState.payload?.slotIndex === slotIndex
  );

  function onHeaderPointerDown(e: PointerEvent) {
    if (!mod) return;
    e.preventDefault();
    startDrag({ moduleId, source: 'rack', row, slotIndex }, e.clientX, e.clientY);
    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onWindowUp);
  }

  function onWindowMove(e: PointerEvent) {
    moveDrag(e.clientX, e.clientY);
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const slot = el?.closest('[data-rack-slot]') as HTMLElement | null;
    if (slot?.dataset.row != null && slot.dataset.index != null) {
      setHoverTarget({
        row: slot.dataset.row as RackRow,
        slotIndex: Number(slot.dataset.index)
      });
    } else {
      setHoverTarget(null);
    }
  }

  function onWindowUp() {
    window.removeEventListener('pointermove', onWindowMove);
    window.removeEventListener('pointerup', onWindowUp);
    const state = get(dragState);
    if (!state.active || !state.payload) {
      endDrag();
      return;
    }
    const target = state.hoverTarget;
    const payload = state.payload;
    if (target) {
      if (payload.source === 'palette') {
        assignModuleToSlot(target.row, target.slotIndex, payload.moduleId);
      } else if (payload.row !== undefined && payload.slotIndex !== undefined) {
        swapRackSlots(
          { row: payload.row, index: payload.slotIndex },
          { row: target.row, index: target.slotIndex }
        );
      }
    }
    endDrag();
  }
</script>

<div
  data-rack-slot
  data-row={row}
  data-index={slotIndex}
  class="relative min-w-0 flex-1 transition-all duration-150 ease-out
    {isHover ? 'z-20' : 'z-0'}
    {isDragging ? 'opacity-25 scale-[0.97] blur-[0.5px]' : ''}"
>
  {#if isHover && $dragState.active}
    <div
      class="pointer-events-none absolute -inset-1 z-30 rounded-lg border-2 border-dashed border-sky-400/90"
      style="box-shadow: 0 8px 32px {mod?.accentColor ?? '#38bdf8'}44, inset 0 0 20px {mod?.accentColor ?? '#38bdf8'}22"
    ></div>
  {/if}

  {#if mod}
    {#if compact}
      <CompactModule
        {mod}
        {params}
        videoLayer={$videoLayers[moduleId]}
        {isOnAir}
        {onHeaderPointerDown}
        {onVideoUpload}
        {onVideosUpload}
        {onClearVideo}
      />
    {:else}
      <EffectModule
        {mod}
        {params}
        videoLayer={$videoLayers[moduleId]}
        midiLayer={$midiLayers[moduleId]}
        {isOnAir}
        {onHeaderPointerDown}
        {onVideoUpload}
        {onVideosUpload}
        {onClearVideo}
        {onMidiUpload}
      />
    {/if}
  {/if}
</div>
