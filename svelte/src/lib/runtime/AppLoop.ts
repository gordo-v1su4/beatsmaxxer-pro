import { resolveSectionBounds, sectionIndexAtSeconds } from '$lib/arrangement/sectionBounds';
import { cutStepAllowedInLoop } from '$lib/arrangement/sequencerLoopGate';
import { secondsToCutStep, stepSeconds } from '$lib/arrangement/timelineScale';
import { arrangementMode, arrangementOverridden, recordOverdub } from '$lib/arrangement/transportMode';
import { get } from 'svelte/store';
import { playbackWorkspace } from '$lib/stores/rackUi';
import { timingRuntime } from '$lib/runtime/timing/TimingRuntime';
import { audioEngine } from '$lib/audio';
import { webGpuEngine } from '$lib/rendering/webgpu/WebGpuEngine';
import { videoPool } from '$lib/media/VideoPool';
import { getVideoSourcePort } from '$lib/platform/videoSource';
import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
import {
  advanceSpeedRampSource,
  type SpeedRampSourceState
} from '$lib/runtime/speedramp';
import {
  currentRackAssignments,
  currentRackSlotForModule,
  rackSlotIndex,
  moduleParams,
  videoLayers,
  rackTop,
  rackBottom,
  midiLayers,
  bypassed
} from '$lib/stores/rack';
import { manualCutRequests, pgmSource, queuedPgmSource, selectPgmSource } from '$lib/stores/pgm';
import {
  crossedSequencerSteps,
  sequencerArmed,
  sequencerLastStep
} from '$lib/stores/sequencer';
import {
  ARRANGEMENT_STEPS,
  activeSectionIndex,
  sectionStarts,
  arrangement,
  arrangementLoopRegion,
  arrangementTotalSteps,
  enterSection,
  barInSection,
  cutAtStep,
  cuts,
  moduleForSlotIndex
} from '$lib/stores/arrangement';
import {
  analysisBeatGrid,
  beatAt,
  triggerMidiModule,
  triggerSource
} from '$lib/stores/triggerLane';
import {
  firingNotes,
  firingTimes,
  lastTriggerTime,
  moduleTriggerSource,
} from '$lib/stores/midiTrigger';
import { grooveSegment } from '$lib/runtime/groove';
import { feel as pgmFeel } from '$lib/stores/pgm';
import type { MidiLayer } from '$lib/stores/rack';
import { activeChannel } from '$lib/stores/midiChannels';
import { gpuUniformsForModule } from '$lib/modules/controlContracts';
import { supportsModuleMidi } from '$lib/modules/midiContracts';
import {
  advanceManualFire,
  mergeTriggerAge,
  type ManualFireState
} from '$lib/runtime/manualFire';
import {
  audioStutterTriggerAge,
  mergeStutterTriggerAge,
  stutterTriggerWindowBeats,
  advanceLiveOnsetStutter,
  type LiveOnsetStutterState
} from '$lib/runtime/stutterTrigger';
import { midiUiOpen } from '$lib/stores/rackUi';
import { recordFrame, startRenderBudget, stopRenderBudget } from '$lib/runtime/renderBudget';
import { tickArrangementRecorder } from '$lib/arrangement/recorder';
import { audioTimeline, type TimelineFrame } from '$lib/transport';

let running = false;
let rafId = 0;
let unsubscribeTimeline: (() => void) | null = null;
let unsubscribeTimeSamplerConfig: (() => void) | null = null;

const SYNC_MODULES = new Set(['timesampler', 'speedramp']);
const SPEEDRAMP_CYCLE_BEATS = [1, 2, 4, 8, 16, 24, 32] as const;
/**
 * Cache of DENSITY-filtered note times per module.
 *
 * firingTimes walks and sorts the whole part, which is thousands of notes on a
 * real drum track -- far too much to redo every frame. It only changes when the
 * loaded part or the DENSITY dial changes, so the cache is keyed on both and the
 * per-frame cost drops to one binary search.
 */
const midiFiringCache = new Map<string, { layer: MidiLayer | null; density: number; times: number[] }>();
const manualFireByModule = new Map<string, ManualFireState>();

function firingTimesFor(moduleId: string, layer: MidiLayer | null, density: number): number[] {
  const hit = midiFiringCache.get(moduleId);
  if (hit && hit.layer === layer && hit.density === density) return hit.times;
  const times = firingTimes(layer, density);
  midiFiringCache.set(moduleId, { layer, density, times });
  return times;
}

