<script lang="ts">
  import { Upload, X } from '@lucide/svelte';
  import { getModuleDef } from '$lib/modules/catalog';
  import { sequencerArmed } from '$lib/stores/sequencer';
  import { viewMode } from '$lib/stores/rackUi';
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import {
    rackTop,
    rackBottom,
    moduleParams,
    midiLayers,
    MAX_RACK_SLOTS_PER_ROW
  } from '$lib/stores/rack';
  import {
    firingTimes,
    moduleTriggerSource,
    setModuleTriggerSource
  } from '$lib/stores/midiTrigger';
  import {
    activeChannelId,
    addMidiChannels,
    clearMidiChannels,
    midiChannels,
    removeMidiChannel
  } from '$lib/stores/midiChannels';
  import { analysisBeatGrid, analysisOnsets } from '$lib/stores/triggerLane';
  import { audioEngine } from '$lib/audio';
  import {
    arrangementTimelineScale,
    secondsStep,
    stepPercent,
    stepSeconds
  } from '$lib/arrangement/timelineScale';
  import {
    ARRANGEMENT_STEPS,
    activeSectionIndex,
    arrangement,
    arrangementStructureStatus,
    arrangementTotalSteps,
    autoBank,
    barInSection,
    clearCutsBetween,
    cuts,
    moduleForSlotIndex,
    sectionStarts,
    selectSection,
    toggleCut,
    updateSectionHue,
    updateSectionKind,
  } from '$lib/stores/arrangement';
  import {
    SECTION_KIND_OPTIONS,
    sectionKindOf,
    type SectionKind,
  } from '$lib/arrangement/sectionKinds';

  let midiInput = $state<HTMLInputElement>();
  /** Which slot a click on empty track paints. */
  let paintSlot = $state(0);
  let zoom = $state(1);

  const slotCount = $derived($rackTop.length + $rackBottom.length);
  const totalSteps = $derived($arrangementTotalSteps);
  const totalBars = $derived(totalSteps / ARRANGEMENT_STEPS);
  const scale = $derived(arrangementTimelineScale(
    totalSteps,
    $transportDisplay.duration,
    $analysisBeatGrid,
    $transportDisplay.bpm || 120
  ));

  /** Absolute sixteenth the transport is on — the whole view's x cursor. */
  const playStep = $derived(secondsStep(
    $transportDisplay.time,
    $analysisBeatGrid,
    $transportDisplay.bpm || 120
  ));

  function pct(step: number) {
    return stepPercent(step, scale);
  }

  function seekAt(event: MouseEvent) {
    const track = event.currentTarget as HTMLElement;
    const rect = track.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const step = scale.startStep + fraction * scale.totalSteps;
    audioEngine.seek(stepSeconds(step, $analysisBeatGrid, $transportDisplay.bpm || 120));
  }

  function seekAtKeyboard(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    const step = Math.min(totalSteps, Math.max(0, playStep));
    audioEngine.seek(stepSeconds(step, $analysisBeatGrid, $transportDisplay.bpm || 120));
  }

  function paintAtKeyboard(event: KeyboardEvent, slotIndex: number) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggleCut(Math.round(Math.min(totalSteps, Math.max(0, playStep))), slotIndex);
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
  const analysisEndPct = $derived(
    $transportDisplay.analysisDuration > 0
      ? pct(secondsStep($transportDisplay.analysisDuration, $analysisBeatGrid, $transportDisplay.bpm || 120))
      : 0
  );
  const analysisTruncated = $derived(
    $transportDisplay.analysisDuration > 0 &&
    $transportDisplay.duration > $transportDisplay.analysisDuration + 1
  );
  const channelTicks = $derived(
    $midiChannels.map((channel) => ({
      channel,
      keptCount: channel.onsets.length,
      ticks: bucketTicks(channel.onsets)
    }))
  );
  const moduleMidiTicks = $derived(
    Object.entries($midiLayers).flatMap(([moduleId, layer]) => {
      if (!layer) return [];
      const module = getModuleDef(moduleId);
      const density = ($moduleParams[moduleId]?.density ?? 100) / 100;
      const times = firingTimes(layer, density);
      const source = $moduleTriggerSource[moduleId] ?? 'audio';
      return [{
        moduleId,
        layer,
        module,
        density,
        source,
        keptCount: times.length,
        ticks: bucketTicks(times)
      }];
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

  /** Section spans on the full song timeline — one coordinate system for SONG + lanes. */
  const sectionBands = $derived.by(() =>
    $arrangement.map((section, i) => {
      const bpm = $transportDisplay.bpm || 120;
      const grid = $analysisBeatGrid;
      const startStep =
        section.timeStartS != null
          ? secondsStep(section.timeStartS, grid, bpm)
          : $sectionStarts[i]! * ARRANGEMENT_STEPS;
      const endStep =
        section.timeEndS != null
          ? secondsStep(section.timeEndS, grid, bpm)
          : ($sectionStarts[i]! + section.bars) * ARRANGEMENT_STEPS;
      const leftPct = pct(startStep);
      const widthPct = Math.max(0, pct(endStep) - leftPct);
      return {
        id: section.id,
        name: section.name,
        hue: section.hue,
        startBar: $sectionStarts[i]! + 1,
        leftPct,
        widthPct,
      };
    }),
  );

  /** Click anywhere on a lane to place a cut on the nearest sixteenth. */
  function paintAt(event: MouseEvent, slotIndex: number) {
    const track = event.currentTarget as HTMLElement;
    const rect = track.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    toggleCut(Math.round(fraction * totalSteps), slotIndex);
  }
</script>

{#snippet sectionOverlay()}
  {#each sectionBands as band, i (band.id)}
    <span
      class="arr-sec-band"
      style="left:{band.leftPct}%;width:{band.widthPct}%;--sec-hue:{band.hue}"
      title="{band.name} — from bar {band.startBar}"
    ></span>
    {#if i > 0}
      <span
        class="arr-sec-split"
        style="left:{band.leftPct}%;--sec-hue:{band.hue}"
        title="{band.name}"
      ></span>
    {/if}
  {/each}
{/snippet}

<section class="arrange">
  <header class="arr-head">
    <span class="arr-title">ARRANGEMENT</span>
    <span class="arr-sub">{totalBars} BARS · {$cuts.length} CUTS</span>
    <button
      type="button"
      class="arr-btn"
      onclick={() => viewMode.set('perform')}
      title="Back to the rack and the program monitor"
    >PERFORM</button>

    <span class="arr-zoom" role="group" aria-label="Timeline zoom">
      <button type="button" class="arr-btn" onclick={() => (zoom = Math.max(1, zoom - 0.5))} disabled={zoom <= 1} aria-label="Zoom out">−</button>
      <span>{zoom.toFixed(1)}×</span>
      <button type="button" class="arr-btn" onclick={() => (zoom = Math.min(8, zoom + 0.5))} disabled={zoom >= 8} aria-label="Zoom in">+</button>
    </span>

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
   <div class="arr-canvas" style="width:{zoom * 100}%">
    <!-- Sections. Width is share of song, so the strip is the song's shape. -->
    <div class="arr-row arr-row-sections">
      <span class="arr-gutter">SONG</span>
      <div class="arr-track arr-sections" role="button" tabindex="0" onclick={seekAt} onkeydown={seekAtKeyboard} title="Click to seek; Enter or Space seeks to the playhead">
        {#if $arrangementStructureStatus === 'loading'}
          <span class="arr-section-loading">Detecting sections…</span>
        {/if}
        {#each sectionBands as band, i (band.id)}
          {@const section = $arrangement[i]}
          {@const on = i === $activeSectionIndex}
          <button
            type="button"
            class="arr-section arr-section-abs"
            data-active={on}
            style="left:{band.leftPct}%;width:{band.widthPct}%;{on
              ? `background:${section.hue}1c;box-shadow:inset 0 0 0 1px ${section.hue}77`
              : ''}"
            onclick={(event) => {
              if ((event.target as HTMLElement).closest('.arr-section-edit')) return;
              event.stopPropagation();
              selectSection(i);
              audioEngine.seek(
                stepSeconds(
                  section.timeStartS ?? $sectionStarts[i]! * ARRANGEMENT_STEPS,
                  $analysisBeatGrid,
                  $transportDisplay.bpm || 120,
                ),
              );
            }}
            title="{section.name} — {section.bars} bars, from bar {band.startBar}"
          >
            <label
              class="arr-section-edit arr-section-color-wrap"
              title="Section color"
              onclick={(event) => event.stopPropagation()}
            >
              <span class="arr-section-tick" style="background:{section.hue}"></span>
              <input
                type="color"
                class="arr-section-color"
                value={section.hue}
                aria-label="{section.name} color"
                oninput={(event) => {
                  event.stopPropagation();
                  updateSectionHue(i, event.currentTarget.value);
                }}
              />
            </label>
            <span
              class="arr-section-edit arr-section-kind"
              onclick={(event) => event.stopPropagation()}
            >
              <select
                class="arr-section-select"
                value={sectionKindOf(section)}
                aria-label="{section.name} part type"
                onchange={(event) => {
                  event.stopPropagation();
                  updateSectionKind(i, event.currentTarget.value as SectionKind);
                }}
                onclick={(event) => event.stopPropagation()}
              >
                {#each SECTION_KIND_OPTIONS as option (option.value)}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </span>
            <span class="arr-section-bars">{section.bars}b</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Bar ruler. Every 4 bars gets a number; the rest are hairlines. -->
    <div class="arr-row arr-row-ruler">
      <span class="arr-gutter"></span>
      <div class="arr-track arr-ruler" role="button" tabindex="0" onclick={seekAt} onkeydown={seekAtKeyboard} title="Click to seek; Enter or Space seeks to the playhead">
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
          tabindex="0"
          onclick={(e) => paintAt(e, slotIndex)}
          onkeydown={(event) => paintAtKeyboard(event, slotIndex)}
          title="Click to place a cut on {info?.name ?? slotName(slotIndex)}; Enter or Space places one at the playhead"
        >
          {@render sectionOverlay()}
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
      <div class="arr-track arr-chan" data-empty={audioTicks.length === 0} role="button" tabindex="0" onclick={seekAt} onkeydown={seekAtKeyboard} title="Click to seek; Enter or Space seeks to the playhead">
        {@render sectionOverlay()}
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

    {#each moduleMidiTicks as { moduleId, layer, module, density, source, keptCount, ticks } (moduleId)}
      <div
        class="arr-row arr-row-chan arr-row-module-midi"
        data-active={source === 'midi'}
        data-midi-module={moduleId}
        data-midi-identity={layer.identity ?? layer.name}
        data-midi-kept={ticks.length}
        data-midi-total={layer.notes.length}
        data-midi-density={Math.round(density * 100)}
      >
        <button
          type="button"
          class="arr-gutter arr-gutter-chan arr-gutter-module-midi"
          onclick={() => setModuleTriggerSource(moduleId, source === 'midi' ? 'audio' : 'midi')}
          title="{module?.name ?? moduleId}: {keptCount}/{layer.notes.length} notes at {Math.round(density * 100)}% density — click to use {source === 'midi' ? 'audio' : 'MIDI'}"
        >
          <span class="arr-chan-dot" style="background:{module?.accentColor ?? '#7aa2ff'}"></span>
          {module?.shortName ?? moduleId}
          <small>{source === 'midi' ? 'MIDI' : 'AUD'} · {keptCount}/{layer.notes.length}</small>
        </button>
        <div class="arr-track arr-chan" role="button" tabindex="0" onclick={seekAt} onkeydown={seekAtKeyboard} title="{layer.name} — click to seek; Enter or Space seeks to the playhead">
          {@render sectionOverlay()}
          {#each ticks as left, i (i)}
            <span
              class="arr-tick arr-tick-module"
              style="left:{left}%;background:{module?.accentColor ?? '#7aa2ff'}"
            ></span>
          {/each}
          <span class="arr-midi-count">{layer.name}</span>
        </div>
      </div>
    {/each}

    {#each channelTicks as { channel, ticks, keptCount } (channel.id)}
      <div class="arr-row arr-row-chan">
        <button
          type="button"
          class="arr-gutter arr-gutter-chan arr-gutter-midi"
          data-active={$activeChannelId === channel.id}
          onclick={() => activeChannelId.set(channel.id)}
          title="{channel.name} — {keptCount}/{channel.noteCount} onsets"
        >
          <span class="arr-chan-dot" style="background:{channel.color}"></span>
          {channel.name}
          <small>{keptCount}/{channel.noteCount}</small>
        </button>
        <div class="arr-track arr-chan" role="button" tabindex="0" onclick={seekAt} onkeydown={seekAtKeyboard} title="Click to seek; Enter or Space seeks to the playhead">
          {@render sectionOverlay()}
          {#each ticks as left, i (i)}
            <span
              class="arr-tick"
              style="left:{left}%;background:{channel.color}"
            ></span>
          {/each}
          <button
            type="button"
            class="arr-chan-remove"
            onclick={(event) => { event.stopPropagation(); removeMidiChannel(channel.id); }}
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
    <span class="arr-playhead" style="left:calc(var(--arr-gutter-w) + 6px + {pct(playStep) / 100} * (100% - var(--arr-gutter-w) - 6px))"></span>
   </div>
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
   * Column flex, not a plain block: lanes share the viewport height instead of
   * collapsing to a thin strip with dead space underneath. flex-shrink: 0 keeps
   * each row readable; overflow scrolls when MIDI lanes stack up.
   */
  .arr-scroll {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: auto;
    padding: 6px 10px 12px;
  }

  .arr-canvas {
    position: relative;
    flex: 1 0 auto;
    min-height: 100%;
    min-width: 100%;
    display: flex;
    flex-direction: column;
  }

  .arr-zoom {
    display: flex;
    align-items: center;
    gap: 3px;
    color: #6d8288;
    font: 7px var(--font-mono);
  }
  .arr-zoom .arr-btn { min-width: 18px; padding: 0; justify-content: center; }
  .arr-btn:disabled { opacity: 0.3; }

  .arr-row {
    display: flex;
    align-items: stretch;
    gap: 6px;
    margin-bottom: 2px;
    flex-shrink: 0;
  }
  .arr-row-sections {
    height: 30px;
    margin-bottom: 3px;
  }
  /* Follows .arr-bar's line-height — an 11px row clipped the taller numbers. */
  .arr-row-ruler {
    height: 13px;
  }
  /* Slot lanes carry more weight than channel lanes — they are the thing being
     authored; the channels are reference underneath them. */
  .arr-row-slot {
    flex: 3 0 auto;
    min-height: 28px;
    max-height: 72px;
  }
  .arr-row-chan {
    flex: 2 0 auto;
    min-height: 22px;
    max-height: 48px;
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
    position: sticky;
    left: 0;
    z-index: 3;
    background: #0a0b0c;
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
    position: relative;
    min-height: 30px;
  }
  .arr-section-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-ui);
    font-size: 8px;
    letter-spacing: 0.08em;
    color: #7d9196;
    background: rgba(8, 10, 12, 0.72);
    pointer-events: none;
    z-index: 2;
  }
  .arr-section {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    padding: 0 5px;
    border: 1px solid #1a1c1e;
    border-radius: 2px;
    background: #0f1113;
    text-align: left;
    box-sizing: border-box;
    overflow: hidden;
  }
  .arr-section[data-active='true'] {
    border-color: color-mix(in srgb, var(--sec-hue, #14b8a6) 45%, #1a1c1e);
  }
  .arr-section-abs {
    position: absolute;
    top: 0;
    bottom: 0;
    min-width: 28px;
  }
  .arr-section:hover {
    background: #16181b;
  }
  .arr-section-tick {
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    border-radius: 1px;
    pointer-events: none;
  }
  .arr-section-color-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    margin: 0;
    cursor: pointer;
  }
  .arr-section-color {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    border: 0;
    padding: 0;
  }
  .arr-section-kind {
    flex: 1;
    min-width: 0;
    display: flex;
  }
  .arr-section-select {
    width: 100%;
    min-width: 0;
    padding: 1px 2px;
    border: 1px solid #23282d;
    border-radius: 2px;
    background: #0a0c0d;
    color: #b8c7cc;
    font-family: var(--font-ui);
    font-size: 7px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .arr-section-select:hover,
  .arr-section-select:focus-visible {
    border-color: #14b8a6;
    outline: none;
  }
  .arr-section-bars {
    flex-shrink: 0;
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

  /* Section bands + split lines — cut lanes, AUDIO, and MIDI stems share this. */
  .arr-sec-band {
    position: absolute;
    top: 0;
    bottom: 0;
    pointer-events: none;
    border-right: 1px solid color-mix(in srgb, var(--sec-hue) 32%, transparent);
    background: color-mix(in srgb, var(--sec-hue) 7%, transparent);
  }
  .arr-sec-band:nth-of-type(odd) {
    background: color-mix(in srgb, var(--sec-hue) 12%, transparent);
  }
  .arr-sec-split {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 0;
    margin-left: -1px;
    border-left: 2px solid color-mix(in srgb, var(--sec-hue) 72%, #ffffff);
    opacity: 0.85;
    pointer-events: none;
    z-index: 1;
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
    z-index: 2;
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
    z-index: 2;
  }
  .arr-tick-audio {
    background: #55696e;
  }
  .arr-row-module-midi[data-active='false'] { opacity: 0.48; }
  .arr-gutter-module-midi { color: #809298; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .arr-tick-module.is-hit { width: 3px; opacity: 1; box-shadow: 0 0 7px currentColor; }
  .arr-midi-count {
    position: sticky;
    left: calc(var(--arr-gutter-w) + 10px);
    padding: 0 3px;
    font: 6.5px var(--font-mono);
    color: #526168;
    background: rgba(10, 11, 12, 0.8);
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
    z-index: 2;
  }

  @media (max-width: 1200px) {
    .arr-head { height: auto; min-height: 38px; flex-wrap: wrap; padding-block: 5px; }
    .arr-paint { order: 3; width: 100%; margin-left: 0; overflow-x: auto; }
    .arr-btn-load { margin-left: 0; }
    .arrange { --arr-gutter-w: 64px; }
    .arr-scroll { padding-inline: 6px; }
  }
</style>
