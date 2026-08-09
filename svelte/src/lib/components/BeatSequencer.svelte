<script lang="ts">
  import { ChevronDown, ChevronUp } from '@lucide/svelte';
  import { getModuleDef } from '$lib/modules/catalog';
  import { sequencerArmed } from '$lib/stores/sequencer';
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import { rackTop, rackBottom, MAX_RACK_SLOTS_PER_ROW } from '$lib/stores/rack';
  import { sequencerOpen } from '$lib/stores/rackUi';
  import {
    analysisBeatGrid,
    analysisOnsets,
    midiChannelIds,
    triggerMidiModule,
    triggerProfileFor,
    triggerSource
  } from '$lib/stores/triggerLane';
  import {
    ARRANGEMENT_STEPS,
    activeSection,
    activeSectionIndex,
    arrangement,
    arrangementTotalBars,
    autoBank,
    barInSection,
    clearActiveSectionPattern,
    moduleForSlotIndex,
    paintSlotIndex,
    selectSection,
    toggleArrangementStep
  } from '$lib/stores/arrangement';

  const slotCount = $derived($rackTop.length + $rackBottom.length);
  const steps = $derived(Array.from({ length: ARRANGEMENT_STEPS }, (_, i) => i));

  /** Playhead: only runs when the sequencer is actually driving cuts. */
  const activeStep = $derived(
    $sequencerArmed && $transportDisplay.playing
      ? Math.floor($transportDisplay.beat * 4) % ARRANGEMENT_STEPS
      : -1
  );

  /**
   * Where the song is, as a fraction of the whole arrangement. The per-section
   * fill only says "somewhere inside the chorus"; one line across the full ruler
   * says how much song is left, which is the question asked mid-performance.
   */
  const songProgress = $derived.by(() => {
    const total = $arrangementTotalBars;
    if (total <= 0) return 0;
    let elapsed = 0;
    for (let i = 0; i < $activeSectionIndex && i < $arrangement.length; i++) {
      elapsed += $arrangement[i].bars;
    }
    return Math.min(1, (elapsed + $barInSection) / total);
  });

  const profile = $derived(
    triggerProfileFor(
      $triggerSource,
      $triggerMidiModule,
      $analysisOnsets,
      $analysisBeatGrid,
      $transportDisplay.bpm
    )
  );

  /** Auto-pick a channel so switching to MIDI shows something if a part exists. */
  $effect(() => {
    if ($triggerSource !== 'midi') return;
    if ($triggerMidiModule && $midiChannelIds.includes($triggerMidiModule)) return;
    triggerMidiModule.set($midiChannelIds[0] ?? null);
  });

  function slotLabel(slotIndex: number) {
    const id = moduleForSlotIndex($rackTop, $rackBottom, slotIndex);
    const def = id ? getModuleDef(id) : undefined;
    return def ? { name: def.shortName, color: def.accentColor } : null;
  }

  function slotDisplayName(slotIndex: number) {
    return slotIndex < MAX_RACK_SLOTS_PER_ROW
      ? `A${slotIndex + 1}`
      : `B${slotIndex - MAX_RACK_SLOTS_PER_ROW + 1}`;
  }

  function moduleShortName(id: string) {
    return getModuleDef(id)?.shortName ?? id.toUpperCase();
  }

  /** 1 e & a — the count that tells you which sixteenth you are looking at. */
  const SUBDIVISION = ['1', 'e', '&', 'a'];
  function stepCount(i: number) {
    return i % 4 === 0 ? String(i / 4 + 1) : SUBDIVISION[i % 4];
  }

  const triggerHint = $derived.by(() => {
    if (profile.missing) return 'no part on this channel';
    if (profile.total === 0)
      return $triggerSource === 'audio' ? 'no onset data yet' : 'no notes in this part';
    return `${profile.total} hits`;
  });
</script>

