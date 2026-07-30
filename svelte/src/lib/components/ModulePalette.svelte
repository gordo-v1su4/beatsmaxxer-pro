<script lang="ts">
  import { dragState, endDrag, moveDrag, setHoverTarget, startDrag } from '$lib/stores/drag';
  import { getModuleDef, listCatalog } from '$lib/modules/catalog';
  import { rackTop, rackBottom, assignModuleToSlot, swapRackSlots } from '$lib/stores/rack';
  import type { RackRow } from '$lib/stores/drag';
  import { get } from 'svelte/store';

  let expanded = $state(true);

  const inRack = $derived(new Set([...$rackTop, ...$rackBottom]));

  function beginDrag(moduleId: string, e: PointerEvent) {
    if (inRack.has(moduleId)) {
      const row: RackRow = $rackTop.includes(moduleId) ? 'top' : 'bottom';
      const slotIndex = row === 'top'
        ? $rackTop.indexOf(moduleId)
        : $rackBottom.indexOf(moduleId);
      startDrag({ moduleId, source: 'rack', row, slotIndex }, e.clientX, e.clientY);
    } else {
      startDrag({ moduleId, source: 'palette' }, e.clientX, e.clientY);
    }
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

<aside
  class="flex shrink-0 flex-col border-r border-[#1e2229] bg-[#08090b] transition-[width] duration-200
    {expanded ? 'w-[132px]' : 'w-10'}"
>
  <button
    class="border-b border-[#1e2229] px-2 py-2 text-[9px] font-bold tracking-widest text-zinc-500 hover:text-zinc-300"
    onclick={() => (expanded = !expanded)}
    title="Module library — drag onto rack"
  >
    {expanded ? 'FX LIB' : '▸'}
  </button>

  {#if expanded}
    <div class="flex flex-1 flex-col gap-1 overflow-y-auto p-1.5">
      <p class="px-1 text-[8px] uppercase tracking-wider text-zinc-600">Beat FX</p>
      {#each listCatalog().filter((m) => m.row === 'top' || m.row === 'both') as mod (mod.id)}
        <button
          class="group flex flex-col rounded px-2 py-1.5 text-left transition-all duration-150
            hover:bg-zinc-900/90 active:scale-95
            {$dragState.active && $dragState.payload?.moduleId === mod.id ? 'opacity-35' : ''}
            {inRack.has(mod.id) ? 'bg-zinc-900/40' : 'opacity-75'}"
          style="border-left: 2px solid {mod.accentColor}"
          onpointerdown={(e) => beginDrag(mod.id, e)}
        >
          <span class="text-[10px] font-bold" style="color:{mod.accentColor}">{mod.shortName}</span>
          {#if mod.description}
            <span class="text-[8px] leading-tight text-zinc-600">{mod.description}</span>
          {/if}
        </button>
      {/each}

      <p class="mt-2 px-1 text-[8px] uppercase tracking-wider text-zinc-600">Camera</p>
      {#each listCatalog().filter((m) => m.row === 'bottom' || m.row === 'both') as mod (mod.id)}
        <button
          class="group flex flex-col rounded px-2 py-1.5 text-left transition-all duration-150
            hover:bg-zinc-900/90 active:scale-95
            {$dragState.active && $dragState.payload?.moduleId === mod.id ? 'opacity-35' : ''}
            {inRack.has(mod.id) ? 'bg-zinc-900/40' : 'opacity-75'}"
          style="border-left: 2px solid {mod.accentColor}"
          onpointerdown={(e) => beginDrag(mod.id, e)}
        >
          <span class="text-[10px] font-bold" style="color:{mod.accentColor}">{mod.shortName}</span>
          {#if mod.description}
            <span class="text-[8px] leading-tight text-zinc-600">{mod.description}</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</aside>
