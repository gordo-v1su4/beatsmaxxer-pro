<script lang="ts">
  import type { MidiLayer } from '$lib/stores/rack';
  import { transportDisplay } from '$lib/stores/transportDisplay';

  interface Props {
    color: string;
    midiLayer: MidiLayer;
  }

  let { color, midiLayer }: Props = $props();

  const td = $derived($transportDisplay);
  const windowSize = 8;
  const windowStart = $derived(td.time - windowSize / 2);
  const visibleNotes = $derived(
    midiLayer.notes.filter((n) => n.time >= windowStart - 0.1 && n.time <= windowSize / 2 + td.time + 0.1)
  );
</script>

<div
  style="position:relative;height:28px;background:#08090a;border-bottom:1px solid #0d0e0f;overflow:hidden;flex-shrink:0;box-shadow:inset 0 2px 6px rgba(0,0,0,0.8)"
>
  <div
    style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:{color};box-shadow:0 0 6px {color}88,0 0 12px {color}44;z-index:5"
  ></div>
  <div
    style="position:absolute;left:calc(50% - 12px);top:0;bottom:0;width:24px;background:radial-gradient(ellipse at center,{color}15,transparent 70%);z-index:1;pointer-events:none"
  ></div>
  {#each visibleNotes as note, i (note.time + '-' + note.note + '-' + i)}
    {@const pct = ((note.time - windowStart) / windowSize) * 100}
    {@const opacity = Math.min(1, note.velocity / 127)}
    {@const glow = Math.abs(note.time - td.time) < 0.05}
    <div
      style="position:absolute;left:{pct}%;top:2px;bottom:2px;width:{glow ? 2 : 1}px;background:{color};opacity:{glow ? 1 : opacity * 0.7 + 0.15};box-shadow:{glow ? `0 0 6px ${color}` : 'none'};z-index:2"
    ></div>
  {/each}
</div>
