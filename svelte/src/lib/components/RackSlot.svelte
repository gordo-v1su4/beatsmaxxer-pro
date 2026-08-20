<script lang="ts">
import {
  dragState,
  endDrag,
  moveDrag,
  setHoverTarget,
  startDrag,
  type RackRow
} from '$lib/stores/drag';
import {
  applyModuleDrop,
  canDropModuleOnSlot,
  midiLayers,
  rackBottom,
  rackTop,
  videoLayers
} from '$lib/stores/rack';
  import { getModuleDef } from '$lib/modules/catalog';
  import EffectModule from '$lib/components/EffectModule.svelte';
  import CompactModule from '$lib/components/CompactModule.svelte';
  import { pgmSource } from '$lib/stores/pgm';
  import { clipDragState } from '$lib/stores/clipDrag';
  import { get } from 'svelte/store';

  interface Props {
    row: RackRow;
    slotIndex: number;
    moduleId?: string;
    canvasId?: string;
    params?: Record<string, number>;
    onVideoUpload?: (file: File) => void;
    onVideosUpload?: (files: File[]) => void;
    onClearVideo?: () => void;
    onMidiUpload?: (file: File) => void;
    onClearMidi?: () => void;
  }

  let {
    row,
    slotIndex,
    moduleId,
    canvasId,
    params = {},
    onVideoUpload,
    onVideosUpload,
    onClearVideo,
    onMidiUpload,
    onClearMidi
  }: Props = $props();

  const mod = $derived(moduleId ? getModuleDef(moduleId) : undefined);
  const slotCanvasId = $derived(canvasId ?? `${row}-${slotIndex}`);
  const compact = $derived(mod?.compact ?? row === 'bottom');
  const isOnAir = $derived($pgmSource === moduleId);
  const isHover = $derived(
    $dragState.hoverTarget?.row === row && $dragState.hoverTarget?.slotIndex === slotIndex
  );
  const canAcceptDrop = $derived(
    !$dragState.payload ||
      canDropModuleOnSlot($dragState.payload, { row, index: slotIndex }, $rackTop, $rackBottom)
  );
  const isDragging = $derived(
    !!moduleId &&
      $dragState.active &&
      $dragState.payload?.moduleId === moduleId &&
      $dragState.payload?.source === 'rack' &&
      $dragState.payload?.row === row &&
      $dragState.payload?.slotIndex === slotIndex
  );
  /** A clip is hovering this slot — media swap, effect untouched. */
  const isClipHover = $derived(
    $clipDragState.active &&
      $clipDragState.hoverTarget?.row === row &&
      $clipDragState.hoverTarget?.slotIndex === slotIndex
  );

  function onHeaderPointerDown(e: PointerEvent) {
    if (!mod) return;
    e.preventDefault();
    startDrag({ moduleId: mod.id, source: 'rack', row, slotIndex }, e.clientX, e.clientY);
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
      applyModuleDrop(payload, { row: target.row, index: target.slotIndex });
    }
    endDrag();
  }

  function finishKeyboardDrop() {
    const state = get(dragState);
    const payload = state.payload;
    if (!state.active || state.input !== 'keyboard' || !payload) return;
    applyModuleDrop(payload, { row, index: slotIndex });
    endDrag();
  }
</script>

<div
  data-rack-slot
  data-row={row}
  data-index={slotIndex}
  data-drop-valid={canAcceptDrop}
  data-has-module={!!mod}
  class="rack-slot {isHover || isClipHover ? 'z-20' : 'z-0'} {isDragging ? 'opacity-25 scale-[0.97] blur-[0.5px]' : ''}"
>
  {#if $dragState.active && $dragState.input === 'keyboard' && $dragState.payload}
    <button
      type="button"
      data-keyboard-drop-target
      aria-disabled={!canAcceptDrop}
      class="absolute inset-0 z-50 border-2 border-dashed bg-black/70 text-xs font-medium tracking-widest {canAcceptDrop
        ? 'border-sky-400 text-sky-300'
        : 'cursor-not-allowed border-red-500/80 text-red-300'}"
      aria-label="Drop {$dragState.payload.moduleId} in {row} rack slot {slotIndex + 1}"
      onclick={finishKeyboardDrop}
      onfocus={() => setHoverTarget({ row, slotIndex })}
      onblur={() => setHoverTarget(null)}
      onkeydown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          endDrag();
        }
      }}
    >
      DROP HERE
    </button>
  {/if}
  {#if isClipHover}
    <div
      class="pointer-events-none absolute -inset-1 z-30 border-2 border-dashed border-emerald-400/90"
      style="box-shadow: 0 8px 32px #35e08a44, inset 0 0 20px #35e08a22"
    ></div>
  {/if}
  {#if isHover && $dragState.active}
    <div
      class="pointer-events-none absolute -inset-1 z-30 rounded-lg border-2 border-dashed {canAcceptDrop
        ? 'border-sky-400/90'
        : 'border-red-500/80'}"
      style="box-shadow: 0 8px 32px {canAcceptDrop ? (mod?.accentColor ?? '#38bdf8') + '44' : '#ef444444'}, inset 0 0 20px {canAcceptDrop ? (mod?.accentColor ?? '#38bdf8') + '22' : '#ef444422'}"
    ></div>
  {/if}

  {#if mod}
    {#if compact}
      <CompactModule
        {mod}
        {params}
        canvasId={slotCanvasId}
        videoLayer={$videoLayers[slotCanvasId]}
        midiLayer={$midiLayers[mod.id]}
        {isOnAir}
        {onHeaderPointerDown}
        {onVideoUpload}
        {onVideosUpload}
        {onClearVideo}
        {onMidiUpload}
        {onClearMidi}
      />
    {:else}
      <EffectModule
        {mod}
        {params}
        canvasId={slotCanvasId}
        mediaSlotId={slotCanvasId}
        videoLayer={$videoLayers[slotCanvasId]}
        midiLayer={$midiLayers[mod.id]}
        {isOnAir}
        {onHeaderPointerDown}
        {onVideoUpload}
        {onVideosUpload}
        {onClearVideo}
        {onMidiUpload}
        onClearMidi={onClearMidi}
      />
    {/if}
  {:else}
    <div
      class={[
        'rack-add-card',
        isHover && $dragState.active && canAcceptDrop && 'rack-add-card-active',
        isHover && $dragState.active && !canAcceptDrop && 'rack-add-card-invalid'
      ]}
      aria-label="Empty {row} rack slot {slotIndex + 1}; drag a compatible effect here"
    >
      <span class="placeholder-plus">+</span>
      <span class="placeholder-label">ADD MODULE</span>
      <span class="placeholder-hint">DRAG EFFECT HERE</span>
    </div>
  {/if}
</div>
