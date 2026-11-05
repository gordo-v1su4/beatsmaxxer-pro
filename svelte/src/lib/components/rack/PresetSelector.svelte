<script lang="ts">
  import type { ModulePreset } from '$lib/modules/presets';
  import { matchingPreset } from '$lib/modules/presetSelection';

  interface Props {
    params: Record<string, number>;
    presets: ModulePreset[];
    label: string;
    color?: string;
    onApplyPreset: (values: Record<string, number>) => void;
  }
  let { params, presets, label, color = 'var(--option-selected-ink)', onApplyPreset }: Props = $props();
  const selected = $derived(matchingPreset(params, presets));

  function apply(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const preset = presets.find(item => item.n === select.value);
    if (preset) onApplyPreset({ ...preset.set });
  }
</script>

<label class="preset-selector" style:--preset-accent={color}>
  <span>PRESET</span>
  <select aria-label={label} value={selected?.n ?? ''} title={selected?.title ?? 'Custom settings'} onchange={apply}>
    <option value="" disabled>Custom</option>
    {#each presets as preset (preset.n)}
      <option value={preset.n}>{preset.title}</option>
    {/each}
  </select>
</label>

<style>
  .preset-selector { display:flex; flex-direction:column; gap:3px; min-width:0; width:100%; }
  .preset-selector > span { color:var(--ink-dim); font:500 8px var(--font-ui); letter-spacing:.06em; }
  select { width:100%; min-width:0; height:26px; padding:3px 5px; color:var(--preset-accent); background:var(--surface-raised); border:1px solid var(--edge-lit); border-radius:2px; font:500 11px var(--font-ui); cursor:pointer; text-overflow:ellipsis; }
  option { color:var(--ink); background:var(--surface-panel); }
  select:focus-visible { outline:2px solid var(--focus-ring); outline-offset:2px; }
  @media (pointer:coarse) { select { min-height:44px; } }
</style>
