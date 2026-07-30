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
    presets?: Preset[];
  }
  let { params, onUpdate, color, presets }: Props = $props();
</script>

<div
  style="background:linear-gradient(180deg,#111214,#0f1012);border-top:2px solid #0d0e0f;padding:3px 8px;display:flex;align-items:center;gap:6px;flex-shrink:0"
>
  <VertLabel text="MIX" {color} />
  {#if presets}
    <div style="display:flex;flex-direction:column;gap:2px;align-items:center;flex-shrink:0">
      <span
        style="font-size:6.5px;font-weight:700;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.12em"
        >PRESET</span
      >
      <div style="display:flex;gap:2px">
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
            onclick={() => Object.entries(p.set).forEach(([k, v]) => onUpdate(k, v))}
          />
        {/each}
      </div>
    </div>
  {/if}
  <div style="flex:1;display:flex;justify-content:space-around;align-items:center">
    <Knob label="IN" value={params.in_ ?? 80} onChange={(v) => onUpdate('in_', v)} size="xs" {color} />
    <Knob label="MIX" value={params.mix ?? 50} onChange={(v) => onUpdate('mix', v)} size="xs" {color} />
    <Knob label="OUT" value={params.out ?? 60} onChange={(v) => onUpdate('out', v)} size="xs" {color} />
  </div>
</div>
