<script lang="ts">
  import { Upload, X } from '@lucide/svelte';
  import { getModuleDef } from '$lib/modules/catalog';
  import { sequencerArmed } from '$lib/stores/sequencer';
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import { rackTop, rackBottom, moduleParams, MAX_RACK_SLOTS_PER_ROW } from '$lib/stores/rack';
  import { firingTimes, noteIsHighlighted } from '$lib/stores/midiTrigger';
  import {
    activeChannelId,
    addMidiChannels,
    clearMidiChannels,
    midiChannels,
    removeMidiChannel
  } from '$lib/stores/midiChannels';
  import { analysisBeatGrid, analysisOnsets } from '$lib/stores/triggerLane';
  import {
    ARRANGEMENT_STEPS,
    activeSectionIndex,
    arrangement,
    arrangementTotalSteps,
    autoBank,
    barInSection,
    clearCutsBetween,
    cuts,
    moduleForSlotIndex,
    sectionStarts,
    selectSection,
    toggleCut
  } from '$lib/stores/arrangement';

  let midiInput = $state<HTMLInputElement>();
  /** Which slot a click on empty track paints. */
  let paintSlot = $state(0);

  const slotCount = $derived($rackTop.length + $rackBottom.length);
  const totalSteps = $derived($arrangementTotalSteps);
  const totalBars = $derived(totalSteps / ARRANGEMENT_STEPS);

  /** Absolute sixteenth the transport is on — the whole view's x cursor. */
  const playStep = $derived(Math.max(0, Math.floor($transportDisplay.beat * 4)));
  const playFraction = $derived(totalSteps > 0 ? (playStep % totalSteps) / totalSteps : 0);

  function pct(step: number) {
    return totalSteps > 0 ? (step / totalSteps) * 100 : 0;
  }

  function slotInfo(slotIndex: number) {
    const id = moduleForSlotIndex($rackTop, $rackBottom, slotIndex);
    const def = id ? getModuleDef(id) : undefined;
    return def ? { name: def.shortName, color: def.accentColor } : null;
  }

  function slotName(slotIndex: number) {
    return slotIndex < MAX_RACK_SLOTS_PER_ROW
      ? `A${slotIndex + 1}`
      : `B${slotIndex - MAX_RACK_SLOTS_PER_ROW + 1}`;
  }

  /**
   * Seconds to an absolute sixteenth, via the hosted beat grid when there is
   * one. Constant BPM would put the back half of a drifting track in the wrong
   * bar, which on a song-length view is visible as the ticks sliding away from
   * the bar lines.
   */
  function stepAtSeconds(seconds: number) {
    const grid = $analysisBeatGrid;
    const bpm = $transportDisplay.bpm || 120;
    if (grid.length < 2) return (seconds * bpm) / 60 * 4;
    if (seconds <= grid[0]) return 0;
    const last = grid.length - 1;
    if (seconds >= grid[last]) {
      const span = grid[last] - grid[last - 1];
      return (span > 0 ? last + (seconds - grid[last]) / span : last) * 4;
    }
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (grid[mid] <= seconds) lo = mid;
      else hi = mid;
    }
    const span = grid[hi] - grid[lo];
    return (span > 0 ? lo + (seconds - grid[lo]) / span : lo) * 4;
  }

  /**
   * Thin a tick list down to what a lane can actually draw.
   *
   * Drums is 918 onsets; at a few hundred pixels of lane that is more marks than
   * pixels, and the browser pays for every one of them. Bucketing by column
   * keeps the shape — where the part is busy and where it drops out — which is
   * the only thing this lane is claiming to show.
   */
  const TICK_BUCKETS = 720;
  function bucketTicks(times: readonly number[]): number[] {
    if (totalSteps <= 0) return [];
    const seen = new Uint8Array(TICK_BUCKETS);
    for (const t of times) {
      const step = stepAtSeconds(t);
      if (!Number.isFinite(step) || step < 0 || step >= totalSteps) continue;
      seen[Math.min(TICK_BUCKETS - 1, Math.floor((step / totalSteps) * TICK_BUCKETS))] = 1;
    }
    const out: number[] = [];
    for (let i = 0; i < TICK_BUCKETS; i++) if (seen[i]) out.push((i / TICK_BUCKETS) * 100);
    return out;
  }

  const audioTicks = $derived(bucketTicks($analysisOnsets));

  /**
   * Where onset data stops. Analysis only ever sees the first 90 seconds of a
   * track — prepareAnalysisUpload trims to ANALYSIS_MAX_DURATION_S and shrinks
   * further to fit the serverless body limit — so on anything longer the lane
   * simply runs out of hits partway across. That looked like a broken lane;
   * marking the uncovered span says it is missing data, not a missing feature.
   */
  const analysisEndPct = $derived(audioTicks.length > 0 ? audioTicks[audioTicks.length - 1] : 0);
  const analysisTruncated = $derived(audioTicks.length > 0 && analysisEndPct < 92);
  const channelTicks = $derived(
    $midiChannels.map((channel) => {
      const density = channel.moduleId ? ($moduleParams[channel.moduleId]?.density ?? 100) / 100 : 1;
      const times = channel.notes
        ? firingTimes({ name: channel.name, notes: channel.notes, duration: channel.duration }, density)
        : channel.onsets;
      return {
        channel,
        density,
        keptCount: times.length,
        ticks: times.map((time) => ({
          left: pct(stepAtSeconds(time)),
          active: noteIsHighlighted(
            time,
            $transportDisplay.time,
            channel.duration,
            $transportDisplay.playing
          )
        }))
      };
    })
  );

  /** Cuts grouped per slot lane. */
  const cutsBySlot = $derived.by(() => {
    const lanes: Array<Array<{ step: number }>> = Array.from({ length: slotCount }, () => []);
    for (const cut of $cuts) {
      if (cut.slotIndex >= 0 && cut.slotIndex < slotCount) lanes[cut.slotIndex].push(cut);
    }
    return lanes;
  });

  /** Click anywhere on a lane to place a cut on the nearest sixteenth. */
  function paintAt(event: MouseEvent, slotIndex: number) {
    const track = event.currentTarget as HTMLElement;
    const rect = track.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    toggleCut(Math.round(fraction * totalSteps), slotIndex);
  }
