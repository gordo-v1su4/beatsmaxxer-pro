import { get } from 'svelte/store';
import { audioEngine } from '$lib/audio';
import { webGpuEngine } from '$lib/rendering/webgpu/WebGpuEngine';
import { videoPool } from '$lib/media/VideoPool';
import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
import { computeSpeedRampRate } from '$lib/runtime/speedramp';
import { moduleParams, videoLayers, rackTop, rackBottom, midiLayers, bypassed } from '$lib/stores/rack';
import { pgmSource, queuedPgmSource, selectPgmSource } from '$lib/stores/pgm';
import { sequencerSteps, sequencerArmed, sequencerLastStep } from '$lib/stores/sequencer';
import { getModuleDef } from '$lib/modules/catalog';

let running = false;

const SYNC_MODULES = new Set(['timesampler', 'speedramp']);
const SPEEDRAMP_CYCLE_BEATS = [1, 2, 4, 8, 16, 24, 32] as const;
/** Latest speedramp rate/phase, forwarded to the shader as aux1/aux2. */
let lastSpeedRampAux = { aux1: 1, aux2: 0 };
/** Last timesampler jump we seeked for, so we seek per jump, not per frame. */
let lastTimeSamplerJump = -1;

function syncVideoModes(moduleIds: string[]) {
  for (const id of moduleIds) {
    if (!SYNC_MODULES.has(id)) videoPool.markFreeRun(id);
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
      return { mix: p.mix, p0: p.time, p1: p.feedback, p2: p.feel };
    case 'timesampler':
      return { mix: p.mix, p0: p.rate, p1: p.slices, p2: p.size, accent: p.accent === 0 ? 1 : 0 };
    case 'punch':
      return { mix: p.mix, p0: p.amt, p1: p.dir, p2: p.snap };
    case 'shake':
      return { mix: p.mix, p0: p.hand, p1: p.impact, p2: p.sway };
    case 'orbit':
      return { mix: p.mix, p0: p.spd, p1: p.drift, p2: p.nudge };
    case 'focus':
      return { mix: p.mix, p0: p.amt, p1: p.pulse, p2: p.soft };
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

function runSequencer(beat: number, playing: boolean) {
  if (!playing || !get(sequencerArmed)) return;
  const step = Math.floor(beat * 4) % 16;
  if (step === get(sequencerLastStep)) return;
  sequencerLastStep.set(step);
  const target = get(sequencerSteps)[step];
  if (target && target !== get(pgmSource)) {
    selectPgmSource(target);
    void mediaRuntime.prewarmModule(target);
  }
}

function syncControlledVideos(
  moduleIds: string[],
  params: Record<string, Record<string, number>>,
  beat: number,
  playing: boolean
) {
  const live = audioEngine.getLiveScheduleFrame();
  if (moduleIds.includes('timesampler') && live?.timeSampler) {
    const ts = live.timeSampler;
    // Seek ONLY on an actual slice jump. sourceTimestampSeconds advances
    // continuously inside a slice, so seeking every frame re-decoded the video
    // constantly: readyState never climbed back to HAVE_CURRENT_DATA, so
    // hasReadyFrame stayed false and the module fell back to the test card.
    // jumpGeneration ticks once per jump, which is the real edge to seek on.
    if (ts.jumpGeneration !== lastTimeSamplerJump) {
      lastTimeSamplerJump = ts.jumpGeneration;
      videoPool.seekModule('timesampler', ts.sourceTimestampSeconds);
    }
    videoPool.setModuleRate('timesampler', ts.targetPlaybackRate);
  }

  if (moduleIds.includes('speedramp')) {
    const sr = params.speedramp ?? {};
    const rate = computeSpeedRampRate(beat, sr, get(bypassed).speedramp === true);
    videoPool.setModuleRate('speedramp', rate);
    // hand the shader the rate it cannot derive (bezier solve lives in JS), plus
    // the cycle phase, so streaking/chroma track the real speed
    const cycleBeats = SPEEDRAMP_CYCLE_BEATS[
      Math.min(6, Math.floor(((sr.len ?? 36) / 100) * 7))
    ]!;
    lastSpeedRampAux = {
      aux1: rate,
      aux2: (((beat % cycleBeats) + cycleBeats) % cycleBeats) / cycleBeats
    };
    if (playing) {
      const v = videoPool.get('speedramp');
      if (v?.paused) void v.play().catch(() => {});
    }
  }
}

export function startAppLoop() {
  if (running) return;
  running = true;

  webGpuEngine.setFrameCallback(() => {
    const state = audioEngine.getState();
    const sound = audioEngine.getSoundTouchState();
    videoPool.setGlobalRate(sound.tempo);
    webGpuEngine.setFrameContext({
      beat: state.beat,
      beatPhase: state.beatPhase,
      bpm: state.bpm,
      playing: state.playing,
      amplitude: state.amplitude,
      bassAmp: state.bassAmp,
      pitchSemitones: sound.keySemitones + sound.pitchSemitones
    });

    const moduleIds = [...new Set([...get(rackTop), ...get(rackBottom)])];
    syncVideoModes(moduleIds);
    videoPool.tick(state.playing);

    const params = get(moduleParams);
    const layers = get(videoLayers);
    for (const id of moduleIds) {
      webGpuEngine.setModuleParams(id, paramsForGpu(id, params[id] ?? {}));
    }

    const livePgm = get(pgmSource);
    if (layers[livePgm]) {
      webGpuEngine.setModuleParams(livePgm, paramsForGpu(livePgm, params[livePgm] ?? {}));
    }

    const tsParams = params.timesampler ?? {};
    const tsMidi = get(midiLayers).timesampler;
    const tsDuration = videoPool.getDuration('timesampler') || 120;
    audioEngine.configureTimeSampler({
      sourceDurationSeconds: tsDuration,
      sourceKey: 'timesampler',
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
      bypassed: get(bypassed).timesampler === true
    });

    syncControlledVideos(moduleIds, params, state.beat, state.playing);
    runSequencer(state.beat, state.playing);

    const queued = get(queuedPgmSource);
    if (queued) void mediaRuntime.prewarmModule(queued);
  });
}

export function stopAppLoop() {
  running = false;
}
