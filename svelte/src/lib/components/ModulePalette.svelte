<script lang="ts">
  import { dragState, endDrag, moveDrag, setHoverTarget, startDrag } from '$lib/stores/drag';
  import { listByCategory, type ModuleCategory } from '$lib/modules/catalog';
  import { rackTop, rackBottom, applyModuleDrop } from '$lib/stores/rack';
  import { fxLibOpen } from '$lib/stores/rackUi';
  import type { RackRow } from '$lib/stores/drag';
  import { get } from 'svelte/store';
  import { tick } from 'svelte';
  import { ChevronLeft, ChevronRight, GripVertical } from '@lucide/svelte';

  const CATEGORIES: { key: ModuleCategory; label: string }[] = [
    { key: 'beat', label: 'BEAT FX' },
    { key: 'camera', label: 'CAMERA' },
    { key: 'film', label: 'FILM / TEXTURE' }
  ];

  const inRack = $derived(new Set([...$rackTop, ...$rackBottom]));

  function beginDrag(moduleId: string, e: PointerEvent) {
    // The library is an effect picker even when that effect is already in the
    // rack. Dropping from here replaces the target effect; slot media stays put.
    startDrag({ moduleId, source: 'palette' }, e.clientX, e.clientY);
    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onWindowUp);
  }

  async function beginKeyboardDrag(moduleId: string) {
    startDrag({ moduleId, source: 'palette' }, 0, 0, 'keyboard');
    await tick();
    document.querySelector<HTMLElement>('[data-keyboard-drop-target]')?.focus();
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
</script>

<aside
  class="side-panel-fx"
  style="flex-shrink:0;display:flex;flex-direction:column;background:linear-gradient(180deg,#0c0d0f,#08090b);border-right:1px solid #0d0e0f;overflow:hidden;transition:width 0.2s ease;width:{$fxLibOpen
    ? 'var(--fx-lib-width)'
    : 'var(--fx-lib-collapsed)'}"
>
  <button
    type="button"
    onclick={() => fxLibOpen.update((v) => !v)}
    title="FX library — drag modules onto rack slots"
    style="display:flex;align-items:center;justify-content:{$fxLibOpen ? 'space-between' : 'center'};gap:4px;border:none;border-bottom:1px solid #0d0e0f;background:linear-gradient(180deg,#141618,#0f1012);padding:{$fxLibOpen
      ? '6px 8px'
      : '8px 2px'};cursor:pointer;color:#4a5260;font-family:var(--font-ui);font-size:8px;font-weight:500;letter-spacing:0.14em"
  >
    {#if $fxLibOpen}
      <span style="display:flex;align-items:center;gap:4px;color:#556070">
        <GripVertical size={10} /> FX LIB
      </span>
      <ChevronLeft size={12} />
    {:else}
      <ChevronRight size={12} />
    {/if}
  </button>

  {#if $fxLibOpen}
    <div style="flex:1;overflow-y:auto;padding:6px 4px;display:flex;flex-direction:column;gap:4px">
      {#each CATEGORIES as cat (cat.key)}
        <span style="font-size:7px;font-weight:500;letter-spacing:0.12em;color:#33383f;padding:0 4px;margin-top:{cat.key === 'beat' ? '0' : '6px'}">{cat.label}</span>
        {#each listByCategory(cat.key) as mod (mod.id)}
          <button
            type="button"
            class="palette-card"
            aria-label="Grab {mod.name} to move to a rack slot"
            style="border-left:2px solid {mod.accentColor};opacity:{inRack.has(mod.id) ? 0.45 : 1};background:{inRack.has(mod.id) ? '#131416' : '#101214'}"
            onpointerdown={(e) => beginDrag(mod.id, e)}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                void beginKeyboardDrag(mod.id);
              }
            }}
          >
            <span style="font-size:10px;font-weight:500;color:{mod.accentColor}">{mod.shortName}</span>
            {#if mod.description}
              <span style="font-size:7px;line-height:1.2;color:#4a5260">{mod.description}</span>
            {/if}
          </button>
        {/each}
      {/each}
      <p style="margin-top:8px;padding:4px;font-size:7px;line-height:1.35;color:#33383f">
        Drag onto a rack slot to swap. Collapse modules ↑ or retract PGM for more room.
      </p>
    </div>
  {/if}
</aside>

<style>
  .palette-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 5px 6px;
    border-radius: 2px;
    cursor: grab;
    user-select: none;
    width: 100%;
    border-top: 0;
    border-right: 0;
    border-bottom: 0;
    text-align: left;
    font-family: inherit;
    transition: background 0.12s, transform 0.12s;
  }
  .palette-card:hover {
    background: #1a1c1f !important;
  }
  .palette-card:active {
    transform: scale(0.97);
  }
</style>
