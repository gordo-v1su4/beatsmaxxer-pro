import { writable } from 'svelte/store';
import { audioEngine } from '$lib/audio';
import type { AnalysisStatus } from '$lib/engine/contracts';
import { transportBpm, transportBpmLocked, transportPlaying } from '$lib/stores/capabilities';

export interface TransportDisplay {
  bpm: number;
  bpmLocked: boolean;
  beat: number;
  beatPhase: number;
  time: number;
  playing: boolean;
  amplitude: number;
  bassAmp: number;
  fftBands: number[];
  trackName: string;
  usingUploadedTrack: boolean;
  analysisStatus: AnalysisStatus;
  analysisConfidence: number | null;
  analysisError: string | null;
}

export const transportDisplay = writable<TransportDisplay>({
  bpm: 128,
  bpmLocked: false,
  beat: 0,
  beatPhase: 0,
  time: 0,
  playing: false,
  amplitude: 0,
  bassAmp: 0,
  fftBands: [],
  trackName: 'Internal Drum Loop',
  usingUploadedTrack: false,
  analysisStatus: 'idle',
  analysisConfidence: null,
  analysisError: null
});

let rafId = 0;

export function startTransportPoll() {
  if (typeof requestAnimationFrame !== 'function') return;
  stopTransportPoll();
  const tick = () => {
    const s = audioEngine.getState();
    transportDisplay.set({
      bpm: s.bpm,
      bpmLocked: s.bpmLocked,
      beat: s.beat,
      beatPhase: s.beatPhase,
      time: s.time,
      playing: s.playing,
      amplitude: s.amplitude,
      bassAmp: s.bassAmp,
      fftBands: s.fftBands,
      trackName: s.trackName,
      usingUploadedTrack: s.usingUploadedTrack,
      analysisStatus: s.analysisStatus,
      analysisConfidence: s.analysisConfidence,
      analysisError: s.analysisError
    });
    transportBpm.set(s.bpm);
    transportBpmLocked.set(s.bpmLocked);
    transportPlaying.set(s.playing);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

export function stopTransportPoll() {
  if (typeof cancelAnimationFrame !== 'function') return;
  cancelAnimationFrame(rafId);
}