<section class="seq-dock" class:is-open={$sequencerOpen}>
  <!-- The whole strip toggles, not just the 16px chevron. The dock is closed by
       default and the chevron alone was the only thing that opened it, which
       made an entire half of the app depend on hitting a 16px target. -->
  <div class="seq-head" class:is-open={$sequencerOpen}>
    <button
      type="button"
      class="seq-headline"
      onclick={() => sequencerOpen.update((v) => !v)}
      aria-expanded={$sequencerOpen}
      title={$sequencerOpen ? 'Collapse the arrangement dock' : 'Open the arrangement dock'}
    >
      <span class="seq-chevron">
        {#if $sequencerOpen}<ChevronDown size={11} />{:else}<ChevronUp size={11} />{/if}
      </span>
      <span class="seq-title">ARRANGE · SEQ</span>
      <span class="seq-openlabel">{$sequencerOpen ? 'HIDE' : 'SHOW TIMELINE'}</span>
    </button>

    <button
      type="button"
      class="seq-btn"
      data-active={$sequencerArmed}
      onclick={() => sequencerArmed.update((v) => !v)}
      title="Let the step pattern drive PGM cuts"
    >{$sequencerArmed ? 'ARMED' : 'OFF'}</button>

    <button
      type="button"
      class="seq-btn seq-btn-bank"
      data-active={$autoBank}
      onclick={() => autoBank.update((v) => !v)}
      title="Entering a section rebuilds the rack from that section's FX bank"
    >AUTO-BANK</button>

    {#if $sequencerOpen}
      <button
        type="button"
        class="seq-btn"
        onclick={clearActiveSectionPattern}
        title="Clear every step in this section"
      >CLR</button>

      <!-- Trigger source lives in the header, not beside the lane: anything
           sitting next to the lane steals width from it, and the lane is only
           worth drawing while its sixteen columns line up with the sixteen
           columns of the grid underneath. -->
      <span class="seq-group">
        <span class="seq-group-label">TRIG</span>
        <button
          type="button"
          class="seq-btn"
          data-active={$triggerSource === 'audio'}
          onclick={() => triggerSource.set('audio')}
          title="Fire from the track's own onsets"
        >AUDIO</button>
        <button
          type="button"
          class="seq-btn seq-btn-midi"
          data-active={$triggerSource === 'midi'}
          onclick={() => triggerSource.set('midi')}
          disabled={$midiChannelIds.length === 0}
          title={$midiChannelIds.length === 0
            ? 'Load a MIDI part on a module to use it as the trigger channel'
            : 'Fire from one instrument part instead of the whole mix'}
        >MIDI</button>
        {#if $triggerSource === 'midi' && $midiChannelIds.length > 0}
          <select
            class="seq-midi-select"
            value={$triggerMidiModule ?? ''}
            onchange={(e) => triggerMidiModule.set(e.currentTarget.value || null)}
            title="Which module's MIDI part drives the lane"
          >
            {#each $midiChannelIds as id (id)}
              <option value={id}>{moduleShortName(id)}</option>
            {/each}
          </select>
        {/if}
        <span class="seq-group-hint">{triggerHint}</span>
      </span>
    {/if}

    <div class="seq-readout">
      <span class="seq-readout-name" style="color:{$activeSection?.hue}">{$activeSection?.name}</span>
      <span>BAR {$barInSection + 1}/{$activeSection?.bars}</span>
      <span>{$arrangementTotalBars} BARS</span>
    </div>
  </div>

  {#if $sequencerOpen}
    <!-- Arrangement: each section's width is its share of the song, so the strip
         reads as a timeline rather than as equal-sized tabs. -->
    <div class="seq-song">
      <span class="seq-gutter-label">SONG</span>
      <div class="seq-arrangement">
        {#each $arrangement as section, i (section.id)}
          {@const on = i === $activeSectionIndex}
          {@const pct = on ? Math.min(100, ($barInSection / section.bars) * 100) : 0}
          <button
            type="button"
            class="seq-section"
            data-active={on}
            style="flex-grow:{section.bars};{on
              ? `background:${section.hue}1f;box-shadow:inset 0 0 0 1px ${section.hue}88`
              : ''}"
            onclick={() => selectSection(i)}
            title="{section.name} — {section.bars} bars"
          >
            <span class="seq-section-fill" style="width:{pct}%"></span>
            <span class="seq-section-body">
              <span class="seq-section-tick" style="background:{section.hue}"></span>
              <span class="seq-section-name" style="color:{on ? section.hue : '#7d9196'}">
                {section.name}
              </span>
              <span class="seq-section-bars">{section.bars}b</span>
            </span>
          </button>
        {/each}
        <span class="seq-songhead" style="left:{songProgress * 100}%"></span>
      </div>
    </div>

    <!--
      One grid, three kinds of row, all sharing the same sixteen columns: the
      count ruler, the trigger lane, and one row per rack slot.

      The previous shape was a single row of sixteen fat cells, which had to name
      the slot inside each cell and needed a separate PAINT selector to say which
      slot a click meant. As a matrix the row *is* the answer to both: a lit cell
      in the A2 row means "cut to A2 here", and clicking in that row paints it.
      Only one cell can be lit per column, because the model stores one slot per
      step — so the pattern reads as a line moving across the rack.
    -->
    <div
      class="seq-board"
      style="--seq-cols:{ARRANGEMENT_STEPS};--seq-rows:{Math.max(1, slotCount)}"
    >
      <span class="seq-gutter-label seq-corner">STEP</span>
      {#each steps as i (i)}
        <span class="seq-tick" class:is-beat={i % 4 === 0} class:is-lit={activeStep === i}>
          {stepCount(i)}
        </span>
      {/each}

      <span class="seq-gutter-label seq-triglabel" title="Where this source's hits land in the bar">
        {$triggerSource === 'midi' ? 'MIDI' : 'AUDIO'}
      </span>
      {#each profile.density as level, i (i)}
        <span
          class="seq-trig"
          class:is-beat={i % 4 === 0}
          class:is-lit={activeStep === i}
          title="{stepCount(i)} — {profile.counts[i]} hits"
        >
          <span
            class="seq-trig-fill"
            style="height:{Math.round(level * 100)}%;opacity:{level > 0 ? 0.35 + level * 0.65 : 0}"
          ></span>
        </span>
      {/each}

      {#each Array(slotCount) as _, slotIndex (slotIndex)}
        {@const info = slotLabel(slotIndex)}
        {@const rowActive = $paintSlotIndex === slotIndex}
        <button
          type="button"
          class="seq-rowlabel"
          class:is-rowbreak={slotIndex === MAX_RACK_SLOTS_PER_ROW}
          data-active={rowActive}
          style={info ? `--row-accent:${info.color}` : ''}
          onclick={() => paintSlotIndex.set(slotIndex)}
          title="{info?.name ?? 'empty'} — slot {slotDisplayName(slotIndex)}"
        >
          <span class="seq-rowlabel-tick" style={info ? `background:${info.color}` : ''}></span>
          <span class="seq-rowlabel-slot">{slotDisplayName(slotIndex)}</span>
          <span class="seq-rowlabel-fx" style={info ? `color:${info.color}` : ''}>
            {info?.name ?? '—'}
          </span>
        </button>
        {#each steps as i (i)}
          {@const on = ($activeSection?.pattern[i] ?? null) === slotIndex}
          <button
            type="button"
            class="seq-cell"
            class:is-beat={i % 4 === 0}
            class:is-rowbreak={slotIndex === MAX_RACK_SLOTS_PER_ROW}
            class:is-on={on}
            class:is-lit={activeStep === i}
            class:is-rowactive={rowActive}
            style={on && info ? `background:${info.color};box-shadow:0 0 8px ${info.color}66` : ''}
            onclick={() => toggleArrangementStep(i, slotIndex)}
            aria-pressed={on}
            title="{stepCount(i)} — {on ? `cut to ${info?.name ?? slotDisplayName(slotIndex)}` : 'empty'}"
          ></button>
        {/each}
      {/each}
    </div>
  {/if}
</section>

<style>
  .seq-dock {
    flex-shrink: 0;
    background: linear-gradient(180deg, #0e1012, #0a0b0c);
    border-top: 2px solid #0d0e0f;
  }

  /*
   * Open, the dock takes the rest of the column instead of sitting at its
   * content height. MIN ALL gives back ~440px of window; leaving the dock fixed
   * spent that on black nothing directly under the thing the operator had just
   * asked to look at, which read as the panel having failed to open rather than
   * as spare room.
   */
  .seq-dock.is-open {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-top: 2px solid #1b2a24;
    box-shadow: inset 0 1px 0 #35e08a22;
  }

  .seq-head {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 8px 0 0;
    flex-shrink: 0;
  }
  .seq-head.is-open {
    border-bottom: 1px solid #141618;
  }

  /* The affordance: a labelled strip, not a lone chevron. */
  .seq-headline {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 100%;
    padding: 0 8px;
    border: 0;
    border-right: 1px solid #141618;
    background: transparent;
    color: inherit;
    transition: background 0.12s;
  }
  .seq-headline:hover {
    background: #16181b;
  }
  .seq-headline:hover .seq-openlabel,
  .seq-headline:hover .seq-chevron {
    color: #35e08a;
  }

  .seq-chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: 1px solid #1e2226;
    border-radius: 2px;
    background: linear-gradient(180deg, #1c1e22, #141618);
    color: #6a7a80;
    transition: color 0.12s;
  }

  .seq-title {
    font-family: var(--font-ui);
    font-size: 9px;
    font-weight: 500;
    letter-spacing: 0.16em;
    color: #556070;
    white-space: nowrap;
  }

  .seq-openlabel {
    font-family: var(--font-ui);
    font-size: 7px;
    font-weight: 500;
    letter-spacing: 0.14em;
    color: #3f4653;
    white-space: nowrap;
    transition: color 0.12s;
  }

  .seq-btn {
    height: 16px;
    padding: 0 6px;
    border: 1px solid #1e2226;
    border-radius: 2px;
    background: #131517;
    color: #4a5260;
    font-family: var(--font-ui);
    font-size: 7px;
    font-weight: 500;
    letter-spacing: 0.1em;
    cursor: pointer;
    white-space: nowrap;
  }
  .seq-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .seq-btn[data-active='true'] {
    border-color: #22c55e55;
    background: #22c55e18;
    color: #4ade80;
  }
  .seq-btn-bank[data-active='true'] {
    border-color: #9d7bff55;
    background: #9d7bff18;
    color: #b79dff;
  }
  .seq-btn-midi[data-active='true'] {
    border-color: #4fd6e855;
    background: #4fd6e818;
    color: #7fe4f2;
  }

  /* Boxed cluster: three controls that only make sense read together. */
  .seq-group {
    display: flex;
    align-items: center;
    gap: 3px;
    height: 18px;
    padding: 0 5px;
    border: 1px solid #16181b;
    border-radius: 3px;
    background: #0c0e10;
  }
  .seq-group-label {
    font-family: var(--font-ui);
    font-size: 6.5px;
    font-weight: 500;
    letter-spacing: 0.16em;
    color: #3f4653;
  }
  .seq-group-hint {
    font-family: var(--font-ui);
    font-size: 6.5px;
    letter-spacing: 0.08em;
    color: #33383f;
    white-space: nowrap;
  }

  .seq-readout {
    margin-left: auto;
    display: flex;
    gap: 10px;
    font-family: var(--font-ui);
    font-size: 8px;
    letter-spacing: 0.12em;
    color: #4a5260;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .seq-readout-name {
    font-weight: 500;
  }

  /* One gutter width everywhere, so SONG, the ruler, the lane and every slot row
     share a left edge. */
  .seq-gutter-label {
    display: flex;
    align-items: center;
    font-family: var(--font-ui);
    font-size: 6.5px;
    font-weight: 500;
    letter-spacing: 0.14em;
    color: #33383f;
  }

  .seq-song {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding: 5px 8px 3px;
  }
  .seq-song .seq-gutter-label {
    width: 54px;
    flex-shrink: 0;
    justify-content: flex-end;
  }

  .seq-arrangement {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: stretch;
    gap: 2px;
  }

  /* One line for the whole song, drawn over the sections rather than inside one
     of them. */
  .seq-songhead {
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 1px;
    background: #35e08a;
    box-shadow: 0 0 6px #35e08a;
    pointer-events: none;
    transition: left 0.15s linear;
  }

  .seq-section {
    position: relative;
    flex-basis: 0;
    min-width: 0;
    height: 22px;
    overflow: hidden;
    padding: 0;
    border: 1px solid #1a1c1e;
    border-radius: 2px;
    background: #101214;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }
  .seq-section:hover {
    background: #16181b;
  }
  /* Progress runs under the label so the section fills as its bars elapse. */
  .seq-section-fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: rgba(255, 255, 255, 0.06);
    transition: width 0.15s linear;
  }
  .seq-section-body {
    position: relative;
    display: flex;
    align-items: center;
    gap: 5px;
    height: 100%;
    padding: 0 6px;
  }
  .seq-section-tick {
    width: 2px;
    height: 11px;
    flex-shrink: 0;
    border-radius: 1px;
  }
  .seq-section-name {
    font-family: var(--font-ui);
    font-size: 8px;
    font-weight: 500;
    letter-spacing: 0.12em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .seq-section-bars {
    margin-left: auto;
    font-family: var(--font-ui);
    font-size: 7px;
    color: #55696e;
    font-variant-numeric: tabular-nums;
  }

  /*
   * The matrix. One grid declaration owns every column boundary in the dock, so
   * the ruler, the trigger lane and all ten slot rows cannot drift apart — the
   * lane is only meaningful read vertically against the cells below it.
   */
  .seq-board {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-columns: 54px repeat(var(--seq-cols), minmax(0, 1fr));
    /* ruler, trigger lane, then the slot rows share what is left */
    grid-template-rows: 12px 18px repeat(var(--seq-rows), minmax(11px, 1fr));
    gap: 2px;
    padding: 2px 8px 8px;
    column-gap: 2px;
  }

  .seq-corner {
    justify-content: flex-end;
    padding-right: 2px;
  }

  .seq-tick {
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 6.5px;
    color: #2f363a;
    font-variant-numeric: tabular-nums;
  }
  /* Quarter-note anchors, so 16 columns read as four beats at a glance. */
  .seq-tick.is-beat {
    color: #8ba0a6;
    font-weight: 600;
  }
  .seq-tick.is-lit {
    color: #35e08a;
  }

  .seq-triglabel {
    justify-content: flex-end;
    padding-right: 4px;
    color: #4fd6e8aa;
  }

  .seq-trig {
    position: relative;
    border-radius: 2px;
    background: #0d0f11;
    box-shadow: inset 0 0 0 1px #16181b;
    overflow: hidden;
  }
  .seq-trig.is-beat {
    background: #121517;
  }
  .seq-trig.is-lit {
    box-shadow: inset 0 0 0 1px #35e08a66;
  }
  /* Grows from the floor: a hit is a level, and levels read upward. */
  .seq-trig-fill {
    position: absolute;
    inset: auto 0 0 0;
    background: linear-gradient(180deg, #4fd6e8, #2b8fa0);
    transition: height 0.2s ease, opacity 0.2s ease;
  }

  .seq-rowlabel {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    padding: 0 4px 0 0;
    border: 0;
    border-right: 1px solid #16181b;
    background: transparent;
    color: #4a5260;
    font-family: var(--font-ui);
    font-size: 7px;
    letter-spacing: 0.08em;
    text-align: left;
    transition: background 0.12s;
  }
  .seq-rowlabel:hover {
    background: #16181b;
  }
  .seq-rowlabel[data-active='true'] {
    background: #14171a;
  }
  .seq-rowlabel-tick {
    width: 2px;
    align-self: stretch;
    margin: 1px 0;
    border-radius: 1px;
    background: #1e2226;
    flex-shrink: 0;
  }
  .seq-rowlabel-slot {
    font-weight: 600;
    color: #6d8288;
    flex-shrink: 0;
  }
  .seq-rowlabel-fx {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #3f4653;
  }

  .seq-cell {
    position: relative;
    padding: 0;
    border: 1px solid #17191c;
    border-radius: 2px;
    background: #0f1113;
    transition: background 0.1s, border-color 0.1s, transform 0.1s;
  }
  /* Beat groups. Sixteen equal cells in a row is a wall of dashes; a rule every
     fourth column turns it into four beats you can count without reading the
     ruler. Applied to the lane too, so both stripe on the same boundaries. */
  .seq-cell.is-beat,
  .seq-trig.is-beat {
    background: #141719;
  }
  .seq-cell.is-beat,
  .seq-trig.is-beat,
  .seq-tick.is-beat {
    margin-left: 2px;
  }

  /* The seam between the two rack rows — A5 and B1 are different hardware.
     A gap rather than a rule: the lit-column and on-cell states already own
     box-shadow on these cells, and a second seam drawn there would blink out
     every time the playhead crossed it. */
  .seq-cell.is-rowbreak,
  .seq-rowlabel.is-rowbreak {
    margin-top: 4px;
  }
  .seq-rowlabel.is-rowbreak {
    border-top: 1px solid #1e2226;
  }
  /* The row you are painting into is the row you are reading, so it gets the
     only lift in the matrix. */
  .seq-cell.is-rowactive {
    border-color: #23282c;
  }
  .seq-cell:hover {
    border-color: #35e08a55;
    transform: scale(1.06);
  }
  .seq-cell.is-on {
    border-color: transparent;
  }
  /* The playhead column, not a per-cell marker: one lit column crossing ten rows
     is legible at any row height. */
  .seq-cell.is-lit {
    box-shadow: inset 0 0 0 1px #35e08a44;
  }
  .seq-cell.is-on.is-lit {
    box-shadow: inset 0 0 0 1px #ffffffcc;
  }
</style>
