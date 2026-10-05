<script lang="ts">
  import { tick } from 'svelte';
  import { selectedArrangementSections } from '$lib/stores/arrangement';
  import { resolveSectionBounds } from '$lib/arrangement/sectionBounds';
  import { Upload, X } from '@lucide/svelte';
  import { getModuleDef } from '$lib/modules/catalog';
  import {
    arrangementMode,
    arrangementOverridden,
    backToArrangement,
    recordOverdub,
    setArrangementMode,
  } from '$lib/arrangement/transportMode';
  import {
    commitTriggerMarksToCuts,
    deleteTriggerMark,
    moveTriggerMark,
  } from '$lib/arrangement/triggerMarks';
  import {
    deleteSection,
    mergeWithNext,
    moveBoundary,
    renameSection,
    splitSection,
    type SectionEditContext,
  } from '$lib/arrangement/sectionEdits';
  import { viewMode, playbackWorkspace } from '$lib/stores/rackUi';
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
    barNumberAtTime,
    beatGridSongOffset,
    frameViewportFromSeconds,
    isFullViewport,
    followPlayheadViewport,
    rulerBarMarks,
    rulerBarTicks,
    rulerBeatTicks,
    secondsStep,
    secondsToCutStep,
    songTimeline,
    stepSeconds,
    viewSecondsFromFraction,
    viewTimePercent,
    viewportZoomFactor,
    zoomViewportAround,
  } from '$lib/arrangement/timelineScale';
  import {
    ARRANGEMENT_STEPS,
    activeSectionIndex,
    arrangement,
    arrangementLoopRegion,
    arrangementStructureStatus,
    arrangementTotalSteps,
    arrangementClips,
    arrangementRecording,
    arrangementTriggers,
    autoBank,
    autoClips,
    barInSection,
    captureSectionScene,
    clearSectionScene,
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
    SECTION_KIND_HUE,
    sectionKindOf,
    type SectionKind,
  } from '$lib/arrangement/sectionKinds';

  let midiInput = $state<HTMLInputElement>();
  /** Which slot a click on empty track paints. */
  let paintSlot = $state(0);
  /** Visible time window — replaces width-only zoom. */
  let viewStartS = $state(0);
  let viewEndS = $state<number | null>(null);
  let showBeatGrid = $state(true);

  let openSectionKindIndex = $state<number | null>(null);
  let kindMenuRect = $state<{ top: number; left: number; width: number } | null>(null);

  const slotCount = $derived($rackTop.length + $rackBottom.length);
  const totalSteps = $derived($arrangementTotalSteps);
  const totalBars = $derived(totalSteps / ARRANGEMENT_STEPS);
  const bpm = $derived($transportDisplay.bpm || 120);

  const sectionBounds = $derived(
    resolveSectionBounds($arrangement, $sectionStarts, $analysisBeatGrid, bpm),
  );
  const arrangementDuration = $derived(
    sectionBounds.reduce((max, band) => Math.max(max, band.endSeconds), 0),
  );
  const timeline = $derived(
    songTimeline(
      Math.max($transportDisplay.duration, arrangementDuration),
      $analysisBeatGrid,
      bpm,
    ),
  );
  const viewport = $derived({
    startSeconds: viewStartS,
    endSeconds: viewEndS ?? timeline.durationSeconds,
  });
  const zoomFactor = $derived(viewportZoomFactor(viewport, timeline));
  const isFramed = $derived(!isFullViewport(viewport, timeline));

  const rulerMarks = $derived(
    rulerBarMarks(timeline, $analysisBeatGrid, bpm).filter(
      (mark) => mark.timeSeconds >= viewport.startSeconds && mark.timeSeconds <= viewport.endSeconds,
    ),
  );
  const rulerTicks = $derived(
    rulerBarTicks(timeline, $analysisBeatGrid, bpm).filter(
      (tick) => tick >= viewport.startSeconds && tick <= viewport.endSeconds,
    ),
  );
  const beatGridTicks = $derived(rulerBeatTicks(viewport, $analysisBeatGrid, bpm));

  $effect(() => {
    const duration = timeline.durationSeconds;
    if (duration <= 1e-3) return;
    if (viewEndS != null && viewEndS > duration) viewEndS = duration;
    if (viewEndS != null && viewStartS >= duration - 1e-3) {
      viewStartS = 0;
      viewEndS = null;
    }
  });

  /** Keep the playhead in frame while zoomed during playback only. */
  $effect(() => {
    if (!isFramed || viewEndS == null || !$transportDisplay.playing) return;
    const next = followPlayheadViewport(viewport, timeline, $transportDisplay.time);
    if (!next) return;
    viewStartS = next.startSeconds;
    viewEndS = next.endSeconds;
  });

  $effect(() => {
    if (openSectionKindIndex === null) return;
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.arr-section-kind') || target?.closest('.arr-kind-menu-portal')) return;
      openSectionKindIndex = null;
      kindMenuRect = null;
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  });

  function sectionKindLabel(section: (typeof $arrangement)[number]) {
    const kind = sectionKindOf(section);
    return SECTION_KIND_OPTIONS.find((option) => option.value === kind)?.label ?? 'Section';
  }

  function openSectionKindMenu(index: number, anchor: HTMLElement, event?: Event) {
    event?.stopPropagation();
    const rect = anchor.getBoundingClientRect();
    kindMenuRect = { top: rect.bottom + 3, left: rect.left, width: Math.max(rect.width, 72) };
    openSectionKindIndex = index;
    void tick().then(() => {
      if (openSectionKindIndex !== index) return;
      document.querySelector<HTMLButtonElement>('.arr-kind-option[aria-selected="true"]')?.focus();
    });
  }

  function toggleSectionKindMenu(index: number, anchor: HTMLElement, event?: Event) {
    event?.stopPropagation();
    if (openSectionKindIndex === index) {
      openSectionKindIndex = null;
      kindMenuRect = null;
      return;
    }
    openSectionKindMenu(index, anchor, event);
  }

  function pickSectionKind(index: number, kind: SectionKind, event?: Event) {
    event?.stopPropagation();
    updateSectionKind(index, kind);
    openSectionKindIndex = null;
    kindMenuRect = null;
  }

  function zoomAnchorSeconds() {
    if ($transportDisplay.playing) return $transportDisplay.time;
    return (viewport.startSeconds + viewport.endSeconds) / 2;
  }

  function onTimelineWheel(event: WheelEvent) {
    event.preventDefault();
    if (event.deltaY < 0) zoomIn();
    else zoomOut();
  }

  function viewPct(seconds: number) {
    return viewTimePercent(seconds, viewport);
  }

  function timePct(seconds: number) {
    return viewPct(seconds);
  }

  function resetViewport() {
    viewStartS = 0;
    viewEndS = null;
  }

  function zoomIn() {
    const next = zoomViewportAround(viewport, timeline, 1.35, zoomAnchorSeconds());
    viewStartS = next.startSeconds;
    viewEndS = next.endSeconds;
  }

  function zoomOut() {
    const next = zoomViewportAround(viewport, timeline, 1 / 1.35, zoomAnchorSeconds());
    if (isFullViewport(next, timeline)) {
      resetViewport();
      return;
    }
    viewStartS = next.startSeconds;
    viewEndS = next.endSeconds;
  }

  function frameSelection() {
    if ($selectedArrangementSections.size === 0) return;
    const bands = sectionBands.filter((_, i) => $selectedArrangementSections.has(i));
    if (bands.length === 0) return;
    const start = Math.min(...bands.map((b) => b.startSeconds));
    const end = Math.max(...bands.map((b) => b.endSeconds));
    const framed = frameViewportFromSeconds(start, end, timeline);
    viewStartS = framed.startSeconds;
    viewEndS = framed.endSeconds;
  }

  function toggleLoopSelection() {
    if ($arrangementLoopRegion) {
      arrangementLoopRegion.set(null);
      return;
    }
    if ($selectedArrangementSections.size > 0) {
      const bands = sectionBands.filter((_, i) => $selectedArrangementSections.has(i));
      if (bands.length === 0) return;
      arrangementLoopRegion.set({
        startSeconds: Math.min(...bands.map((b) => b.startSeconds)),
        endSeconds: Math.max(...bands.map((b) => b.endSeconds)),
      });
      return;
    }
    arrangementLoopRegion.set({
      startSeconds: viewport.startSeconds,
      endSeconds: viewport.endSeconds,
    });
  }

  function handleSectionClick(i: number, event: MouseEvent, band: { startSeconds: number }) {
    if ((event.target as HTMLElement).closest('.arr-section-edit')) return;
    event.stopPropagation();
    if (event.shiftKey) {
      const next = new Set($selectedArrangementSections);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      $selectedArrangementSections = next;
      return;
    }
    $selectedArrangementSections = new Set([i]);
    selectSection(i,$playbackWorkspace!=='timing');
    audioEngine.seek(band.startSeconds);
  }

  /** Absolute sixteenth on the beat grid — used for cut placement. */
  const playStep = $derived(
    secondsStep($transportDisplay.time, $analysisBeatGrid, $transportDisplay.bpm || 120),
  );

  function seekAt(event: MouseEvent) {
    const track = event.currentTarget as HTMLElement;
    const rect = track.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audioEngine.seek(viewSecondsFromFraction(fraction, viewport));
  }

  function seekAtKeyboard(event: KeyboardEvent) {
    if (event.target !== event.currentTarget) return;
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
   * Thin a tick list down to what a lane can actually draw.
   *
   * Drums is 918 onsets; at a few hundred pixels of lane that is more marks than
   * pixels, and the browser pays for every one of them. Bucketing by column
   * keeps the shape — where the part is busy and where it drops out — which is
   * the only thing this lane is claiming to show.
   */
  const TICK_BUCKETS = 720;
  function bucketTicks(times: readonly number[]): number[] {
    const span = viewport.endSeconds - viewport.startSeconds;
    if (span <= 0) return [];
    const seen = new Uint8Array(TICK_BUCKETS);
    for (const t of times) {
      if (!Number.isFinite(t) || t < viewport.startSeconds || t > viewport.endSeconds) continue;
      seen[Math.min(TICK_BUCKETS - 1, Math.floor(((t - viewport.startSeconds) / span) * TICK_BUCKETS))] = 1;
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
      ? timePct($transportDisplay.analysisDuration)
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

  const playheadSeconds = $derived($transportDisplay.time);

  /** PGM occupancy clips — open ends extend to the playhead while REC is on. */
  const clipsBySlot = $derived.by(() => {
    const lanes: Array<Array<{ id: string; start: number; end: number }>> = Array.from(
      { length: slotCount },
      () => [],
    );
    for (const clip of $arrangementClips) {
      if (clip.slotIndex < 0 || clip.slotIndex >= slotCount) continue;
      const end =
        clip.endSeconds ??
        ($arrangementRecording ? playheadSeconds : clip.startSeconds);
      lanes[clip.slotIndex].push({
        id: clip.id,
        start: clip.startSeconds,
        end: Math.max(clip.startSeconds, end),
      });
    }
    return lanes;
  });

  const triggersBySlot = $derived.by(() => {
    const lanes: Array<Array<{ id: string; seconds: number }>> = Array.from(
      { length: slotCount },
      () => [],
    );
    for (const mark of $arrangementTriggers) {
      if (mark.slotIndex < 0 || mark.slotIndex >= slotCount) continue;
      lanes[mark.slotIndex].push({ id: mark.id, seconds: mark.seconds });
    }
    return lanes;
  });

  const showRecordedLanes = $derived(
    $arrangementRecording || $arrangementClips.length > 0 || $arrangementTriggers.length > 0,
  );

  let draggingTriggerId: string | null = $state(null);
  let draggingTrack: HTMLElement | null = $state(null);

  function secondsFromTrack(clientX: number, track: HTMLElement) {
    const rect = track.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return viewSecondsFromFraction(fraction, viewport);
  }

  function startTriggerDrag(event: PointerEvent, markId: string) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    draggingTriggerId = markId;
    draggingTrack = (event.currentTarget as HTMLElement).closest('.arr-track') as HTMLElement;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveTriggerDrag(event: PointerEvent) {
    if (!draggingTriggerId || !draggingTrack) return;
    moveTriggerMark(draggingTriggerId, secondsFromTrack(event.clientX, draggingTrack));
  }

  function endTriggerDrag() {
    draggingTriggerId = null;
    draggingTrack = null;
  }

  // ---- section editing (V1S-66) ----

  /** The one section the edit bar acts on: a single selection, else none. */
  const editIndex = $derived(
    $selectedArrangementSections.size === 1 ? [...$selectedArrangementSections][0]! : null,
  );
  const editSection = $derived(editIndex != null ? $arrangement[editIndex] : undefined);
  let renamingIndex = $state<number | null>(null);
  let renameDraft = $state('');

  function editContext(): SectionEditContext {
    return { bounds: sectionBounds, beatGrid: $analysisBeatGrid, bpm };
  }

  /** Apply an edit and keep the selection on the section it produced. */
  function applySectionEdit(next: typeof $arrangement | null, selectIndex: number) {
    if (!next) return;
    arrangement.set(next);
    const index = Math.max(0, Math.min(next.length - 1, selectIndex));
    $selectedArrangementSections = new Set([index]);
    activeSectionIndex.set(Math.min($activeSectionIndex, next.length - 1));
  }

  /** At the playhead when it is inside the section, else at its middle bar. */
  function splitSelected() {
    if (editIndex == null) return;
    const band = sectionBounds[editIndex]!;
    const at =
      playheadSeconds > band.startSeconds && playheadSeconds < band.endSeconds
        ? playheadSeconds
        : (band.startSeconds + band.endSeconds) / 2;
    applySectionEdit(splitSection($arrangement, editIndex, at, editContext()), editIndex);
  }

  function mergeSelected() {
    if (editIndex == null) return;
    applySectionEdit(mergeWithNext($arrangement, editIndex, editContext()), editIndex);
  }

  function deleteSelected() {
    if (editIndex == null) return;
    applySectionEdit(deleteSection($arrangement, editIndex, editContext()), editIndex - 1);
  }

  function startRename(index: number) {
    renamingIndex = index;
    renameDraft = $arrangement[index]?.customName ?? $arrangement[index]?.name ?? '';
    void tick().then(() => document.querySelector<HTMLInputElement>('.arr-rename-input')?.select());
  }

  function finishRename(commit: boolean) {
    if (renamingIndex == null) return;
    const index = renamingIndex;
    renamingIndex = null;
    if (commit) arrangement.set(renameSection($arrangement, index, renameDraft));
  }

  /** Dragging the boundary at the start of section `index`. */
  let draggingBoundary = $state<{ index: number; track: HTMLElement } | null>(null);

  function startBoundaryDrag(event: PointerEvent, index: number) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const track = (event.currentTarget as HTMLElement).closest('.arr-track') as HTMLElement;
    draggingBoundary = { index, track };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveBoundaryDrag(event: PointerEvent) {
    if (!draggingBoundary) return;
    const seconds = secondsFromTrack(event.clientX, draggingBoundary.track);
    const next = moveBoundary($arrangement, draggingBoundary.index, seconds, editContext());
    if (next) arrangement.set(next);
  }

  function nudgeBoundary(index: number, bars: number) {
    const band = sectionBounds[index];
    if (!band) return;
    const barSeconds = (240 / bpm) * bars;
    const next = moveBoundary($arrangement, index, band.startSeconds + barSeconds, editContext());
    if (next) arrangement.set(next);
  }

  function onWindowPointerMove(event: PointerEvent) {
    moveTriggerDrag(event);
    moveBoundaryDrag(event);
  }

  function onWindowPointerUp() {
    endTriggerDrag();
    draggingBoundary = null;
  }

  function commitRecordedTriggers() {
    commitTriggerMarksToCuts(
      'all',
      totalSteps,
      $analysisBeatGrid,
      $transportDisplay.bpm || 120,
    );
  }

  /** Section spans on the full song timeline — wall-clock seconds from file start. */
  const sectionBands = $derived(
    sectionBounds.map((band) => ({
      ...band,
      leftPct: timePct(band.startSeconds),
      widthPct: Math.max(0, timePct(band.endSeconds) - timePct(band.startSeconds)),
    })),
  );

  /** Click anywhere on a lane to place a cut on the nearest sixteenth. */
  function paintAt(event: MouseEvent, slotIndex: number) {
    const track = event.currentTarget as HTMLElement;
    const rect = track.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const seconds = viewSecondsFromFraction(fraction, viewport);
    const step = secondsToCutStep(
      seconds,
      $analysisBeatGrid,
      $transportDisplay.bpm || 120,
      totalSteps,
    );
    toggleCut(step, slotIndex);
  }
</script>

{#snippet beatGridOverlay()}
  {#if showBeatGrid}
    {#each beatGridTicks as tick (tick)}
      <span class="arr-beat-grid" style="left:{viewPct(tick)}%"></span>
    {/each}
  {/if}
{/snippet}

{#snippet loopRegionOverlay()}
  {#if $arrangementLoopRegion}
    <span
      class="arr-loop-region"
      style="left:{viewPct($arrangementLoopRegion.startSeconds)}%;width:{Math.max(0, viewPct($arrangementLoopRegion.endSeconds) - viewPct($arrangementLoopRegion.startSeconds))}%"
    ></span>
  {/if}
{/snippet}

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

<svelte:window
  onpointermove={onWindowPointerMove}
  onpointerup={onWindowPointerUp}
  onpointercancel={onWindowPointerUp}
/>

<section class="arrange">
  <header class="arr-head">
    <span class="arr-title">ARRANGEMENT</span>
    <span class="arr-sub">{totalBars} BARS · {$cuts.length} CUTS{#if showRecordedLanes} · {$arrangementClips.length} CLIPS{/if}</span>
    <button
      type="button"
      class="arr-btn"
      onclick={() => viewMode.set('perform')}
      title="Back to the rack and the program monitor"
    >PERFORM</button>

    <span class="arr-zoom" role="group" aria-label="Timeline zoom">
      <button type="button" class="arr-btn" onclick={zoomOut} disabled={!isFramed} aria-label="Zoom out">−</button>
      <span title="Scroll wheel on the timeline also zooms">{zoomFactor.toFixed(1)}×</span>
      <button type="button" class="arr-btn" onclick={zoomIn} disabled={zoomFactor >= 64} aria-label="Zoom in">+</button>
    </span>

    <button
      type="button"
      class="arr-btn"
      disabled={$selectedArrangementSections.size === 0}
      onclick={frameSelection}
      title="Zoom the timeline to the selected sections (Shift+click to multi-select)"
    >FRAME</button>
    <button
      type="button"
      class="arr-btn"
      disabled={!isFramed}
      onclick={resetViewport}
      title="Show the full song"
    >FIT ALL</button>
    <button
      type="button"
      class="arr-btn"
      data-active={$arrangementLoopRegion != null}
      onclick={toggleLoopSelection}
      title="Loop the selected sections, or the visible range if none selected"
    >{$arrangementLoopRegion ? 'LOOP ON' : 'LOOP'}</button>
    <button
      type="button"
      class="arr-btn"
      data-active={showBeatGrid}
      onclick={() => (showBeatGrid = !showBeatGrid)}
      title="Toggle beat grid lines"
    >GRID</button>

    <span class="arr-mode" role="radiogroup" aria-label="Arrangement transport mode">
      <button
        type="button"
        class="arr-btn"
        role="radio"
        aria-checked={$arrangementMode === 'live'}
        data-active={$arrangementMode === 'live'}
        onclick={() => setArrangementMode('live', playheadSeconds)}
        title="LIVE — cut by hand; the arrangement drives nothing and nothing is recorded (Ableton Session)"
      >LIVE</button>
      <button
        type="button"
        class="arr-btn"
        role="radio"
        aria-checked={$arrangementMode === 'play'}
        data-active={$arrangementMode === 'play'}
        onclick={() => setArrangementMode('play', playheadSeconds)}
        title="PLAY — the timeline's cuts drive PGM; a manual cut takes over until BACK TO ARRANGEMENT"
      >PLAY</button>
      <button
        type="button"
        class="arr-btn arr-btn-rec"
        role="radio"
        aria-checked={$arrangementMode === 'rec'}
        data-active={$arrangementMode === 'rec'}
        onclick={() => setArrangementMode('rec', playheadSeconds)}
        title="REC — your cuts are written into the timeline as it plays (Ableton Arrangement Record)"
      >{$arrangementMode === 'rec' ? 'REC ●' : 'REC'}</button>
    </span>
    <button
      type="button"
      class="arr-btn"
      data-active={$recordOverdub}
      onclick={() => recordOverdub.update((v) => !v)}
      title={$recordOverdub
        ? 'Overdub: REC keeps existing cuts playing and adds yours'
        : 'Replace: REC clears cuts under the playhead (click for overdub)'}
    >OVERDUB</button>
    {#if $arrangementOverridden}
      <button
        type="button"
        class="arr-btn arr-btn-back"
        onclick={backToArrangement}
        title="You took over with a manual cut — hand PGM back to the timeline"
      >BACK TO ARRANGEMENT</button>
    {/if}
    <button
      type="button"
      class="arr-btn"
      disabled={$arrangementTriggers.length === 0}
      onclick={commitRecordedTriggers}
      title="Quantize recorded trigger marks onto the cut grid"
    >COMMIT TRIGGERS</button>
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
      data-active={$autoClips}
      onclick={() => autoClips.update((v) => !v)}
      title="Entering a section reloads the clips captured for it"
    >AUTO-CLIPS</button>
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

  {#if editSection && editIndex != null}
    <div class="arr-secbar" style="--sec-hue:{editSection.hue}" role="toolbar" aria-label="Edit {editSection.name}">
      <span class="arr-secbar-name">{editSection.name}</span>
      <span class="arr-secbar-meta">{editSection.bars} BARS</span>
      <button type="button" class="arr-btn" onclick={() => startRename(editIndex)} title="Give this section its own label (or double-click it)">RENAME</button>
      <button type="button" class="arr-btn" disabled={editSection.bars < 2} onclick={splitSelected} title="Split at the playhead (or the middle bar if the playhead is elsewhere)">SPLIT</button>
      <button type="button" class="arr-btn" disabled={editIndex >= $arrangement.length - 1} onclick={mergeSelected} title="Merge with the next section">MERGE →</button>
      <button type="button" class="arr-btn" disabled={$arrangement.length <= 1} onclick={deleteSelected} title="Remove this section; its bars go to the one before it">DELETE</button>
      <span class="arr-secbar-sep" aria-hidden="true"></span>
      <button
        type="button"
        class="arr-btn"
        data-active={!!editSection.scene}
        onclick={() => captureSectionScene(editIndex)}
        title="Save the clips loaded in the rack right now as this section's clip set"
      >{editSection.scene ? 'RECAPTURE CLIPS' : 'CAPTURE CLIPS'}</button>
      {#if editSection.scene}
        <button type="button" class="arr-btn" onclick={() => clearSectionScene(editIndex)} title="Forget this section's clip set">CLEAR CLIPS</button>
      {/if}
      <span class="arr-secbar-hint">Drag a section edge to move it · snaps to bars</span>
    </div>
  {/if}

  <div class="arr-scroll" onwheel={onTimelineWheel}>
   <div class="arr-canvas" style="width:{isFramed ? Math.min(zoomFactor * 100, 6400) : 100}%">
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
          {@const picked = $selectedArrangementSections.has(i)}
          <div
            class="arr-section arr-section-abs"
            data-active={on}
            data-selected={picked}
            style="left:{band.leftPct}%;width:{band.widthPct}%;--sec-hue:{section.hue};{on
              ? `background:${section.hue}1c;box-shadow:inset 0 0 0 1px ${section.hue}77`
              : ''}"
            title="{section.name} — {section.bars} bars, from bar {band.startBar}. Shift+click to multi-select."
          >
            <button
              type="button"
              class="arr-section-select"
              aria-label="Select {section.name} section"
              aria-pressed={picked}
              onclick={(event) => handleSectionClick(i, event, band)}
              ondblclick={(event) => {
                event.stopPropagation();
                startRename(i);
              }}
            ></button>
            {#if renamingIndex === i}
              <input
                class="arr-section-edit arr-rename-input"
                bind:value={renameDraft}
                maxlength="24"
                aria-label="Section name"
                placeholder="Empty restores the part name"
                onclick={(event) => event.stopPropagation()}
                onkeydown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter') finishRename(true);
                  else if (event.key === 'Escape') finishRename(false);
                }}
                onblur={() => finishRename(true)}
              />
            {/if}
            <label
              class="arr-section-edit arr-section-color-wrap"
              style="--sec-hue:{section.hue}"
              title="Section color"
            >
              <span class="arr-section-tick" style="background:{section.hue}"></span>
              <input
                type="color"
                class="arr-section-color"
                value={section.hue}
                aria-label="{section.name} color"
                onclick={(event) => event.stopPropagation()}
                oninput={(event) => {
                  event.stopPropagation();
                  updateSectionHue(i, event.currentTarget.value);
                }}
              />
            </label>
            <span
              class="arr-section-edit arr-section-kind"
            >
              <button
                type="button"
                class="arr-kind-trigger"
                style="--sec-hue:{section.hue}"
                aria-haspopup="listbox"
                aria-expanded={openSectionKindIndex === i}
                aria-label="{section.name} part type"
                onclick={(event) => toggleSectionKindMenu(i, event.currentTarget as HTMLElement, event)}
                onkeydown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleSectionKindMenu(i, event.currentTarget as HTMLElement, event);
                  }
                }}
              >
                <span class="arr-kind-label">{sectionKindLabel(section)}</span>
                <span class="arr-kind-chevron" aria-hidden="true">▾</span>
              </button>
            </span>
            {#if section.customName}
              <span class="arr-section-custom" title="Custom name — double-click to change">{section.customName}</span>
            {/if}
            {#if section.scene}
              <span class="arr-section-scene" title="Has a captured clip set">CLIPS</span>
            {/if}
            <span class="arr-section-bars">{section.bars}b</span>
          </div>
        {/each}
        {#each sectionBands as band, i (band.id)}
          {#if i > 0}
            <span
              class="arr-boundary"
              class:is-dragging={draggingBoundary?.index === i}
              style="left:{band.leftPct}%;--sec-hue:{band.hue}"
              role="slider"
              aria-valuemin={1}
              aria-valuemax={Math.max(1, totalBars)}
              aria-label="Boundary before {band.name}"
              aria-valuenow={band.startBar}
              tabindex="0"
              title="Drag to move this boundary (snaps to bars); arrow keys nudge by a bar"
              onpointerdown={(event) => startBoundaryDrag(event, i)}
              onclick={(event) => event.stopPropagation()}
              onkeydown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                event.stopPropagation();
                nudgeBoundary(i, event.key === 'ArrowLeft' ? -1 : 1);
              }}
            ></span>
          {/if}
        {/each}
      </div>
    </div>

    <!-- Bar ruler. Every 4 bars gets a number; the rest are hairlines. -->
    <div class="arr-row arr-row-ruler">
      <span class="arr-gutter"></span>
      <div class="arr-track arr-ruler" role="button" tabindex="0" onclick={seekAt} onkeydown={seekAtKeyboard} title="Click to seek; Enter or Space seeks to the playhead">
        {@render beatGridOverlay()}
        {#each rulerTicks as tick (tick)}
          <span class="arr-bar-tick" style="left:{timePct(tick)}%"></span>
        {/each}
        {#each rulerMarks as mark (mark.label)}
          <span class="arr-bar" style="left:{timePct(mark.timeSeconds)}%">{mark.label}</span>
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
          {@render loopRegionOverlay()}
          {@render beatGridOverlay()}
          {#if showRecordedLanes}
            {#each clipsBySlot[slotIndex] ?? [] as clip (clip.id)}
              <span
                class="arr-clip"
                style="left:{timePct(clip.start)}%;width:{Math.max(0.4, timePct(clip.end) - timePct(clip.start))}%;--clip-color:{info?.color ?? '#5f7378'}"
              ></span>
            {/each}
            {#each triggersBySlot[slotIndex] ?? [] as mark (mark.id)}
              <span
                class="arr-trigger"
                role="button"
                tabindex="0"
                style="left:{timePct(mark.seconds)}%;--trigger-color:{info?.color ?? '#5f7378'}"
                title="Drag to move; double-click to delete"
                onpointerdown={(event) => startTriggerDrag(event, mark.id)}
                ondblclick={(event) => {
                  event.stopPropagation();
                  deleteTriggerMark(mark.id);
                }}
              ></span>
            {/each}
          {/if}
          {#each cutsBySlot[slotIndex] ?? [] as cut (cut.step)}
            <span
              class="arr-cut"
              style="left:{timePct(stepSeconds(cut.step, $analysisBeatGrid, bpm))}%;background:{info?.color ?? '#5f7378'}"
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
        {@render loopRegionOverlay()}
        {@render beatGridOverlay()}
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
          {@render loopRegionOverlay()}
          {@render beatGridOverlay()}
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
          {@render loopRegionOverlay()}
          {@render beatGridOverlay()}
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

    <!-- One playhead for the whole view, over every lane at once. -->
    <span class="arr-playhead" style="left:calc(var(--arr-gutter-w) + 6px + {timePct($transportDisplay.time) / 100} * (100% - var(--arr-gutter-w) - 6px))"></span>
   </div>
  </div>

  {#if openSectionKindIndex !== null && kindMenuRect}
    {@const menuSection = $arrangement[openSectionKindIndex]}
    <div
      class="arr-kind-menu-portal"
      role="listbox"
      tabindex="-1"
      aria-label="{menuSection?.name ?? 'Section'} part type"
      style="top:{kindMenuRect.top}px;left:{kindMenuRect.left}px;min-width:{kindMenuRect.width}px;--sec-hue:{menuSection?.hue ?? '#7d9196'}"
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => {
        event.stopPropagation();
        const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'));
        const current = options.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          options[(current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          const index = openSectionKindIndex;
          openSectionKindIndex = null;
          kindMenuRect = null;
          if (index !== null) document.querySelectorAll<HTMLButtonElement>('.arr-kind-trigger')[index]?.focus();
        }
      }}
    >
      {#each SECTION_KIND_OPTIONS as option (option.value)}
        <button
          type="button"
          class="arr-kind-option"
          class:is-active={menuSection && sectionKindOf(menuSection) === option.value}
          role="option"
          aria-selected={menuSection && sectionKindOf(menuSection) === option.value}
          onclick={(event) => pickSectionKind(openSectionKindIndex!, option.value, event)}
        >
          <span class="arr-kind-swatch" style="background:{SECTION_KIND_HUE[option.value]}"></span>
          <span class="arr-kind-option-label">{option.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .arr-gutter-chan small {
    display: block;
    font-size: 5.5px;
    color: #52606d;
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
    min-height: 30px;
    padding: 4px 10px;
    border-bottom: 1px solid #141618;
    background: linear-gradient(180deg, #101214, #0c0d0f);
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
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
  .arr-btn-rec[data-active='true'] {
    border-color: #ff4d6d88;
    background: #ff4d6d18;
    color: #ff8fa3;
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
    position: relative;
    z-index: 4;
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
    overflow: visible;
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
    border-radius: 2px;
    background: transparent;
    text-align: left;
    box-sizing: border-box;
    overflow: hidden;
  }
  .arr-section[data-active='true'] {
    border-color: color-mix(in srgb, var(--sec-hue, #14b8a6) 45%, #1a1c1e);
  }
  .arr-section-select {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: inherit;
    background: transparent;
  }
  .arr-section-bars { pointer-events: none; }

  .arr-section-custom,
  .arr-section-scene {
    pointer-events: none;
    font-family: var(--font-ui);
    font-size: 7px;
    letter-spacing: 0.1em;
    white-space: nowrap;
  }
  .arr-section-custom {
    color: #e6f1f2;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .arr-section-scene {
    padding: 0 3px;
    border: 1px solid color-mix(in srgb, var(--sec-hue) 60%, transparent);
    border-radius: 2px;
    color: color-mix(in srgb, var(--sec-hue) 75%, #ffffff);
  }

  .arr-rename-input {
    position: absolute;
    inset: 3px 4px;
    z-index: 4;
    min-width: 0;
    padding: 0 4px;
    border: 1px solid var(--sec-hue, #14b8a6);
    border-radius: 2px;
    background: #0c0d0f;
    color: #e6f1f2;
    font-family: var(--font-ui);
    font-size: 8px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    outline: none;
  }

  /* Drag target sits on the seam between two sections; wider than it looks so
     it can be grabbed without pixel hunting. */
  .arr-boundary {
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 9px;
    margin-left: -4.5px;
    z-index: 3;
    cursor: ew-resize;
    touch-action: none;
  }
  .arr-boundary::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 3.5px;
    width: 2px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--sec-hue) 72%, #ffffff);
    opacity: 0;
    transition: opacity 120ms;
  }
  .arr-boundary:hover::after,
  .arr-boundary.is-dragging::after {
    opacity: 1;
  }

  .arr-secbar {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    min-height: 26px;
    padding: 3px 10px;
    border-bottom: 1px solid #141618;
    background: color-mix(in srgb, var(--sec-hue) 6%, #0c0d0f);
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .arr-secbar-name {
    color: color-mix(in srgb, var(--sec-hue) 70%, #ffffff);
    font-family: var(--font-ui);
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.14em;
    white-space: nowrap;
  }
  .arr-secbar-meta,
  .arr-secbar-hint {
    color: #4b5d63;
    font-family: var(--font-ui);
    font-size: 7px;
    letter-spacing: 0.1em;
    white-space: nowrap;
  }
  .arr-secbar-hint {
    margin-left: auto;
  }
  .arr-secbar-sep {
    width: 1px;
    height: 14px;
    background: #1e2226;
  }

  .arr-mode {
    display: flex;
    gap: 1px;
  }
  /* Lit like Ableton's Back to Arrangement: something is overriding the timeline. */
  .arr-btn-back {
    border-color: #ff9f4388;
    background: #ff9f431c;
    color: #ffb46b;
  }
  .arr-section[data-selected='true'] {
    box-shadow: inset 0 0 0 1px rgba(184, 212, 220, 0.55);
  }
  .arr-section-abs {
    position: absolute;
    top: 0;
    bottom: 0;
    min-width: 52px;
    overflow: visible;
    z-index: 2;
    border: 1px solid color-mix(in srgb, var(--sec-hue, #14b8a6) 22%, rgba(255, 255, 255, 0.14));
    background: color-mix(in srgb, var(--sec-hue, #14b8a6) 14%, rgba(255, 255, 255, 0.05));
    backdrop-filter: blur(14px) saturate(1.15);
    -webkit-backdrop-filter: blur(14px) saturate(1.15);
  }
  .arr-section:hover {
    background: color-mix(in srgb, var(--sec-hue, #14b8a6) 18%, rgba(255, 255, 255, 0.08));
  }
  .arr-section-tick {
    width: 7px;
    height: 7px;
    flex-shrink: 0;
    border-radius: 1px;
    pointer-events: none;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--sec-hue, #14b8a6) 55%, transparent);
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
    position: relative;
    flex: 1;
    min-width: 44px;
    display: flex;
  }
  .arr-kind-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 3px;
    width: 100%;
    min-width: 0;
    padding: 0 1px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: color-mix(in srgb, var(--sec-hue, #cfe0e2) 82%, #ffffff);
    font-family: var(--font-ui);
    font-size: 7px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-align: left;
    cursor: pointer;
    box-shadow: none;
  }
  .arr-kind-trigger:hover,
  .arr-kind-trigger:focus-visible {
    color: var(--sec-hue, #cfe0e2);
    background: transparent;
    outline: none;
  }
  .arr-kind-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .arr-kind-chevron {
    flex-shrink: 0;
    opacity: 0.72;
    font-size: 8px;
    line-height: 1;
  }
  .arr-kind-menu-portal {
    position: fixed;
    z-index: 2000;
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--sec-hue, #7d9196) 42%, rgba(255, 255, 255, 0.12));
    border-radius: 3px;
    background: rgba(8, 10, 12, 0.94);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    overflow: hidden;
  }
  .arr-kind-option {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
    padding: 5px 7px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: #d5e0e6;
    font-family: var(--font-ui);
    font-size: 7px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-align: left;
    cursor: pointer;
  }
  .arr-kind-swatch {
    width: 7px;
    height: 7px;
    flex-shrink: 0;
    border-radius: 1px;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.14);
  }
  .arr-kind-option-label {
    flex: 1;
    min-width: 0;
  }
  .arr-kind-option:hover,
  .arr-kind-option:focus-visible {
    background: color-mix(in srgb, var(--sec-hue, #7d9196) 16%, transparent);
    color: color-mix(in srgb, var(--sec-hue, #e8f0f4) 75%, #ffffff);
    outline: none;
  }
  .arr-kind-option.is-active {
    background: color-mix(in srgb, var(--sec-hue, #7d9196) 32%, transparent);
    color: color-mix(in srgb, var(--sec-hue, #f6fcfd) 80%, #ffffff);
  }
  .arr-kind-option.is-active .arr-kind-swatch {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--sec-hue, #7d9196) 70%, #ffffff);
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
  .arr-bar-tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 0;
    border-left: 1px solid #1e2428;
    pointer-events: none;
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

  .arr-beat-grid {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 0;
    border-left: 1px solid rgba(255, 255, 255, 0.045);
    pointer-events: none;
    z-index: 1;
  }

  .arr-loop-region {
    position: absolute;
    top: 0;
    bottom: 0;
    pointer-events: none;
    border: 1px solid rgba(20, 184, 166, 0.32);
    background: rgba(20, 184, 166, 0.05);
    box-sizing: border-box;
    z-index: 0;
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
  .arr-clip {
    position: absolute;
    top: 3px;
    bottom: 3px;
    border-radius: 2px;
    z-index: 1;
    pointer-events: none;
    background: color-mix(in srgb, var(--clip-color) 42%, transparent);
    border: 1px solid color-mix(in srgb, var(--clip-color) 55%, transparent);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    background-image: repeating-linear-gradient(
      -45deg,
      color-mix(in srgb, var(--clip-color) 18%, transparent) 0 4px,
      transparent 4px 8px
    );
  }
  .arr-trigger {
    position: absolute;
    top: 1px;
    bottom: 1px;
    width: 8px;
    margin-left: -4px;
    z-index: 3;
    pointer-events: auto;
    cursor: grab;
    background: var(--trigger-color);
    opacity: 0.92;
    box-shadow: 0 0 4px color-mix(in srgb, var(--trigger-color) 70%, transparent);
  }
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
