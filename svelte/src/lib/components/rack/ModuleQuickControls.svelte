<script lang="ts">
  import { mobileSpecForModule } from '$lib/mobile/moduleControlSpecs';
  import HSlider from './HSlider.svelte';

  interface Props {
    moduleId: string;
    params: Record<string, number>;
    color: string;
    onUpdate: (key: string, value: number) => void;
  }
  let { moduleId, params, color, onUpdate }: Props = $props();
  // Reuse authored continuous controls, never turn an enum into a new slider.
  const sliders = $derived(mobileSpecForModule(moduleId)?.sliders.slice(0, 2) ?? []);
</script>

{#if sliders.length}
  <div class="quick-controls" data-control-level="simple">
    {#each sliders as slider (slider.param)}
      <div class="quick-control">
        <span>{slider.label}</span>
        <div class="track">
          <HSlider value={params[slider.param] ?? 50} onChange={value => onUpdate(slider.param, Math.round(value))}
            {color} ariaLabel={`${moduleId} ${slider.label}`} controlId={`${moduleId}-quick-${slider.param}`} />
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .quick-controls { padding:5px 8px; border-top:1px solid var(--edge-soft); background:var(--surface-sunken); }
  .quick-control { display:flex; align-items:center; gap:8px; min-height:22px; }
  .quick-control > span { width:56px; flex-shrink:0; font:500 10px var(--font-ui); color:var(--ink-dim); }
  .track { flex:1; min-width:0; }
</style>
