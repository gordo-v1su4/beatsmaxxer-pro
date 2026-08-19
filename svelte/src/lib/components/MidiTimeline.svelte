<script lang="ts">
  import type { MidiLayer } from '$lib/stores/rack';
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import {
    noteFires,
    noteIsHighlighted,
    type ModuleTriggerSource
  } from '$lib/stores/midiTrigger';
  import { analyseMidiTiming, formatMidiTiming } from '$lib/stores/midiTiming';
  import { analysisBeatGrid } from '$lib/stores/triggerLane';
  import RackBtn from '$lib/components/rack/RackBtn.svelte';
  import HSlider from '$lib/components/rack/HSlider.svelte';

  interface Props {
    color: string;
    midiLayer: MidiLayer;
    moduleId: string;
    /** Which clock fires this module. Exclusive — never both at once. */
    source?: ModuleTriggerSource;
    onSourceChange?: (source: ModuleTriggerSource) => void;
    /** 0-100. What share of the part's notes actually fire. */
    density?: number;
    onDensityChange?: (value: number) => void;
    behavior?: 'trigger' | 'modulation';
    onClearMidi?: () => void;
  }

  let {
    color,
    midiLayer,
    moduleId,
    source = 'audio',
    onSourceChange,
    density = 100,
    onDensityChange,
    behavior = 'trigger',
    onClearMidi
  }: Props = $props();

  const td = $derived($transportDisplay);
  const windowSize = 8;
  const windowStart = $derived(td.time - windowSize / 2);

  // Index is carried through the filter because DENSITY is keyed on a note's
  // position in the part, not on its time — dropping it here would make the
  // lane dim a different set of notes than the engine actually skips.
  const visibleNotes = $derived(
    midiLayer.notes
      .map((note, index) => ({ note, index }))
      .filter(
        ({ note }) =>
          note.time >= windowStart - 0.1 && note.time <= windowSize / 2 + td.time + 0.1
      )
  );

  const active = $derived(source === 'midi');

  /**
   * What the part looks like on the way in. Strictly a readout -- nothing here
   * touches a note. Recomputed only when the part or the beat grid changes,
   * not per frame: it walks every note in the file.
   */
  const timing = $derived(analyseMidiTiming(midiLayer, $analysisBeatGrid, td.bpm));
  const timingLabel = $derived(formatMidiTiming(timing));
</script>

<div
  class="midi-trigger-bar"
  data-midi-identity={midiLayer.identity ?? midiLayer.name}
  data-midi-source={source}
  data-midi-kept={midiLayer.notes.filter((note, index) => noteFires(index, note.velocity, density / 100)).length}
  data-midi-total={midiLayer.notes.length}
  data-midi-density={Math.round(density)}
>
  <span class="midi-trigger-label">{behavior === 'trigger' ? 'HIT SRC' : 'MOD SRC'}</span>
  <!-- Two buttons rather than one toggle: the exclusivity is the point, so both
       options stay visible and which one is live is never in doubt. -->
  <RackBtn
    label="AUD"
    active={!active}
    {color}
    width={26}
    onclick={() => onSourceChange?.('audio')}
  />
  <RackBtn
    label="MIDI"
    {active}
    {color}
    width={30}
    onclick={() => onSourceChange?.('midi')}
  />
  <span class="midi-trigger-label" style="margin-left:4px;opacity:{active ? 1 : 0.35}">DENS</span>
  <div style="flex:1;min-width:28px;opacity:{active ? 1 : 0.35}">
    <HSlider
      value={density}
      onChange={(v) => onDensityChange?.(v)}
      {color}
      ariaLabel="MIDI note density"
      controlId="{moduleId}-density"
    />
  </div>
  <span class="midi-trigger-value" style="opacity:{active ? 1 : 0.35}">
    {Math.round(density)}%
  </span>
  {#if onClearMidi}
    <button class="midi-clear" type="button" onclick={onClearMidi} title="Remove MIDI and return to audio">×</button>
  {/if}
</div>

<!-- Its own line, not squeezed into the control row: sharing that row shrank the
     DENSITY slider from about 130px to 42px, and a readout should never cost a
     control its drag target. -->
<div class="midi-timing-bar">
  <span class="midi-trigger-label">AS IMPORTED</span>
  <span
    class="midi-timing"
    class:is-loose={!timing.quantised}
    title="How this part arrived: the grid it fits, the share of notes on it, and the median distance from it{timing.swingRatio !==
    null
      ? `, swing ${Math.round(timing.swingRatio * 100)}%`
      : ''}. Read-only — notes are never altered. Measured against the transport tempo, so a part written at another BPM reads loose."
  >
    {timingLabel}
  </span>
  <span class="midi-timing-count">{timing.noteCount} notes</span>