export function midiNotesForTriggerSource(
  source: 'audio' | 'midi',
  layer: MidiLayer | null,
  density: number
) {
  if (source !== 'midi' || !layer) return null;
  return firingNotes(layer, density).map(({ note }) => note);
}

/**
 * How far into its last MIDI note each module is, in beats.
 *
 * Returns -1 for anything following the transport, which the shader reads as
 * "use the beat grid" -- so a module that is not MIDI-driven costs one map
 * lookup and nothing on the GPU.
 */
function midiTriggerAges(frame: TimelineFrame): Record<string, number> {
  if (!get(midiUiOpen)) return {};
  const sources = get(moduleTriggerSource);
  const ages: Record<string, number> = {};
  const ids = Object.keys(sources);
  if (ids.length === 0) return ages;
  const layers = get(midiLayers);
  const params = get(moduleParams);
  for (const id of ids) {
    if (sources[id] !== 'midi' || !supportsModuleMidi(id)) continue;
    const layer = layers[id];
    if (!layer) continue;
    const density = (params[id]?.density ?? 100) / 100;
    const times = firingTimesFor(id, layer, density);
    const triggerTime = lastTriggerTime(times, frame.positionSeconds);
    if (triggerTime === null) {
      ages[id] = -1;
      continue;
    }
    // Source time already advances at playbackRate. Using display BPM here as
    // well would apply tempo twice (2x playback became a 4x MIDI envelope).
    // Compare positions on the same hosted/fallback beat grid instead.
    const sourceBpm = frame.bpm / Math.max(0.01, frame.playbackRate);
    ages[id] = Math.max(
      0,
      frame.beatPosition - beatAt(triggerTime, get(analysisBeatGrid), sourceBpm)
    );
  }
  return ages;
}

/**
 * Low-end onset envelope, rebuilt every frame and forwarded to every module.
 *
 * bassAmp is a smoothed level: it reports how loud the low end is, which is a
 * different question from whether a hit just landed. Scaling an effect by it
 * makes the effect breathe with the mix but never strike with it, and that is
 * the whole reason audio-driven modules read as deaf.
 *
 * Positive flux only -- a kick is a RISE in low-end energy, and the fall
 * afterwards carries no event. Attack is instant so the leak lands on the
 * transient rather than after it; the 0.86 decay puts the tail at roughly a
 * tenth of a second at 60fps, short enough to resolve sixteenths at club tempo.
 */
let bassOnset = 0;
let bassPeak = 0.02;
let lastBassNorm = 0;
let bassNorm = 0;

/**
 * Measured on this engine with a real track: amplitude and bassAmp sit between
 * roughly 0.02 and 0.13, NOT 0 to 1. Anything downstream that treats them as a
 * normalised signal is quietly multiplying by about a tenth, which is the real
 * reason audio-driven effects look deaf even with music playing.
 *
 * A fixed gain would just be tuned to one track, so the level is normalised
 * against a slowly decaying running peak: loud and quiet material both end up
 * using the full range, and the peak recovers over a few seconds when a track
 * drops in level rather than latching on one transient forever.
 */
function updateBassOnset(bassAmp: number) {
  bassPeak = Math.max(bassPeak * 0.9995, bassAmp, 0.01);
  bassNorm = Math.min(1, bassAmp / bassPeak);
  const rise = Math.max(0, bassNorm - lastBassNorm);
  lastBassNorm = bassNorm;
  // Gain measured, not guessed: normalised bass sits between about 0.72 and 1.0
  // on real material, so a kick is a rise of roughly 0.1 and the old x3.2 put
  // onset peaks at 0.32. Anything downstream expecting 0..1 was then working
  // with a third of a signal. x10 puts a real transient at full scale.
  bassOnset = Math.max(bassOnset * 0.86, Math.min(1, rise * 10));
  return bassOnset;
}

/** Latest speedramp rate/phase, forwarded to the shader as aux1/aux2. */
let lastSpeedRampAux = { aux1: 1, aux2: 0 };
/** Authoritative TimeSampler accent event: aux1=pulse, aux2=LUM/RGB/OFF. */
let lastTimeSamplerAux = { aux1: 0, aux2: 2 };
/** Fixed-step SPEEDRAMP source mapping, reset on generation changes/remount. */
let speedRampSourceState: SpeedRampSourceState | null = null;
let sequencerGeneration = -1;
let lastQueuedPrewarmSlot: string | null = null;
let lastPgmPrepSlot: string | null = null;
let sequencerAbsoluteStep: number | null = null;
/** Section the playhead was last found in, by id — an index can outlive the
 * section it named once sections can be split, merged and deleted. */
