<script lang="ts">
  import { dragState, endDrag, moveDrag, setHoverTarget, startDrag } from '$lib/stores/drag';
  import { getModuleDef, listByCategory, type ModuleCategory } from '$lib/modules/catalog';
  import { rackTop, rackBottom, applyModuleDrop } from '$lib/stores/rack';
  import { activeSection, applySectionBank } from '$lib/stores/arrangement';
  import type { RackRow } from '$lib/stores/drag';
  import { get } from 'svelte/store';
  import { tick } from 'svelte';

  const CATEGORIES: { key: ModuleCategory; label: string }[] = [
    { key: 'beat', label: 'BEAT FX' },
    { key: 'camera', label: 'CAMERA' },
    { key: 'film', label: 'FILM / TEXTURE' }
  ];

  const inRack = $derived(new Set([...$rackTop, ...$rackBottom]));

  /**
   * The ten effects this section wants, top row then bottom. The bank has always
   * existed in the data and never had a surface, which is what made AUTO-BANK
   * unreadable: the rack rearranged itself on a section change and nothing had
   * said what it was rearranging into.
   */
  const bankChips = $derived(
    [...($activeSection?.bank.top ?? []), ...($activeSection?.bank.bottom ?? [])].map((id, i) => {
      const def = getModuleDef(id);
      return {
        key: `${i}-${id}`,
        slot: i < 5 ? `A${i + 1}` : `B${i - 4}`,
        name: def?.shortName ?? id.toUpperCase(),
        color: def?.accentColor ?? '#4a5260',
        loaded: inRack.has(id)
      };
    })
  );

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

<!-- Body only: the rail that hosts this owns the header, the tabs and the width,
     because CLIPS shares all three. -->
<div class="palette-body">
  {#if $activeSection}
    <section class="bank" style="--bank-hue:{$activeSection.hue}">
      <div class="bank-head">
        <span class="bank-title">BANK FOR SECTION</span>
        <span class="bank-section" style="color:{$activeSection.hue}">{$activeSection.name}</span>
      </div>
      <div class="bank-chips">
        {#each bankChips as chip (chip.key)}
          <span
            class="bank-chip"
            class:is-loaded={chip.loaded}
            style="background:{chip.color}1c;color:{chip.color}"
            title="Slot {chip.slot} · {chip.name}{chip.loaded ? ' — already in the rack' : ''}"
          >{chip.name}</span>
        {/each}
      </div>
      <button
        type="button"
        class="bank-recall"
        onclick={() => $activeSection && applySectionBank($activeSection)}
        title="Load these ten effects into the rack now"
      >⤓ RECALL BANK TO RACK</button>
    </section>
  {/if}

  {#each CATEGORIES as cat (cat.key)}
    <span class="palette-category" style="margin-top:{cat.key === 'beat' ? '0' : '8px'}">{cat.label}</span>
    {#each listByCategory(cat.key) as mod (mod.id)}
      <button
        type="button"
        class="palette-card"
        aria-label="Grab {mod.name} to move to a rack slot"
        title={mod.description ? `${mod.name} — ${mod.description}` : mod.name}
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
  <p class="palette-hint">
    Drag onto a rack slot to swap. MIN ALL collapses the rack and opens the arrangement.
  </p>
</div>

<style>
  .palette-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 6px 4px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* Pinned above the library and outside its scroll: it describes the section
     you are in, not an item you are browsing. */
  .bank {
    flex-shrink: 0;
    margin: -2px -2px 6px;
    padding: 6px;
    border: 1px solid #16181b;
    border-radius: 3px;
    background: #0c0e10;
  }
  .bank-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px;
    margin-bottom: 5px;
  }
  .bank-title {
    font-size: 6.5px;
    font-weight: 500;
    letter-spacing: 0.14em;
    color: #3f4653;
    white-space: nowrap;
  }
  .bank-section {
    font-size: 8px;
    font-weight: 500;
    letter-spacing: 0.12em;
    white-space: nowrap;
  }

  /* Five across, two rows — the shape of the rack it fills. */
  .bank-chips {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 2px;
    margin-bottom: 6px;
  }
  .bank-chip {
    display: grid;
    place-items: center;
    height: 15px;
    border-radius: 2px;
    font-size: 6px;
    letter-spacing: 0.04em;
    overflow: hidden;
    opacity: 0.55;
  }
  /* Already in the rack, so recalling would not move it. */
  .bank-chip.is-loaded {
    opacity: 1;
    box-shadow: inset 0 0 0 1px currentColor;
  }

  .bank-recall {
    width: 100%;
    height: 18px;
    border: 1px solid color-mix(in srgb, var(--bank-hue) 40%, transparent);
    border-radius: 2px;
    background: color-mix(in srgb, var(--bank-hue) 10%, transparent);
    color: var(--bank-hue);
    font-family: var(--font-ui);
    font-size: 7px;
    font-weight: 500;
    letter-spacing: 0.12em;
    transition: background 0.12s;
  }
  .bank-recall:hover {
    background: color-mix(in srgb, var(--bank-hue) 22%, transparent);
  }

  .palette-hint {
    margin-top: 8px;
    padding: 4px;
    font-size: 7px;
    line-height: 1.35;
    color: #33383f;
  }

  /* Three groups in one scrolling column need a visible seam, or CAMERA reads as
     the last item of BEAT FX. The rule runs to the card edge so it separates
     without adding another element to the flow. */
  .palette-category {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 4px;
    font-size: 7px;
    font-weight: 500;
    letter-spacing: 0.12em;
    color: #3f4653;
    white-space: nowrap;
  }
  .palette-category::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #16181b;
  }

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