</div>

<div
  style="position:relative;height:28px;background:#08090a;border-bottom:1px solid #0d0e0f;overflow:hidden;flex-shrink:0;box-shadow:inset 0 2px 6px rgba(0,0,0,0.8)"
>
  <div
    style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:{color};box-shadow:0 0 6px {color}88,0 0 12px {color}44;z-index:5"
  ></div>
  <div
    style="position:absolute;left:calc(50% - 12px);top:0;bottom:0;width:24px;background:radial-gradient(ellipse at center,{color}15,transparent 70%);z-index:1;pointer-events:none"
  ></div>
  {#each visibleNotes as { note, index } (note.time + '-' + note.note + '-' + index)}
    {@const pct = ((note.time - windowStart) / windowSize) * 100}
    {@const fires = !active || noteFires(index, note.velocity, density / 100)}
    {@const opacity = Math.min(1, note.velocity / 127)}
    {@const glow = noteIsHighlighted(note.time, td.time, midiLayer.duration, td.playing) && fires}
    <!-- Notes DENSITY drops are drawn faint rather than hidden, so turning the
         dial shows which hits were thinned out instead of silently shortening
         the lane. -->
    <div
      style="position:absolute;left:{pct}%;top:2px;bottom:2px;width:{glow ? 2 : 1}px;background:{fires
        ? color
        : '#3a4050'};opacity:{glow ? 1 : fires ? opacity * 0.7 + 0.15 : 0.25};box-shadow:{glow
        ? `0 0 6px ${color}`
        : 'none'};z-index:2"
    ></div>
  {/each}
</div>

<style>
  .midi-trigger-bar {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 2px 6px;
    background: #0b0c0e;
    border-bottom: 1px solid #0d0e0f;
    flex-shrink: 0;
  }

  .midi-trigger-label {
    font-family: var(--font-ui);
    font-size: 6.5px;
    font-weight: 500;
    letter-spacing: 0.1em;
    color: #3a4050;
    flex-shrink: 0;
  }

  /* Amber for a loose part, dim for a tight one: the interesting case is the
     one that did not arrive on a grid. */
  .midi-timing-bar {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 1px 6px 2px;
    background: #0b0c0e;
    border-bottom: 1px solid #0d0e0f;
    flex-shrink: 0;
  }

  .midi-timing-count {
    font-family: var(--font-mono);
    font-size: 6.5px;
    color: #3a4050;
    margin-left: auto;
    flex-shrink: 0;
  }

  .midi-timing {
    font-family: var(--font-mono);
    font-size: 6.5px;
    color: #4a5260;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: help;
  }

  .midi-timing.is-loose {
    color: #8a6a3a;
  }

  .midi-trigger-value {
    font-family: var(--font-mono);
    font-size: 7px;
    color: #6b7280;
    width: 22px;
    text-align: right;
    flex-shrink: 0;
  }

  .midi-clear {
    width: 14px;
    height: 14px;
    padding: 0;
    border: 1px solid #342020;
    border-radius: 2px;
    background: #1b1212;
    color: #c46b6b;
    cursor: pointer;
    line-height: 11px;
  }
</style>