let trackedSectionId: string | null = null;
/** Last `manualCutRequests` value seen; a bump is the performer picking PGM. */
let manualCutSerialSeen: number | null = null;
/** A hand pick is queued and hasn't landed on PGM yet. */
let manualCutPending = false;
/** Steps this REC take wrote; replace-record must not sweep them away. */
const takeSteps = new Set<number>();
/** PGM as of last frame, to see a pending hand pick land. */
let lastLandedPgm: string | null = null;

function resetArrangementTracking() {
  trackedSectionId = null;
  manualCutSerialSeen = null;
  manualCutPending = false;
  lastLandedPgm = null;
}

/** Cuts are placed against the song, so a step wraps on the arrangement's
 * length rather than on the bar — bar 34 is its own step, not a repeat of 2. */
function wrapSongStep(step: number, totalSteps: number) {
  return totalSteps > 0 ? ((step % totalSteps) + totalSteps) % totalSteps : step;
}
/** Rising-flux strike window for tapdelay when MIDI/analysis are quiet. */
let liveOnsetStutterState: LiveOnsetStutterState | null = null;

function syncVideoModes(assignments: Array<{ slotId: string; moduleId: string }>) {
  for (const { slotId, moduleId } of assignments) {
    if (SYNC_MODULES.has(moduleId)) videoPool.unmarkFreeRun(slotId);
    else videoPool.markFreeRun(slotId);
  }
}

function paramsForGpu(moduleId: string, params: Record<string, number>) {
  return gpuUniformsForModule(moduleId, params, {
    speedRamp: lastSpeedRampAux,
    timeSampler: lastTimeSamplerAux
  });
}

function fireTriggerAges(
  frame: TimelineFrame,
  params: Record<string, Record<string, number>>
): Record<string, number> {
  const ages: Record<string, number> = {};
  for (const [id, module] of Object.entries(params)) {
    if (module.trig == null) continue;
    const next = advanceManualFire(
      manualFireByModule.get(id) ?? null,
      module.trig,
      frame.beatPosition,
      module.duration ?? 40
    );
    manualFireByModule.set(id, next.state);
    if (next.age != null) ages[id] = next.age;
  }
  return ages;
}

function tapdelayTriggerAge(
  frame: TimelineFrame,
  params: Record<string, number>,
  midiAge: number | undefined,
  fireAge: number | undefined,
  onsetAmp: number
): { age: number; liveState: LiveOnsetStutterState | null } {
  const density = (params.density ?? 100) / 100;
  const analysisAge = audioStutterTriggerAge(
    frame,
    audioEngine.getAnalysisOnsets(),
    get(analysisBeatGrid),
    density
  );
  const window = stutterTriggerWindowBeats(params.time ?? 60, params.gate ?? 70);
  const live = advanceLiveOnsetStutter(
    liveOnsetStutterState,
    onsetAmp,
    frame.beatPosition,
    frame.playing,
    window
  );
  return {
    // Analysis/MIDI/FIRE only for now — live flux stays in onsetAmp for SENS scaling.
    age: mergeStutterTriggerAge(midiAge, fireAge, analysisAge, undefined),
    liveState: live.state
  };
}

export function timeSamplerAccentUniforms(
  frame: TimelineFrame,
  accent: { mode: number; transportSeconds: number } | null | undefined
) {
  if (!frame.playing || !accent) return { aux1: 0, aux2: 2 };
  // Both values must share the transport domain. The old subtraction compared
  // song position with the AudioContext presentation clock; depending on when
  // playback started or was sought, LUM/RGB could be permanently "future" or
  // already expired, which is the intermittent luminance report.
  const ageSeconds = frame.positionSeconds - accent.transportSeconds;
  const mode = Math.max(0, Math.min(2, Math.round(accent.mode)));
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > 0.5 || mode === 2) {
    return { aux1: 0, aux2: mode };
  }
  return { aux1: Math.exp(-ageSeconds * 12), aux2: mode };
}

/**
 * TimeSampler retains its last slice while stopped so playback can resume its
 * scheduler state. The video actuator must still follow the stopped transport
 * position, otherwise that retained slice overwrites STOP's zero seek.
 */
