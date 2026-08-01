<script lang="ts">
  import { ChevronLeft, ChevronRight, Save } from '@lucide/svelte';
  import MacroDot from '$lib/components/rack/MacroDot.svelte';
  import {
    FACTORY_PRESETS,
    selectedPreset,
    macros,
    selectPreset,
    updateModuleMacro,
    RACK_MACRO_MODULES,
    RACK_MACRO_DEFS,
    type PresetName,
    type RackMacroId
  } from '$lib/stores/presets';

  const currentIndex = $derived(FACTORY_PRESETS.indexOf($selectedPreset));

  function goPrev() {
    const i = currentIndex > 0 ? currentIndex - 1 : FACTORY_PRESETS.length - 1;
    selectPreset(FACTORY_PRESETS[i]!);
  }
  function goNext() {
    const i = currentIndex < FACTORY_PRESETS.length - 1 ? currentIndex + 1 : 0;
    selectPreset(FACTORY_PRESETS[i]!);
  }
</script>

<aside class="preset-panel hide-on-mobile">
  <div class="preset-header">
    <div class="preset-icon"><Save size={9} color="#454a52" /></div>
    <select
      class="preset-select"
      value={$selectedPreset}
      onchange={(e) => selectPreset(e.currentTarget.value as PresetName)}
    >
      {#each FACTORY_PRESETS as preset (preset)}
        <option value={preset}>{preset}</option>
      {/each}
    </select>
    <button type="button" class="nav-btn" onclick={goPrev} aria-label="Previous preset"><ChevronLeft size={10} /></button>
    <button type="button" class="nav-btn" onclick={goNext} aria-label="Next preset"><ChevronRight size={10} /></button>
  </div>

  <div class="macro-grid">
    {#each RACK_MACRO_MODULES as moduleId (moduleId)}
      {@const def = RACK_MACRO_DEFS[moduleId as RackMacroId]}
      <MacroDot
        label={def.short}
        title="{moduleId} · {def.param}"
        controlId={moduleId}
        color={def.color}
        value={$macros[moduleId as RackMacroId]}
        onChange={(v) => updateModuleMacro(moduleId as RackMacroId, v)}
      />
    {/each}
  </div>
</aside>

<style>
  .preset-panel {
    width: 148px;
    flex-shrink: 0;
    background: #111214;
    border-right: 1px solid #0d0e0f;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    gap: 0;
  }

  .preset-header {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 4px 5px;
    background: linear-gradient(180deg, #1a1c1e, #141618);
    border-bottom: 1px solid #0d0e0f;
    flex-shrink: 0;
  }

  .preset-icon {
    width: 18px;
    height: 18px;
    background: linear-gradient(180deg, #1e2022, #161819);
    border: 1px solid #252729;
    border-radius: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .preset-select {
    flex: 1;
    min-width: 0;
    height: 18px;
    background: #0a0b0c;
    border: 1px solid #1a1c1e;
    border-radius: 2px;
    color: #8a9098;
    font-family: var(--font-mono);
    font-size: 8px;
    letter-spacing: 0.02em;
    padding: 0 2px;
    cursor: pointer;
  }

  .nav-btn {
    width: 18px;
    height: 18px;
    background: linear-gradient(180deg, #1e2022, #161819);
    border: 1px solid #0d0e0f;
    border-radius: 2px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #454a52;
    flex-shrink: 0;
    padding: 0;
  }

  .macro-grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px 4px;
    padding: 10px 8px 12px;
    align-content: start;
    border-top: 2px solid #0d0e0f;
    background: #101214;
  }
</style>
