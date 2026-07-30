import { audioEngine } from '$lib/audio';
import { transportPlaying } from '$lib/stores/capabilities';

/** UI-facing audio transport actions — keeps engine calls out of components. */
export async function togglePlay() {
  const playing = audioEngine.getState().playing;
  if (playing) {
    audioEngine.stop();
    transportPlaying.set(false);
  } else {
    await audioEngine.start();
    transportPlaying.set(true);
  }
}

export function tapTempo() {
  audioEngine.tapTempo();
}

export async function loadAudioFile(file: File) {
  await audioEngine.loadAudioFile(file);
  transportPlaying.set(false);
}

export function clearUploadedTrack() {
  audioEngine.clearUploadedTrack();
  transportPlaying.set(false);
}

export function setManualBpm(bpm: number) {
  if (!Number.isFinite(bpm) || bpm <= 0) return;
  audioEngine.setBPM(bpm);
}

export function unlockManualBpm() {
  audioEngine.unlockBPM();
}