export function timeSamplerVideoTarget(
  frame: Pick<TimelineFrame, 'playing' | 'positionSeconds'>,
  sourceTimestampSeconds: number
) {
  return frame.playing ? sourceTimestampSeconds : frame.positionSeconds;
}

/**
 * Track which section the playhead is in — and, when auto-bank is on, rebuild
 * the rack from that section's bank on entry, so the chorus plays through
 * different effects than the verse.
 *
 * Looked up by song position, not counted in bars from the last transport
 * reset. Counting restarted at INTRO on every seek, so clicking into the chorus
 * recalled the intro's bank in the middle of the chorus.
 */
function runArrangement(frame: TimelineFrame) {
  const sections = get(arrangement);
  if (sections.length === 0) return;

  const bounds = resolveSectionBounds(sections, get(sectionStarts), get(analysisBeatGrid), frame.bpm);
  const index = sectionIndexAtSeconds(bounds, frame.positionSeconds);
  if (index < 0) return;
  const barSeconds = (frame.beatIntervalSeconds || 60 / (frame.bpm || 120)) * 4;
  barInSection.set(Math.max(0, Math.floor((frame.positionSeconds - bounds[index]!.startSeconds) / barSeconds)));

  const id = sections[index]!.id;
  if (id === trackedSectionId && index === get(activeSectionIndex)) return;
  trackedSectionId = id;
  activeSectionIndex.set(index);
  if (get(playbackWorkspace) !== 'timing') enterSection(sections[index]!);
}

function runSequencer(frame: TimelineFrame) {
  const generationChanged = frame.generation !== sequencerGeneration;
  const previous = generationChanged ? null : sequencerAbsoluteStep;
  const crossed = crossedSequencerSteps(previous, frame.beatPosition);
  sequencerGeneration = frame.generation;
  sequencerAbsoluteStep = crossed.currentAbsoluteStep;

  // Section tracking follows the playhead whether or not cuts are armed:
  // the strip highlight and auto-bank are about where the song is, not
  // about the sequencer.
  if (frame.playing) runArrangement(frame);

  // A hand cut is what the performer asked for (manualCutRequests), not any
  // PGM change: dropping an effect into a slot, the mobile shell and the
  // sequencer all move PGM too. Tracked every frame, armed or not.
  const serial = get(manualCutRequests);
  const manualRequested = manualCutSerialSeen !== null && serial !== manualCutSerialSeen;
  manualCutSerialSeen = serial;
  if (manualRequested) manualCutPending = true;
  const landedPgm = get(pgmSource);
  const pgmChanged = lastLandedPgm !== null && landedPgm !== lastLandedPgm;
  lastLandedPgm = landedPgm;
  // The pick lands when PGM actually changes (on the next bar while playing);
  // a pick cancelled before it landed clears the queue without a change.
  const manualLanded = manualCutPending && pgmChanged;
  if (manualLanded || (manualCutPending && !manualRequested && get(queuedPgmSource) === null)) {
    manualCutPending = false;
  }

  const mode = get(arrangementMode);
  // PLAY: a hand pick takes the program off the arrangement (Ableton's
  // Session-launch override) until BACK TO ARRANGEMENT — stopped or playing.
  if (mode === 'play' && manualRequested) arrangementOverridden.set(true);

  if (!frame.playing || !get(sequencerArmed)) {
    sequencerLastStep.set(crossed.currentAbsoluteStep % 16);
    return;
  }

  const sections = get(arrangement);
  if (sections.length === 0) return;

  const totalSteps = get(arrangementTotalSteps);
  const beatGrid = get(analysisBeatGrid);

  // REC: write each cut into the timeline where it landed. Replace-record
  // takes every PGM change, hand cuts and RAND's alike: the timeline is not
  // driving PGM during a replace take, so every change is the performance.
  // Overdub keeps to hand cuts, since there the timeline's own cuts move PGM.
  const replacing = mode === 'rec' && !get(recordOverdub);
  if (mode !== 'rec') takeSteps.clear();
  let writtenStep: number | null = null;
  const performed = manualLanded || (replacing && pgmChanged);
  if (mode === 'rec' && performed && totalSteps > 0) {
    const slot = currentRackSlotForModule(landedPgm);
    const slotIndex = slot ? rackSlotIndex(slot) : null;
    if (slotIndex != null) {
      writtenStep = secondsToCutStep(frame.positionSeconds, beatGrid, frame.bpm, totalSteps);
      const step = writtenStep;
      takeSteps.add(step);
      cuts.update((list) =>
        [...list.filter((c) => c.step !== step), { step, slotIndex }].sort((a, b) => a.step - b.step),
      );
    }
  }

  // Replace-record clears what the playhead passes over, Ableton's default
  // arrangement record. Overdub leaves existing cuts playing.
  if (replacing) {
    const passed = new Set(crossed.absoluteSteps.map((step) => wrapSongStep(step, totalSteps)));
    // Never wipe this take's own cuts. The cut is written at the step of the
    // playhead's seconds, and the sweep runs on the beat position; the two can
    // disagree by a step, so the sweep used to erase a cut a frame after
    // writing it and REC ended with no cuts at all.
    for (const step of takeSteps) passed.delete(step);
    if (passed.size > 0) cuts.update((list) => list.filter((c) => !passed.has(c.step)));
  }

  if (get(arrangementOverridden) || replacing) {
    sequencerLastStep.set(crossed.currentAbsoluteStep % ARRANGEMENT_STEPS);
    return;
  }

  const cutList = get(cuts);
  const loop = get(arrangementLoopRegion);
  const top = get(rackTop);
  const bottom = get(rackBottom);
  let selected = get(queuedPgmSource) ?? landedPgm;
  for (const step of crossed.absoluteSteps) {
    sequencerLastStep.set(step % ARRANGEMENT_STEPS);
    const songStep = wrapSongStep(step, totalSteps);
    // Same beat-grid mapping the lane paints with, so the loop gate agrees
    // with where the cut is drawn.
    const at = stepSeconds(songStep, beatGrid, frame.bpm);
    if (!cutStepAllowedInLoop(at, loop)) continue;
    const slotIndex = cutAtStep(cutList, songStep);
    if (slotIndex == null) continue;
    const target = moduleForSlotIndex(top, bottom, slotIndex);
    const targetSlot = target ? currentRackSlotForModule(target) : null;
    if (target && targetSlot && target !== selected) {
      selected = target;
      selectPgmSource(target);
      if (get(playbackWorkspace) !== 'timing') void mediaRuntime.prewarmModule(targetSlot).catch(() => {});
    }
  }
}

