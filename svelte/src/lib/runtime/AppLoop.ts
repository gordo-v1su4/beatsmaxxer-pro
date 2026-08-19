import { get } from 'svelte/store';
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
  moduleParams,
  videoLayers,
  rackTop,
  rackBottom,
  midiLayers,
  bypassed
} from '$lib/stores/rack';
import { pgmSource, queuedPgmSource, selectPgmSource } from '$lib/stores/pgm';
import {
  crossedSequencerSteps,
  sequencerArmed,
  sequencerLastStep
} from '$lib/stores/sequencer';
import {
  ARRANGEMENT_STEPS,
  activeSectionIndex,
  applySectionBank,
  arrangement,
  arrangementTotalSteps,
  autoBank,
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
import { getModuleDef } from '$lib/modules/catalog';
import { supportsModuleMidi } from '$lib/modules/midiContracts';
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
let sequencerAbsoluteStep: number | null = null;
/** Absolute bar the active section started on, so its length can be measured. */
let sectionStartBar = 0;

function syncVideoModes(assignments: Array<{ slotId: string; moduleId: string }>) {
  for (const { slotId, moduleId } of assignments) {
    if (SYNC_MODULES.has(moduleId)) videoPool.unmarkFreeRun(slotId);
    else videoPool.markFreeRun(slotId);
  }
}

function paramsForGpu(moduleId: string, params: Record<string, number>) {
  const def = getModuleDef(moduleId);
  const p = params;
  switch (def?.shaderKey ?? moduleId) {
    case 'transition':
      return { mix: p.mix, p0: p.amount, p1: p.duration, p2: p.type, p3: p.interval };
    case 'speedramp':
      return {
        mix: p.mix, p0: p.spdMax, p1: p.spdMin, p2: p.len,
        aux1: lastSpeedRampAux.aux1, aux2: lastSpeedRampAux.aux2
      };
    case 'tapdelay':
      // accent carries SENS here — the slot is otherwise unused by this module,
      // and every p-slot is already spoken for by LEN/HOLD/FEEL/GATE.
      return { mix: p.mix, p0: p.time, p1: p.feedback, p2: p.feel, p3: p.gate, accent: p.sens };
    case 'timesampler':
      return {
        mix: p.mix,
        p0: p.rate,
        p1: p.slices,
        p2: p.size,
        accent: 0,
        aux1: lastTimeSamplerAux.aux1,
        aux2: lastTimeSamplerAux.aux2
      };
    case 'punch':
      return { mix: p.mix, p0: p.amt, p1: p.dir, p2: p.snap };
    case 'shake':
      return { mix: p.mix, p0: p.hand, p1: p.impact, p2: p.sway };
    case 'orbit':
      return { mix: p.mix, p0: p.spd, p1: p.drift, p2: p.nudge };
    case 'focus':
      return { mix: p.mix, p0: p.amt, p1: p.pulse, p2: p.soft, p3: p.xeye ?? 0 };
    case 'anamorphic':
      return { mix: p.mix, p0: p.bars, p1: p.zoom, p2: p.flare };
    case 'grain':
      return { mix: p.mix, p0: p.size, p1: p.amount, p2: p.drift };
    case 'leak':
      // FREQ/HOLD ride on aux1/aux2: every p-slot is taken by EDGE/WARMTH/
      // DRIFT/TYPE. Unlike the p-slots the engine writes aux raw, so the 0-100
      // control range is normalised here.
      return {
        mix: p.mix, p0: p.edge, p1: p.warmth, p2: p.drift, p3: p.type,
        aux1: (p.freq ?? 45) / 100,
        aux2: (p.hold ?? 30) / 100,
        // BLADES is sent as a real blade count, not 0-1: the shader needs the
        // integer to build the polygon and to derive the spike rule from it.
        aux3: 5 + Math.round(((p.blades ?? 50) / 100) * 4),
        aux4: (p.squeeze ?? 0) / 100,
        // accent carries AUDIO here — LEAK never reads the slot for colour, the
        // same reason TAPDELAY puts SENS on it, and every other word is taken.
        accent: (p.audio ?? 40) / 100
      };
    case 'dutch':
      return { mix: p.mix, p0: p.tilt, p1: p.drift, p2: p.snap };
    case 'halation':
      return { mix: p.mix, p0: p.threshold, p1: p.spread, p2: p.tint };
    case 'bulge':
      return { mix: p.mix, p0: p.amount, p1: p.center, p2: p.falloff, p3: p.beat };
    case 'vhs':
      return { mix: p.mix, p0: p.tracking, p1: p.chroma, p2: p.noise, p3: p.beat };
    case 'prism':
      return { mix: p.mix, p0: p.split, p1: p.angle, p2: p.edge };
    case 'streak':
      return { mix: p.mix, p0: p.length, p1: p.angle, p2: p.decay };
    case 'mirror':
      return { mix: p.mix, p0: p.fold, p1: p.offset, p2: p.spin, p3: p.beat };
    case 'lens':
      return { mix: p.mix, p0: p.amount, p1: p.zoom, p2: p.edge, p3: p.beat };
    default:
      return {
        mix: p.mix ?? 100,
        p0: p.amount ?? p.amt ?? p.size ?? 50,
        p1: p.feedback ?? p.drift ?? p.bleed ?? 50,
        p2: p.tracking ?? p.squeeze ?? 50,
        p3: p.noise ?? 50
      };
  }
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
 * Walk the arrangement. A section owns a bar count, so the playhead leaving its
 * last bar hands over to the next one — and, when auto-bank is on, rebuilds the
 * rack from that section's bank so the chorus plays through different effects
 * than the verse.
 *
 * Bars are derived from the authoritative beat position rather than counted on
 * step crossings: a dropped frame would otherwise lose a bar and drift the
 * arrangement out of sync with the song permanently.
 */
function runArrangement(frame: TimelineFrame, generationChanged: boolean) {
  const sections = get(arrangement);
  if (sections.length === 0) return;

  const bar = Math.max(0, Math.floor(frame.beatPosition / 4));

  if (generationChanged) {
    sectionStartBar = bar;
    activeSectionIndex.set(0);
    barInSection.set(0);
    if (get(autoBank)) applySectionBank(sections[0]);
    return;
  }

  let index = get(activeSectionIndex);
  if (index >= sections.length) index = 0;

  // `while`, not `if`: a seek can jump past several short sections at once.
  let elapsed = bar - sectionStartBar;
  let advanced = false;
  while (elapsed >= sections[index].bars) {
    sectionStartBar += sections[index].bars;
    elapsed = bar - sectionStartBar;
    index = (index + 1) % sections.length;
    advanced = true;
  }

  if (advanced) {
    activeSectionIndex.set(index);
    if (get(autoBank)) applySectionBank(sections[index]);
  }
  barInSection.set(Math.max(0, elapsed));
}

function runSequencer(frame: TimelineFrame) {
  const generationChanged = frame.generation !== sequencerGeneration;
  const previous = generationChanged ? null : sequencerAbsoluteStep;
  const crossed = crossedSequencerSteps(previous, frame.beatPosition);
  sequencerGeneration = frame.generation;
  sequencerAbsoluteStep = crossed.currentAbsoluteStep;

  if (!frame.playing || !get(sequencerArmed)) {
    sequencerLastStep.set(crossed.currentAbsoluteStep % 16);
    return;
  }

  runArrangement(frame, generationChanged);

  const sections = get(arrangement);
  if (sections.length === 0) return;

  const cutList = get(cuts);
  const totalSteps = get(arrangementTotalSteps);
  const top = get(rackTop);
  const bottom = get(rackBottom);
  let selected = get(queuedPgmSource) ?? get(pgmSource);
  for (const step of crossed.absoluteSteps) {
    sequencerLastStep.set(step % ARRANGEMENT_STEPS);
    // Cuts are placed against the song, so the lookup wraps on the arrangement's
    // length rather than on the bar — bar 34 is its own step, not a repeat of 2.
    const songStep = totalSteps > 0 ? ((step % totalSteps) + totalSteps) % totalSteps : step;
    const slotIndex = cutAtStep(cutList, songStep);
    if (slotIndex == null) continue;
    const target = moduleForSlotIndex(top, bottom, slotIndex);
    const targetSlot = target ? currentRackSlotForModule(target) : null;
    if (target && targetSlot && target !== selected) {
      selected = target;
      selectPgmSource(target);
      void mediaRuntime.prewarmModule(targetSlot).catch(() => {});
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
    const cardSource = get(moduleTriggerSource).timesampler ?? 'audio';
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
    bypassed: !timeSamplerSlot || get(bypassed).timesampler === true
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
  speedRampSourceState = null;
  unsubscribeTimeSamplerConfig = audioTimeline.subscribe(configureTimeSampler, -10);
  unsubscribeTimeline = audioTimeline.subscribe((frame) => {
    const state = audioEngine.getState();
    const sound = audioEngine.getSoundTouchState();
    webGpuEngine.setFrameContext({
      beat: frame.beatPosition,
      beatPhase: frame.beatPhase,
      bpm: frame.bpm,
      playing: frame.playing,
      amplitude: state.amplitude,
      bassAmp: state.bassAmp,
      onsetAmp: updateBassOnset(state.bassAmp),
      bassNorm,
      highAmp: state.highAmp,
      pitchSemitones: sound.keySemitones + sound.pitchSemitones,
      timeline: frame
    });

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
    syncControlledVideos(assignments, get(moduleParams), frame);
    getVideoSourcePort().tick(frame);

    const params = get(moduleParams);
    const layers = get(videoLayers);
    const triggerAges = midiTriggerAges(frame);
    for (const id of moduleIds) {
      webGpuEngine.setModuleParams(id, {
        ...paramsForGpu(id, params[id] ?? {}),
        triggerAge: triggerAges[id] ?? -1
      });
    }

    if (livePgmSlot && layers[livePgmSlot]) {
      webGpuEngine.setModuleParams(livePgm, {
        ...paramsForGpu(livePgm, params[livePgm] ?? {}),
        triggerAge: triggerAges[livePgm] ?? -1
      });
    }

    runSequencer(frame);

    const queued = get(queuedPgmSource);
    const queuedSlot = queued ? currentRackSlotForModule(queued) : null;
    if (queuedSlot) void mediaRuntime.prewarmModule(queuedSlot).catch(() => {});
    webGpuEngine.renderAll(frame);
  }, 10);

  const tick = () => {
    if (!running) return;
    audioTimeline.publishFrame();
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

export function stopAppLoop() {
  running = false;
  unsubscribeTimeline?.();
  unsubscribeTimeline = null;
  unsubscribeTimeSamplerConfig?.();
  unsubscribeTimeSamplerConfig = null;
  sequencerGeneration = -1;
  sequencerAbsoluteStep = null;
  speedRampSourceState = null;
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
  rafId = 0;
}
