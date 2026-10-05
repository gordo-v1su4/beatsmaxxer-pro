import { get, writable } from 'svelte/store';
import { audioEngine } from '$lib/audio';
import { webGpuEngine } from '$lib/rendering/webgpu/WebGpuEngine';
import { audioTimeline } from '$lib/transport';
import { arrangementLoopRegion, type ArrangementLoopRegion } from '$lib/stores/arrangement';
import { transportDisplay } from '$lib/stores/transportDisplay';
import {
  arrangementMode,
  setArrangementMode,
  type ArrangementMode,
} from '$lib/arrangement/transportMode';

/**
 * Export the arrangement to a video file — Ableton's Export Audio/Video, for
 * the program out.
 *
 * Realtime: the range plays in PLAY mode while the PGM canvas and the audio
 * mix are recorded together, so a 3-minute song takes 3 minutes. That is the
 * honest version — every effect, cut, scene recall and time-stretch is
 * exactly what the app renders live, because it is what the app renders live.
 * Offline faster-than-realtime would need frame-stepped HTMLVideo decode,
 * which the media pipeline cannot do.
 */
export type ExportRange = 'song' | 'loop';

export interface ExportOptions {
  range: ExportRange;
  fps: 30 | 60;
}

export type ExportStatus =
  | { status: 'idle' }
  | { status: 'recording'; elapsedSeconds: number; totalSeconds: number }
  | { status: 'error'; message: string };

export const exportState = writable<ExportStatus>({ status: 'idle' });

/** Formats in preference order; the first the browser can record wins. */
const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
];

export function pickRecorderMime(isSupported: (mime: string) => boolean): string | null {
  return MIME_CANDIDATES.find((mime) => isSupported(mime)) ?? null;
}

/** Start/end seconds for a range. A loop range needs a real loop set. */
export function resolveExportRange(
  range: ExportRange,
  durationSeconds: number,
  loop: ArrangementLoopRegion | null,
): { startSeconds: number; endSeconds: number } | null {
  if (range === 'loop') {
    if (!loop || loop.endSeconds <= loop.startSeconds) return null;
    return { startSeconds: loop.startSeconds, endSeconds: Math.min(loop.endSeconds, durationSeconds || loop.endSeconds) };
  }
  if (!(durationSeconds > 0)) return null;
  return { startSeconds: 0, endSeconds: durationSeconds };
}

export function exportFileName(mime: string, now = new Date()) {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `beatsmaxxer-${stamp}.${mime.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
}

let cancelRequested = false;

export function cancelArrangementExport() {
  cancelRequested = true;
}

export async function startArrangementExport(options: ExportOptions): Promise<void> {
  if (get(exportState).status === 'recording') return;
  const fail = (message: string) => exportState.set({ status: 'error', message });

  const display = get(transportDisplay);
  const loop = get(arrangementLoopRegion);
  const range = resolveExportRange(options.range, display.duration, loop);
  if (!range) return fail(options.range === 'loop' ? 'Set a LOOP range first.' : 'Load a song first.');

  const canvas = webGpuEngine.getCanvas('pgm');
  if (!canvas || typeof canvas.captureStream !== 'function') return fail('Program monitor is not available to record.');
  if (typeof MediaRecorder === 'undefined') return fail('This browser cannot record video.');
  const mime = pickRecorderMime((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) return fail('No supported video format for recording.');
  const audio = audioEngine.createCaptureStream();
  if (!audio) return fail('Audio is not running yet — press play once, then export.');

  const previousMode: ArrangementMode = get(arrangementMode);
  const previousLoop = loop;
  const restore = () => {
    audio.release();
    arrangementLoopRegion.set(previousLoop);
    setArrangementMode(previousMode, audioTimeline.getPositionSeconds());
  };

  // The render follows the arrangement, with no loop wrap and no override
  // state leaking in from whatever the performer was doing.
  setArrangementMode('live', range.startSeconds);
  setArrangementMode('play', range.startSeconds);
  arrangementLoopRegion.set(null);

  const video = canvas.captureStream(options.fps);
  const stream = new MediaStream([...video.getVideoTracks(), ...audio.stream.getAudioTracks()]);
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: options.fps === 60 ? 16_000_000 : 10_000_000,
    audioBitsPerSecond: 256_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  cancelRequested = false;
  const total = range.endSeconds - range.startSeconds;
  exportState.set({ status: 'recording', elapsedSeconds: 0, totalSeconds: total });

  audioEngine.stop('operator');
  audioEngine.seek(range.startSeconds);
  await audioEngine.start();
  recorder.start(1000);

  const done = await new Promise<'finished' | 'cancelled' | 'stalled'>((resolve) => {
    let startedPlaying = false;
    const timer = setInterval(() => {
      const position = audioTimeline.getPositionSeconds();
      const playing = get(transportDisplay).playing;
      if (playing) startedPlaying = true;
      exportState.set({
        status: 'recording',
        elapsedSeconds: Math.max(0, Math.min(total, position - range.startSeconds)),
        totalSeconds: total,
      });
      const outcome = cancelRequested
        ? 'cancelled'
        : position >= range.endSeconds - 0.03 || (startedPlaying && !playing)
          ? 'finished'
          : null;
      if (outcome) {
        clearInterval(timer);
        resolve(outcome);
      }
    }, 50);
    // Transport never started (no track, autoplay refused): give up rather
    // than recording silence forever.
    setTimeout(() => {
      if (!startedPlaying) {
        clearInterval(timer);
        resolve('stalled');
      }
    }, 4000);
  });

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.stop();
  audioEngine.stop('operator');
  await stopped;
  video.getTracks().forEach((track) => track.stop());
  restore();

  if (done === 'stalled') return fail('Playback did not start — try pressing play once first.');
  if (done === 'cancelled') {
    exportState.set({ status: 'idle' });
    return;
  }

  const blob = new Blob(chunks, { type: mime.split(';')[0] });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFileName(mime);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  exportState.set({ status: 'idle' });
}
