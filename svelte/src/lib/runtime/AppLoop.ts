import { get } from 'svelte/store';
import { audioEngine } from '$lib/audio';
import { webGpuEngine } from '$lib/rendering/webgpu/WebGpuEngine';
import { videoPool } from '$lib/media/VideoPool';
import { getVideoSourcePort } from '$lib/platform/videoSource';
import {
  tauriNativeSource,
  type NativeSourceTimeline
} from '$lib/media/sources/TauriNativeSource';
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
  activeSectionIndex,
  applySectionBank,
  arrangement,
  autoBank,
  barInSection,
  moduleForSlotIndex
} from '$lib/stores/arrangement';
import { triggerMidiModule, triggerSource } from '$lib/stores/triggerLane';
import { getModuleDef } from '$lib/modules/catalog';
import { audioTimeline, type TimelineFrame } from '$lib/transport';

let running = false;
let rafId = 0;
let unsubscribeTimeline: (() => void) | null = null;
let unsubscribeTimeSamplerConfig: (() => void) | null = null;

const SYNC_MODULES = new Set(['timesampler', 'speedramp']);
const SPEEDRAMP_CYCLE_BEATS = [1, 2, 4, 8, 16, 24, 32] as const;
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
      return { mix: p.mix, p0: p.bars, p1: p.squeeze, p2: p.flare };
    case 'grain':
      return { mix: p.mix, p0: p.size, p1: p.amount, p2: p.drift };
    case 'leak':
      return { mix: p.mix, p0: p.edge, p1: p.warmth, p2: p.drift };
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
  accent: { mode: number; presentationTimeSeconds: number } | null | undefined
) {
  if (!frame.playing || !accent) return { aux1: 0, aux2: 2 };
  const ageSeconds = frame.positionSeconds - accent.presentationTimeSeconds;
  const mode = Math.max(0, Math.min(2, Math.round(accent.mode)));
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > 0.5 || mode === 2) {
    return { aux1: 0, aux2: mode };
  }
  return { aux1: Math.exp(-ageSeconds * 12), aux2: mode };
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
  const section = sections[get(activeSectionIndex)] ?? sections[0];
  if (!section) return;

  const top = get(rackTop);
  const bottom = get(rackBottom);
  let selected = get(queuedPgmSource) ?? get(pgmSource);
  for (const step of crossed.steps) {
    sequencerLastStep.set(step);
    const slotIndex = section.pattern[step];
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
): NativeSourceTimeline[] {
  const native = getVideoSourcePort().kind === 'tauri-native';
  const sourceTimelines: NativeSourceTimeline[] = [];
  const live = audioEngine.getLiveScheduleFrame();
  const timeSamplerSlot = assignments.find(({ moduleId }) => moduleId === 'timesampler')?.slotId;
  if (timeSamplerSlot && live?.timeSampler) {
    const ts = live.timeSampler;
    if (native) {
      sourceTimelines.push({
        sourceId: timeSamplerSlot,
        positionUs: Math.round(ts.sourceTimestampSeconds * 1_000_000),
        playbackRate: ts.targetPlaybackRate,
        revision: ts.jumpGeneration
      });
    } else {
      videoPool.syncControlledModule(
        timeSamplerSlot,
        ts.sourceTimestampSeconds,
        ts.targetPlaybackRate,
        frame,
        ts.jumpGeneration
      );
    }
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
    if (native) {
      const speedRampProfile = {
        lengthPercent: sr.len ?? 36,
        speedMinPercent: sr.spdMin ?? 25,
        speedMaxPercent: sr.spdMax ?? 75,
        bezierY0Percent: sr.bzY0 ?? 100,
        bezierX1Percent: sr.bzX1 ?? 35,
        bezierY1Percent: sr.bzY1 ?? 0,
        bezierX2Percent: sr.bzX2 ?? 65,
        bezierY2Percent: sr.bzY2 ?? 0,
        bezierY3Percent: sr.bzY3 ?? 100,
        bypassed: get(bypassed).speedramp === true
      };
      sourceTimelines.push({
        sourceId: speedRampSlot,
        positionUs: Math.round(mapped.targetSeconds * 1_000_000),
        playbackRate: mapped.rate,
        revision: frame.generation,
        kind: 'speed-ramp',
        speedRamp: speedRampProfile
      });
    } else {
      videoPool.syncControlledModule(speedRampSlot, mapped.targetSeconds, mapped.rate, frame);
    }
    // hand the shader the rate it cannot derive (bezier solve lives in JS), plus
    // the cycle phase, so streaking/chroma track the real speed
    const cycleBeats = SPEEDRAMP_CYCLE_BEATS[
      Math.min(6, Math.floor(((sr.len ?? 36) / 100) * 7))
    ]!;
    lastSpeedRampAux = {
      aux1: rate,
      aux2: (((frame.beatPosition % cycleBeats) + cycleBeats) % cycleBeats) / cycleBeats
    };
  } else {
    speedRampSourceState = null;
  }
  return sourceTimelines;
}