function syncControlledVideos(
  assignments: Array<{ slotId: string; moduleId: string }>,
  params: Record<string, Record<string, number>>,
  frame: TimelineFrame
) {
  const live = audioEngine.getLiveScheduleFrame();
  const timeSamplerSlot = assignments.find(({ moduleId }) => moduleId === 'timesampler')?.slotId;
  if (timeSamplerSlot && live?.timeSampler) {
    const ts = live.timeSampler;
    videoPool.syncControlledModule(
      timeSamplerSlot,
      timeSamplerVideoTarget(frame, ts.sourceTimestampSeconds),
      ts.targetPlaybackRate,
      frame,
      ts.jumpGeneration
    );
  }

  const speedRampSlot = assignments.find(({ moduleId }) => moduleId === 'speedramp')?.slotId;
  if (speedRampSlot) {
    const sr = params.speedramp ?? {};
    const mapped = advanceSpeedRampSource(
      speedRampSourceState,
      frame,
      sr,
      get(bypassed).speedramp === true
    );
    speedRampSourceState = mapped.state;
    const rate = mapped.rate;
    videoPool.syncControlledModule(speedRampSlot, mapped.targetSeconds, mapped.rate, frame);
    // hand the shader the rate it cannot derive (bezier solve lives in JS), plus
    // the cycle phase, so streaking/chroma track the real speed
    const cycleBeats = SPEEDRAMP_CYCLE_BEATS[
      Math.min(6, Math.floor(((sr.len ?? 36) / 100) * 7))
    ]!;
    // Cycle phase on the rack groove rather than a plain modulo. Under swing the
    // two halves of a pair are different lengths, and grooveSegment reports
    // progress across whichever half we are in -- so the ramp stretches with the
    // groove instead of running straight through it.
    lastSpeedRampAux = {
      aux1: rate,
      aux2: grooveSegment(frame.beatPosition, cycleBeats, get(pgmFeel)).progress
    };
  } else {
    speedRampSourceState = null;
  }
}

