import { writable } from 'svelte/store';
import { audioEngine } from '$lib/audio';
import type { AnalysisStatus } from '$lib/engine/contracts';
import { transportBpm, transportBpmLocked, transportPlaying } from '$lib/stores/capabilities';
import { syncAnalysisTriggers } from '$lib/stores/triggerLane';
import { audioTimeline } from '$lib/transport';

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
  analysisError: null
});

let unsubscribe: (() => void) | null = null;

export function startTransportPoll() {
  stopTransportPoll();
  unsubscribe = audioTimeline.subscribe(() => {
    const s = audioEngine.getState();
    transportDisplay.set({
      bpm: s.bpm,
      bpmLocked: s.bpmLocked,
      beat: s.beat,
      beatPhase: s.beatPhase,
      time: s.time,
      duration: s.duration,
      playing: s.playing,
      amplitude: s.amplitude,
      bassAmp: s.bassAmp,
      fftBands: s.fftBands,
      trackName: s.trackName,
      usingUploadedTrack: s.usingUploadedTrack,
      analysisStatus: s.analysisStatus,
      analysisConfidence: s.analysisConfidence,
      analysisDuration: s.analysisDuration,
      analysisError: s.analysisError
    });
    transportBpm.set(s.bpm);
    transportBpmLocked.set(s.bpmLocked);
    transportPlaying.set(s.playing);
    syncAnalysisTriggers(s.analysisOnsetGeneration);
  }, 100);
}

export function stopTransportPoll() {
  unsubscribe?.();
  unsubscribe = null;
}