</script>

<section class="arrange">
  <header class="arr-head">
    <span class="arr-title">ARRANGEMENT</span>
    <span class="arr-sub">{totalBars} BARS · {$cuts.length} CUTS</span>

    <button
      type="button"
      class="arr-btn"
      data-active={$sequencerArmed}
      onclick={() => sequencerArmed.update((v) => !v)}
      title="Let the arrangement drive PGM cuts"
    >{$sequencerArmed ? 'ARMED' : 'OFF'}</button>
    <button
      type="button"
      class="arr-btn"
      data-active={$autoBank}
      onclick={() => autoBank.update((v) => !v)}
      title="Entering a section rebuilds the rack from its FX bank"
    >AUTO-BANK</button>
    <button
      type="button"
      class="arr-btn"
      onclick={() => clearCutsBetween(0, totalSteps)}
      title="Remove every cut in the arrangement"
    >CLEAR CUTS</button>

    <span class="arr-paint">
      <span class="arr-paint-label">PAINT</span>
      {#each Array(slotCount) as _, i (i)}
        {@const info = slotInfo(i)}
        <button
          type="button"
          class="arr-chip"
          data-active={paintSlot === i}
          style={paintSlot === i && info ? `border-color:${info.color};color:${info.color}` : ''}
          onclick={() => (paintSlot = i)}
          title="Paint {info?.name ?? 'empty'}"
        >{slotName(i)}</button>
      {/each}
    </span>

    <button
      type="button"
      class="arr-btn arr-btn-load"
      onclick={() => midiInput?.click()}
      title="Load stem .mid files as trigger channels"
    >
      <Upload size={9} /> LOAD MIDI STEMS
    </button>
    <!-- Importing appends lanes, so without this the only way back from a
         wrong set of stems was reloading the app. Deliberately not called
         CLEAR: that word already means cuts one button along, and losing
         imported stems when you meant to clear cuts is the worse mistake. -->
    {#if $midiChannels.length > 0}
      <button
        type="button"
        class="arr-btn"
        onclick={() => clearMidiChannels()}
        title="Remove every imported MIDI stem lane (does not touch cuts)"
      >DROP STEMS</button>
    {/if}
    <input
      bind:this={midiInput}
      type="file"
      accept=".mid,.midi"
      multiple
      hidden
      onchange={(e) => {
        const input = e.currentTarget;
        void addMidiChannels(Array.from(input.files ?? [])).then(() => {
          input.value = '';
        });
      }}
    />
  </header>

  <div class="arr-scroll">
    <!-- Sections. Width is share of song, so the strip is the song's shape. -->
    <div class="arr-row arr-row-sections">
      <span class="arr-gutter">SONG</span>
      <div class="arr-track arr-sections">
        {#each $arrangement as section, i (section.id)}
          {@const on = i === $activeSectionIndex}
          <button
            type="button"
            class="arr-section"
            data-active={on}
            style="flex-grow:{section.bars};{on
              ? `background:${section.hue}1c;box-shadow:inset 0 0 0 1px ${section.hue}77`
              : ''}"
            onclick={() => selectSection(i)}
            title="{section.name} — {section.bars} bars, from bar {$sectionStarts[i] + 1}"
          >
            <span class="arr-section-tick" style="background:{section.hue}"></span>
            <span class="arr-section-name" style="color:{on ? section.hue : '#7d9196'}">
              {section.name}
            </span>
            <span class="arr-section-bars">{section.bars}b</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Bar ruler. Every 4 bars gets a number; the rest are hairlines. -->
    <div class="arr-row arr-row-ruler">
      <span class="arr-gutter"></span>
      <div class="arr-track arr-ruler">
        {#each Array(Math.max(0, Math.ceil(totalBars / 4))) as _, i (i)}
          <span class="arr-bar" style="left:{pct(i * 4 * ARRANGEMENT_STEPS)}%">{i * 4 + 1}</span>
        {/each}
      </div>
    </div>

    <!-- One lane per rack slot. A cut is an object at a position in the song. -->
    {#each Array(slotCount) as _, slotIndex (slotIndex)}
      {@const info = slotInfo(slotIndex)}
      <div class="arr-row arr-row-slot" class:is-rowbreak={slotIndex === MAX_RACK_SLOTS_PER_ROW}>
        <button
          type="button"
          class="arr-gutter arr-gutter-slot"
          data-active={paintSlot === slotIndex}
          onclick={() => (paintSlot = slotIndex)}
        >
          <span class="arr-gutter-slotname">{slotName(slotIndex)}</span>
          <span class="arr-gutter-fx" style={info ? `color:${info.color}` : ''}>
            {info?.name ?? '—'}
          </span>
        </button>
        <div
          class="arr-track arr-lane"
          role="button"
          tabindex="-1"
          onclick={(e) => paintAt(e, slotIndex)}
          onkeydown={() => {}}
          title="Click to place a cut on {info?.name ?? slotName(slotIndex)}"
        >
          {#each $arrangement as section, i (section.id)}
            <span
              class="arr-lane-sec"
              style="left:{pct($sectionStarts[i] * ARRANGEMENT_STEPS)}%;width:{pct(
                section.bars * ARRANGEMENT_STEPS
              )}%"
            ></span>
          {/each}
          {#each cutsBySlot[slotIndex] ?? [] as cut (cut.step)}
            <span
              class="arr-cut"
              style="left:{pct(cut.step)}%;background:{info?.color ?? '#5f7378'}"
            ></span>
          {/each}
        </div>
      </div>
    {/each}

    <!-- Trigger channels. Ticks at true song positions, so a part that only
         enters in the last third reads as entering in the last third. -->
    <div class="arr-row arr-row-chan">
      <span class="arr-gutter arr-gutter-chan">AUDIO</span>
      <div class="arr-track arr-chan" data-empty={audioTicks.length === 0}>
        {#each audioTicks as left, i (i)}
          <span class="arr-tick arr-tick-audio" style="left:{left}%"></span>
        {/each}
        {#if analysisTruncated}
          <span
            class="arr-chan-uncovered"
            style="left:{analysisEndPct}%"
            title="Analysis covers only the first 90 seconds of a track, so onsets stop here. The song keeps playing; there is just no onset data past this point."
          ></span>
        {/if}
        {#if audioTicks.length === 0}
          <span class="arr-chan-empty">no onset data — load a track and run analysis</span>
        {/if}
      </div>
    </div>

    {#each channelTicks as { channel, ticks, density, keptCount } (channel.id)}
      <div class="arr-row arr-row-chan">
        <button
          type="button"
          class="arr-gutter arr-gutter-chan arr-gutter-midi"
          data-active={$activeChannelId === channel.id}
          onclick={() => activeChannelId.set(channel.id)}
          title="{channel.name} — {keptCount}/{channel.noteCount} notes fire at {Math.round(density * 100)}% density"
        >
          <span class="arr-chan-dot" style="background:{channel.color}"></span>
          {channel.name}
          {#if channel.moduleId}<small>{keptCount}/{channel.noteCount} · {Math.round(density * 100)}%</small>{/if}
        </button>
        <div class="arr-track arr-chan">
          {#each ticks as tick, i (i)}
            <span
              class="arr-tick"
              class:arr-tick-active={tick.active}
              data-active={tick.active}
              style="left:{tick.left}%;background:{channel.color}"
            ></span>
          {/each}
          <button
            type="button"
            class="arr-chan-remove"
            onclick={() => removeMidiChannel(channel.id)}
            aria-label="Remove {channel.name}"
          ><X size={9} /></button>
        </div>
      </div>
    {/each}

    {#if $midiChannels.length === 0}
      <p class="arr-empty">
        LOAD MIDI STEMS to add trigger channels — one lane per instrument, ticks where its notes land.
      </p>
    {/if}

    <!-- One playhead for the whole view, over every lane at once. -->
    <span class="arr-playhead" style="left:calc(var(--arr-gutter-w) + {playFraction} * (100% - var(--arr-gutter-w)))"></span>
  </div>
</section>

<style>
  .arr-gutter-chan small {
    display: block;
    font-size: 5.5px;
    color: #52606d;
  }

  .arr-tick-active {
    width: 2px !important;
    box-shadow: 0 0 7px currentColor;
    opacity: 1 !important;
  }
  .arrange {
    --arr-gutter-w: 74px;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #0a0b0c;
  }

  .arr-head {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    height: 30px;
    padding: 0 10px;
    border-bottom: 1px solid #141618;
    background: linear-gradient(180deg, #101214, #0c0d0f);
  }
  .arr-title {
    font-family: var(--font-ui);
    font-size: 9px;
    font-weight: 500;
    letter-spacing: 0.18em;
    color: #8ba0a6;
  }
  .arr-sub {
    font-family: var(--font-ui);
    font-size: 7px;
    letter-spacing: 0.12em;
    color: #33383f;
    font-variant-numeric: tabular-nums;
  }

  .arr-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 18px;
    padding: 0 7px;
    border: 1px solid #1e2226;
    border-radius: 2px;
    background: #131517;
    color: #5f7378;
    font-family: var(--font-ui);
    font-size: 7px;
    font-weight: 500;
    letter-spacing: 0.12em;
    white-space: nowrap;
  }
  .arr-btn:hover {
    color: #cfe0e2;
  }
  .arr-btn[data-active='true'] {
    border-color: #35e08a55;
    background: #35e08a14;
    color: #4ade80;
  }
  .arr-btn-load {
    margin-left: auto;
  }

  .arr-paint {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-left: 8px;
  }
  .arr-paint-label {
    font-family: var(--font-ui);
    font-size: 6.5px;
    letter-spacing: 0.14em;
    color: #33383f;
  }
  .arr-chip {
    height: 16px;
    min-width: 21px;
    border: 1px solid #1e2226;
    border-radius: 2px;
    background: #131517;
    color: #4a5260;
    font-family: var(--font-ui);
    font-size: 6.5px;
    font-weight: 500;
  }

  /*
   * Column flex, not a plain block: eighteen lanes at a fixed 17px filled half
   * the screen and left the rest black, which is the same dead space the dock
   * used to leave. The lanes take the height that exists and stop growing at a
   * point where a taller lane would stop adding information — a cut is a mark,
   * not a bar, so past ~34px it is just a longer mark.
   */
  .arr-scroll {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    padding: 6px 10px 12px;
  }

  .arr-row {
    display: flex;
    align-items: stretch;
    gap: 6px;
    margin-bottom: 2px;
    flex-shrink: 0;
  }
  .arr-row-sections {
    height: 24px;
    margin-bottom: 3px;
  }
  /* Follows .arr-bar's line-height — an 11px row clipped the taller numbers. */
  .arr-row-ruler {
    height: 13px;
  }
  /* Slot lanes carry more weight than channel lanes — they are the thing being
     authored; the channels are reference underneath them. */
  .arr-row-slot {
    flex: 3 1 auto;
    min-height: 17px;
    max-height: 58px;
  }
  .arr-row-chan {
    flex: 2 1 auto;
    min-height: 15px;
    max-height: 38px;
  }
  /* The seam between the two rack rows. */
  .arr-row-slot.is-rowbreak {
    margin-top: 5px;
  }

  .arr-gutter {
    display: flex;
    align-items: center;
    width: var(--arr-gutter-w);
    flex-shrink: 0;
    font-family: var(--font-ui);
    font-size: 6.5px;
    font-weight: 500;
    letter-spacing: 0.12em;
    color: #33383f;
  }

  .arr-gutter-slot {
    gap: 4px;
    padding: 0 4px 0 0;
    border: 0;
    border-right: 1px solid #16181b;
    background: transparent;
    text-align: left;
  }
  .arr-gutter-slot:hover,
  .arr-gutter-slot[data-active='true'] {
    background: #131619;
  }
  .arr-gutter-slotname {
    color: #6d8288;
    font-weight: 600;
    flex-shrink: 0;
  }
  .arr-gutter-fx {
    color: #3f4653;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .arr-gutter-chan {
    gap: 4px;
    padding-right: 4px;
    border: 0;
    border-right: 1px solid #16181b;
    background: transparent;
    color: #55696e;
    text-align: left;
  }
  .arr-gutter-midi[data-active='true'] {
    background: #131619;
    color: #cfe0e2;
  }
  .arr-chan-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .arr-track {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  .arr-sections {
    display: flex;
    gap: 2px;
  }
  .arr-section {
    position: relative;
    display: flex;
    align-items: center;
    gap: 5px;
    flex-basis: 0;
    min-width: 0;
    padding: 0 6px;
    border: 1px solid #1a1c1e;
    border-radius: 2px;
    background: #0f1113;
    text-align: left;
  }
  .arr-section:hover {
    background: #16181b;
  }
  .arr-section-tick {
    width: 2px;
    height: 11px;
    flex-shrink: 0;
    border-radius: 1px;
  }
  .arr-section-name {
    font-family: var(--font-ui);
    font-size: 8px;
    font-weight: 500;
    letter-spacing: 0.1em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .arr-section-bars {
    margin-left: auto;
    font-family: var(--font-ui);
    font-size: 6.5px;
    color: #55696e;
    font-variant-numeric: tabular-nums;
  }

  .arr-ruler {
    border-bottom: 1px solid #16181b;
  }
  /* Was 6px in #3c464a: below a readable size and barely above the lane
     colour, so bar positions could not be read at a glance while performing.
     Selecting the text did not help either, because a 6px glyph highlights to
     a sliver. Bigger and brighter, with a tick that actually marks the bar. */
  .arr-bar {
    position: absolute;
    top: 0;
    padding-left: 3px;
    border-left: 1px solid #2b3338;
    font-family: var(--font-mono);
    font-size: 9px;
    color: #8b979d;
    font-variant-numeric: tabular-nums;
    line-height: 13px;
  }

  /* Hatched span where analysis never reached. Reads as absent data rather
     than an empty lane someone forgot to fill. */
  .arr-chan-uncovered {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    border-left: 1px dashed #3a4a3f;
    background: repeating-linear-gradient(
      -45deg,
      rgba(255, 255, 255, 0.028) 0 3px,
      transparent 3px 7px
    );
    pointer-events: auto;
  }

  .arr-lane {
    border-radius: 2px;
    background: #0d0f11;
    cursor: crosshair;
  }
  /* Section bands behind the cuts, so a lane still reads as verse/chorus. */
  .arr-lane-sec {
    position: absolute;
    top: 0;
    bottom: 0;
    border-right: 1px solid #141719;
  }
  .arr-lane-sec:nth-child(even) {
    background: rgba(255, 255, 255, 0.014);
  }

  /* A cut is a mark at a moment, not a filled cell — sixteen bars of chorus can
     hold 256 of them and they must not merge into a bar. */
  .arr-cut {
    position: absolute;
    top: 2px;
    bottom: 2px;
    width: 3px;
    margin-left: -1px;
    border-radius: 1px;
  }

  .arr-chan {
    border-radius: 2px;
    background: #0c0e10;
  }
  .arr-chan[data-empty='true'] {
    background: transparent;
  }
  .arr-tick {
    position: absolute;
    top: 3px;
    bottom: 3px;
    width: 1px;
    background: #4fd6e8;
    opacity: 0.75;
  }
  .arr-tick-audio {
    background: #55696e;
  }
  .arr-chan-empty {
    position: absolute;
    inset: 0 auto 0 4px;
    display: flex;
    align-items: center;
    font-family: var(--font-ui);
    font-size: 6.5px;
    letter-spacing: 0.1em;
    color: #2f363a;
  }
  .arr-chan-remove {
    position: absolute;
    top: 1px;
    right: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    padding: 0;
    border: 0;
    border-radius: 1px;
    background: rgba(0, 0, 0, 0.6);
    color: #55696e;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .arr-row-chan:hover .arr-chan-remove,
  .arr-chan-remove:focus-visible {
    opacity: 1;
  }
  .arr-chan-remove:hover {
    background: #7a2222;
    color: #fff;
  }

  .arr-empty {
    margin: 8px 0 0 calc(var(--arr-gutter-w) + 6px);
    font-family: var(--font-ui);
    font-size: 7px;
    letter-spacing: 0.1em;
    color: #2f363a;
  }

  /* One line across every lane. On a song-length view this is the only thing
     that says where you are. */
  .arr-playhead {
    position: absolute;
    top: 6px;
    bottom: 12px;
    width: 1px;
    background: #35e08a;
    box-shadow: 0 0 6px #35e08a;
    pointer-events: none;
    transition: left 0.12s linear;
  }
</style>
