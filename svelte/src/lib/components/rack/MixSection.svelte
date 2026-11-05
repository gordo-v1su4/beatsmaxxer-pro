<script lang="ts">
  import Knob from '$lib/components/Knob.svelte';
  import VertLabel from './VertLabel.svelte';
  import PresetSelector from './PresetSelector.svelte';

  interface Preset {
    n: string;
    title: string;
    set: Record<string, number>;
  }

  interface Props {
    params: Record<string, number>;
    onUpdate: (p: string, v: number) => void;
    color: string;
    moduleId: string;
    presets?: Preset[];
    onApplyPreset: (values: Record<string, number>) => void;
  }
  let { params, onUpdate, onApplyPreset, color, moduleId, presets }: Props = $props();
</script>

<div class="mix-strip">
  <!-- Same 11px rail as a section's label column, so MIX lines up with
       PACK / FIRE / SHAPE above it on every card. -->
  <span class="mix-strip-rail"><VertLabel text="MIX" {color} /></span>
  {#if presets && presets.length > 0}
    <div class="mix-strip-presets named-presets">
      <PresetSelector {params} {presets} {color} label={`${moduleId} preset`} {onApplyPreset} />
    </div>
  {/if}
  <div class="mix-strip-knobs">
    <Knob
      knobId="{moduleId}-mix"
      label="MIX"
      value={params.mix ?? 100}
      onChange={(v) => onUpdate('mix', v)}
      size="xxs"
      {color}
    />
  </div>
</div>

<style>
  .named-presets { flex:1 1 0; min-width:0; }
  @media (pointer:coarse) {
    .mix-strip { height:auto; min-height:64px; }
  }
</style>
