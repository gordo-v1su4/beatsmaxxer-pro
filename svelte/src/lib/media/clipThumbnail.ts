/**
 * One poster frame per library clip, decoded once at import and kept as a small
 * JPEG data URL. The library can hold more clips than the rack has decode lanes,
 * so it must never hold live <video> elements — those are the pool's business.
 */
const THUMB_WIDTH = 160;
const DECODE_TIMEOUT_MS = 8_000;

export interface ClipPoster {
  thumbnail: string | null;
  duration: number | null;
}

/**
 * Seek far enough in to clear the black//fade-in most clips open on, but never
 * past a short clip's end.
 */
function posterTime(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(duration * 0.1, 1);
}

export async function readClipPoster(file: File): Promise<ClipPoster> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';

  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('metadata-timeout')), DECODE_TIMEOUT_MS);
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve(video.duration);
      };
      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error('metadata-failed'));
      };
      video.src = url;
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('seek-timeout')), DECODE_TIMEOUT_MS);
      video.onseeked = () => {
        clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error('seek-failed'));
      };
      video.currentTime = posterTime(duration);
    });

    const height = video.videoHeight && video.videoWidth
      ? Math.round((THUMB_WIDTH * video.videoHeight) / video.videoWidth)
      : Math.round((THUMB_WIDTH * 9) / 16);
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_WIDTH;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { thumbnail: null, duration: Number.isFinite(duration) ? duration : null };
    ctx.drawImage(video, 0, 0, THUMB_WIDTH, height);

    return {
      thumbnail: canvas.toDataURL('image/jpeg', 0.62),
      duration: Number.isFinite(duration) ? duration : null
    };
  } catch {
    // A clip the browser cannot decode still belongs in the library — it just
    // shows a placeholder tile. Import must not fail on one bad file.
    return { thumbnail: null, duration: null };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

export function formatClipDuration(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
