import { writable } from 'svelte/store';
import { audioEngine } from '$lib/audio';
import type { AnalysisStatus } from '$lib/engine/contracts';
import { transportBpm, transportBpmLocked, transportPlaying } from '$lib/stores/capabilities';
import { syncAnalysisTriggers } from '$lib/stores/triggerLane';
import { audioTimeline, type TimelineFrame } from '$lib/transport';
import { buildTimingHud, type TimingHud } from '$lib/runtime/timingHud';

const EMPTY_HUD: TimingHud = {
  clock: {
    playing: false,
    bpm: 128,
    bpmLocked: false,
    bar: 1,
    beatInBar: 1,
    positionSeconds: 0,
    positionLabel: '0:00.0',
    generation: 0,
    reason: 'initial',
    reasonLabel: 'BOOT'
  },
  sampler: null
};

export interface TransportDisplay {
  bpm: number;
  bpmLocked: boolean;
  beat: number;
  beatPhase: number;
  time: number;
  duration: number;
  playing: boolean;
  amplitude: number;
  bassAmp: number;
  fftBands: number[];
  trackName: string;
  usingUploadedTrack: boolean;
  analysisStatus: AnalysisStatus;
  analysisConfidence: number | null;
  analysisDuration: number;
  analysisError: string | null;
  /** One-clock / one-sampler-tree readout. Derived from TimelineFrame, not a second rAF. */
  hud: TimingHud;
}

export const transportDisplay = writable<TransportDisplay>({
  bpm: 128,
  bpmLocked: false,
  beat: 0,
  beatPhase: 0,
  time: 0,
  duration: 0,
  playing: false,
  amplitude: 0,
  bassAmp: 0,
  fftBands: [],
  trackName: '',
  usingUploadedTrack: false,
  analysisStatus: 'idle',
  analysisConfidence: null,
  analysisDuration: 0,
  analysisError: null,
  hud: EMPTY_HUD
});

let unsubscribe: (() => void) | null = null;

function hudFromFrame(frame: TimelineFrame, bpmLocked: boolean): TimingHud {
  const live = audioEngine.getLiveScheduleFrame()?.timeSampler ?? null;
  return buildTimingHud({
    frame,
    bpmLocked,
    sampler: live
      ? {
          mode: live.mode,
          activeSlice: live.activeSlice,
          effectiveSliceCount: live.effectiveSliceCount,
          sourceTimestampSeconds: live.sourceTimestampSeconds,
          jumpGeneration: live.jumpGeneration,
          jumpReason: live.jumpReason,
          loopIteration: live.loopIteration,
          loopCount: live.loopCount
        }
      : null
  });
}

export function startTransportPoll() {
  stopTransportPoll();
  unsubscribe = audioTimeline.subscribe((frame) => {
    const s = audioEngine.getState();
    const hud = hudFromFrame(frame, s.bpmLocked);
    transportDisplay.set({
      bpm: frame.bpm,
      bpmLocked: s.bpmLocked,
      beat: frame.beatPosition,
      beatPhase: frame.beatPhase,
      time: frame.positionSeconds,
      duration: s.duration,
      playing: frame.playing,
      amplitude: s.amplitude,
      bassAmp: s.bassAmp,
      fftBands: s.fftBands,
      trackName: s.trackName,
      usingUploadedTrack: s.usingUploadedTrack,
      analysisStatus: s.analysisStatus,
      analysisConfidence: s.analysisConfidence,
      analysisDuration: s.analysisDuration,
      analysisError: s.analysisError,
      hud
    });
    transportBpm.set(frame.bpm);
    transportBpmLocked.set(s.bpmLocked);
    transportPlaying.set(frame.playing);
    syncAnalysisTriggers(s.analysisOnsetGeneration);
  }, 100);
}

export function stopTransportPoll() {
  unsubscribe?.();
  unsubscribe = null;
}
