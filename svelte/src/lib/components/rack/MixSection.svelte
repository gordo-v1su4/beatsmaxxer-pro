<script lang="ts">
  import Knob from '$lib/components/Knob.svelte';
  import VertLabel from './VertLabel.svelte';
  import RackBtn from './RackBtn.svelte';

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
    onApplyPreset?: (values: Record<string, number>) => void;
  }
  let { params, onUpdate, onApplyPreset, color, moduleId, presets }: Props = $props();
</script>

<div class="mix-strip">
  <VertLabel text="MIX" {color} />
  {#if presets && presets.length > 0}
    <div class="mix-strip-presets">
      <span class="mix-strip-presets-label">PRESET</span>
      <div class="mix-strip-presets-row">
        {#each presets as p (p.n)}
          {@const active = Object.entries(p.set).every(
            ([k, v]) => Math.abs((params[k] ?? -999) - v) <= 1
          )}
          <RackBtn
            label={p.n}
            title={p.title}
            {active}
            {color}
            width={18}
            height={16}
            onclick={() => {
              if (onApplyPreset) onApplyPreset(p.set);
              else Object.entries(p.set).forEach(([k, v]) => onUpdate(k, v));
            }}
          />
        {/each}
      </div>
    </div>
  {/if}
  <div class="mix-strip-knobs">
    <Knob
      knobId="{moduleId}-in"
      label="IN"
      value={params.in_ ?? 80}
      onChange={(v) => onUpdate('in_', v)}
      size="xxs"
      {color}
    />
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
