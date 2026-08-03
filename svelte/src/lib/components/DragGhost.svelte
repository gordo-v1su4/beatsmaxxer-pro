<script lang="ts">
  import { dragState } from '$lib/stores/drag';
  import { getModuleDef } from '$lib/modules/catalog';

  const mod = $derived(
    $dragState.payload ? getModuleDef($dragState.payload.moduleId) : undefined
  );
</script>

{#if $dragState.active && $dragState.input === 'pointer' && mod}
  <!-- Reads as the module you are carrying: same header bar, screw dots and
       accent edge as a rack module, sitting square under the cursor. -->
  <div
    class="drag-ghost"
    style="left:{$dragState.x}px;top:{$dragState.y}px;--accent:{mod.accentColor}"
  >
    <div class="drag-ghost-header">
      <span class="drag-ghost-dots">
        <i></i><i></i><i></i><i></i>
      </span>
      <span class="drag-ghost-name">{mod.name}</span>
    </div>
    <div class="drag-ghost-body">
      <span class="drag-ghost-short">{mod.shortName}</span>
      {#if mod.description}
        <span class="drag-ghost-desc">{mod.description}</span>
      {/if}
    </div>
  </div>
{/if}

{#if $dragState.active && $dragState.input === 'keyboard' && mod}
  <div class="sr-only" role="status" aria-live="polite">
    {mod.name} grabbed. Tab to a rack slot, then press Enter or Space to drop. Press Escape to cancel.
  </div>
{/if}

<style>
  .drag-ghost {
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    width: 168px;
    /* Offset down-right of the cursor so the card never covers the slot being
       targeted, and never rotated: a tilted card reads as a dropped scrap. */
    transform: translate(-14px, -10px);
    background: #101214;
    border: 1px solid #24282d;
    border-top: 2px solid var(--accent);
    border-radius: 3px;
    overflow: hidden;
    box-shadow:
      0 14px 34px #000c,
      0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent);
  }
  .drag-ghost-header {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 20px;
    padding: 0 6px;
    background: linear-gradient(180deg, #1e2124, #141618);
    border-bottom: 1px solid #0d0e0f;
  }
  .drag-ghost-dots {
    display: grid;
    grid-template-columns: 2px 2px;
    gap: 1.5px;
    flex-shrink: 0;
  }
  .drag-ghost-dots i {
    width: 2px;
    height: 2px;
    border-radius: 50%;
    background: #2a2e34;
  }
  .drag-ghost-name {
    font-family: var(--font-ui);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #7a8090;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .drag-ghost-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
  }
  .drag-ghost-short {
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--accent);
  }
  .drag-ghost-desc {
    font-size: 7px;
    line-height: 1.25;
    color: #4a5260;
  }
</style>