/** Configure before AudioEngine's order-0 schedule advance, so a source/effect
 * swap is reflected in the very same authoritative timeline frame. */
function configureTimeSampler() {
  const params = get(moduleParams);
  const tsParams = params.timesampler ?? {};
  const timeSamplerSlot = currentRackSlotForModule('timesampler');
  const tsMidi = (() => {
    // A file attached to the TIMESAMPLER card is the first authority. Loading
    // it selects MIDI; removing it returns this source to audio/onsets.
    const cardSource = get(midiUiOpen)
      ? (get(moduleTriggerSource).timesampler ?? 'audio')
      : 'audio';
    const cardLayer = get(midiLayers).timesampler ?? null;
    const density = (tsParams.density ?? 100) / 100;
    if (cardLayer) {
      const cardNotes = midiNotesForTriggerSource(cardSource, cardLayer, density);
      return cardNotes
        ? {
            notes: cardNotes,
            duration: cardLayer.duration,
            triggerKey: `card:${cardLayer.identity ?? cardLayer.name}:${density}`
          }
        : null;
    }

    // Preserve the older explicit arranger-stem route when no card MIDI is
    // selected. It is independently user-selected, never inferred merely from
    // a file's presence.
    if (get(triggerSource) !== 'midi') return null;
    const channel = get(activeChannel);
    if (channel) {
      const channelLayer: MidiLayer = {
        identity: channel.identity,
        name: channel.name,
        notes: channel.notes ?? channel.onsets.map((time) => ({ time, note: 60, velocity: 100 })),
        duration: channel.duration
      };
      return {
        notes: firingNotes(channelLayer, density).map(({ note }) => note),
        duration: channelLayer.duration,
        triggerKey: `stem:${channel.id}:${density}`
      };
    }
    const selectedLayer = get(midiLayers)[get(triggerMidiModule) ?? 'timesampler'] ?? null;
    const selectedNotes = midiNotesForTriggerSource('midi', selectedLayer, density);
    return selectedNotes && selectedLayer
      ? {
          notes: selectedNotes,
          duration: selectedLayer.duration,
          triggerKey: `layer:${selectedLayer.identity ?? selectedLayer.name}:${density}`
        }
      : null;
  })();
  const tsDuration = timeSamplerSlot ? videoPool.getDuration(timeSamplerSlot) || 120 : 120;
  audioEngine.configureTimeSampler({
    sourceDurationSeconds: tsDuration,
    sourceKey: timeSamplerSlot ?? 'timesampler-off-rack',
    triggerKey: tsMidi?.triggerKey ?? 'audio',
    controls: {
      mode: tsParams.mode,
      size: tsParams.size,
      slices: tsParams.slices,
      loops: tsParams.loops,
      rate: tsParams.rate,
      accent: tsParams.accent
    },
    feel: get(pgmFeel),
    midiNotes: tsMidi?.notes,
    midiDurationSeconds: tsMidi?.duration,
    onsetSensitivity: (tsParams.chance ?? 60) / 100,
    bypassed: get(playbackWorkspace) === 'timing' || !timeSamplerSlot || get(bypassed).timesampler === true
  });
}