/** Configure before AudioEngine's order-0 schedule advance, so a source/effect
 * swap is reflected in the very same authoritative timeline frame. */
function configureTimeSampler() {
  const params = get(moduleParams);
  const tsParams = params.timesampler ?? {};
  const timeSamplerSlot = currentRackSlotForModule('timesampler');
  /**
   * Which part drives the triggers. A MIDI layer used to win simply by existing,
   * which made loading one an irreversible decision — there was no way back to
   * onset triggering short of clearing the file. The source is now chosen, and
   * the chosen channel can be any module's part, not just TIMESAMPLER's own.
   */
  const tsMidi =
    get(triggerSource) === 'midi'
      ? get(midiLayers)[get(triggerMidiModule) ?? 'timesampler'] ?? null
      : null;
  const tsDuration = timeSamplerSlot
    ? tauriNativeSource.getDuration(timeSamplerSlot) || videoPool.getDuration(timeSamplerSlot) || 120
    : 120;
  audioEngine.configureTimeSampler({
    sourceDurationSeconds: tsDuration,
    sourceKey: timeSamplerSlot ?? 'timesampler-off-rack',
    controls: {
      mode: tsParams.mode,
      size: tsParams.size,
      slices: tsParams.slices,
      loops: tsParams.loops,
      rate: tsParams.rate,
      accent: tsParams.accent
    },
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
    tauriNativeSource.setProgramSource(livePgmSlot);
    tauriNativeSource.setSourceTimelines(syncControlledVideos(assignments, get(moduleParams), frame));
    tauriNativeSource.setEffectAudio(
      state.amplitude,
      state.bassAmp,
      sound.keySemitones + sound.pitchSemitones,
      timeSamplerAccent?.presentationTimeSeconds ?? -1,
      timeSamplerAccent?.mode ?? 2
    );
    getVideoSourcePort().tick(frame);

    const params = get(moduleParams);
    const layers = get(videoLayers);
    for (const id of moduleIds) {
      webGpuEngine.setModuleParams(id, paramsForGpu(id, params[id] ?? {}));
    }

    if (livePgmSlot && layers[livePgmSlot]) {
      webGpuEngine.setModuleParams(livePgm, paramsForGpu(livePgm, params[livePgm] ?? {}));
    }

    runSequencer(frame);

    const queued = get(queuedPgmSource);
    const queuedSlot = queued ? currentRackSlotForModule(queued) : null;
    if (queuedSlot) void mediaRuntime.prewarmModule(queuedSlot).catch(() => {});
    const plannedPgm = queued ?? audioEngine.getPgmPreparation().source;
    const plannedPgmSlot = plannedPgm ? currentRackSlotForModule(plannedPgm) : null;
    tauriNativeSource.prepareProgramSource(plannedPgmSlot);
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