export function startAppLoop() {
  if (running) return;
  // Defensive restart cleanup: a prior partial teardown must not leave a
  // renderer subscriber registered alongside the new one.
  unsubscribeTimeline?.();
  unsubscribeTimeline = null;
  unsubscribeTimeSamplerConfig?.();
  unsubscribeTimeSamplerConfig = null;
  running = true;
  sequencerGeneration = -1;
  sequencerAbsoluteStep = null;
  resetArrangementTracking();
  speedRampSourceState = null;
  unsubscribeTimeSamplerConfig = audioTimeline.subscribe(configureTimeSampler, -10);
  unsubscribeTimeline = audioTimeline.subscribe((frame) => {
    const state = audioEngine.getState();
    const sound = audioEngine.getSoundTouchState();
    const onsetAmp = updateBassOnset(state.bassAmp);
    webGpuEngine.setFrameContext({
      beat: frame.beatPosition,
      beatPhase: frame.beatPhase,
      bpm: frame.bpm,
      playing: frame.playing,
      amplitude: state.amplitude,
      bassAmp: state.bassAmp,
      onsetAmp,
      bassNorm,
      highAmp: state.highAmp,
      pitchSemitones: sound.keySemitones + sound.pitchSemitones,
      timeline: frame
    });

    const timing = get(playbackWorkspace) === 'timing';
    timingRuntime.setActive(timing, webGpuEngine.getDevice());
    webGpuEngine.setTimingTextures(timing ? timingRuntime.textureFor : null);
    if (timing) {
      // Source videos stay registered for Perform, but do not decode or seek
      // during resident Timing playback. The bank owns source-time selection.
      getVideoSourcePort().tick(false);
      timingRuntime.tick(frame);
      runSequencer(frame);
      webGpuEngine.renderAll(frame);
      return;
    }

    const assignments = currentRackAssignments(get(rackTop), get(rackBottom));
    const moduleIds = assignments.map(({ moduleId }) => moduleId);
    const timeSamplerAccent = audioEngine.getLiveScheduleFrame()?.accent;
    lastTimeSamplerAux = timeSamplerAccentUniforms(
      frame,
      timeSamplerAccent
    );
    syncVideoModes(assignments);

    const livePgm = get(pgmSource);
    const livePgmSlot = currentRackSlotForModule(livePgm);
    const params = get(moduleParams);
    const tapdelayParams = params.tapdelay ?? {};
    const midiAges = midiTriggerAges(frame);
    const fireAges = fireTriggerAges(frame, params);
    const tapdelay = tapdelayTriggerAge(
      frame,
      tapdelayParams,
      midiAges.tapdelay,
      fireAges.tapdelay,
      onsetAmp
    );
    liveOnsetStutterState = tapdelay.liveState;

    if (audioEngine.isRhythmReady()) {
      syncControlledVideos(assignments, params, frame);
      getVideoSourcePort().tick(frame);
    } else {
      getVideoSourcePort().tick(false);
    }
    const layers = get(videoLayers);
    const triggerAges: Record<string, number> = {};
    for (const id of moduleIds) {
      const triggerAge =
        id === 'tapdelay'
          ? tapdelay.age
          : mergeTriggerAge(midiAges[id], fireAges[id]);
      triggerAges[id] = triggerAge;
      webGpuEngine.setModuleParams(id, {
        ...paramsForGpu(id, params[id] ?? {}),
        triggerAge
      });
    }

    if (livePgmSlot && layers[livePgmSlot]) {
      const triggerAge =
        livePgm === 'tapdelay'
          ? tapdelay.age
          : mergeTriggerAge(midiAges[livePgm], fireAges[livePgm]);
      triggerAges[livePgm] = triggerAge;
      webGpuEngine.setModuleParams(livePgm, {
        ...paramsForGpu(livePgm, params[livePgm] ?? {}),
        triggerAge
      });
    }

    tickArrangementRecorder(frame, moduleIds, triggerAges);

    runSequencer(frame);

    const queued = get(queuedPgmSource);
    const queuedSlot = queued ? currentRackSlotForModule(queued) : null;
    if (queuedSlot !== lastQueuedPrewarmSlot) {
      lastQueuedPrewarmSlot = queuedSlot;
      if (queuedSlot) void mediaRuntime.prewarmModule(queuedSlot).catch(() => {});
    }

    const prep = audioEngine.getPgmPreparation();
    const prepSlot = prep.source ? currentRackSlotForModule(prep.source) : null;
    if (prepSlot && prepSlot !== lastPgmPrepSlot) {
      lastPgmPrepSlot = prepSlot;
      void mediaRuntime.prewarmModule(prepSlot).catch(() => {});
    }

    webGpuEngine.renderAll(frame);
  }, 10);

  startRenderBudget();
  const tick = (now: number) => {
    if (!running) return;
    // Measured here because this is the only owner of requestAnimationFrame in
    // production, so this is the real presented cadence rather than a second
    // timer's idea of it.
    recordFrame(now);
    audioTimeline.publishFrame();
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

export function stopAppLoop() {
  running = false;
  timingRuntime.dispose();
  webGpuEngine.setTimingTextures(null);
  stopRenderBudget();
  unsubscribeTimeline?.();
  unsubscribeTimeline = null;
  unsubscribeTimeSamplerConfig?.();
  unsubscribeTimeSamplerConfig = null;
  sequencerGeneration = -1;
  sequencerAbsoluteStep = null;
  resetArrangementTracking();
  speedRampSourceState = null;
  liveOnsetStutterState = null;
  manualFireByModule.clear();
  lastQueuedPrewarmSlot = null;
  lastPgmPrepSlot = null;
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
  rafId = 0;
}
