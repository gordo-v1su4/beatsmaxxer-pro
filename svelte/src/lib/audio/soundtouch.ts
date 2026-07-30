/** SoundTouch.js integration — lazy-loaded so Node/vitest does not require AudioWorklet. */

export interface SoundTouchHandle {
  connect: (destination: AudioNode) => void;
  playbackRate: { value: number };
  pitch: { value: number };
  pitchSemitones: { value: number };
}

let registered = false;
let registerPromise: Promise<boolean> | null = null;

async function loadSoundTouchModule() {
  if (typeof AudioWorkletNode === 'undefined') return null;
  return import('@soundtouchjs/audio-worklet');
}

async function processorUrl(): Promise<string> {
  try {
    const viteUrl = (await import('@soundtouchjs/audio-worklet/processor?url')).default as string;
    if (viteUrl) return viteUrl;
  } catch {
    /* fall through */
  }
  const base = import.meta.env.BASE_URL ?? './';
  return `${base}soundtouch-processor.js`.replace(/\/{2,}/g, '/');
}

export async function ensureSoundTouchRegistered(ctx: AudioContext): Promise<boolean> {
  if (registered) return true;
  if (registerPromise) return registerPromise;

  registerPromise = (async () => {
    const mod = await loadSoundTouchModule();
    if (!mod) return false;
    try {
      const url = await processorUrl();
      await mod.SoundTouchNode.register(ctx, url);
      registered = true;
      return true;
    } catch (err) {
      console.warn('[SoundTouch] processor registration failed — pitch/tempo use fallback', err);
      return false;
    }
  })();

  return registerPromise;
}

export async function createSoundTouchNode(ctx: AudioContext): Promise<SoundTouchHandle | null> {
  const mod = await loadSoundTouchModule();
  if (!mod) return null;
  const ok = await ensureSoundTouchRegistered(ctx);
  if (!ok) return null;
  return new mod.SoundTouchNode({ context: ctx }) as SoundTouchHandle;
}

export function applySoundTouchParams(
  node: SoundTouchHandle | null,
  opts: { tempo: number; pitchSemitones: number; mediaElement?: HTMLAudioElement | null }
) {
  if (!node) return;

  const tempo = Math.max(0.5, Math.min(2, opts.tempo));
  const semitones = Math.max(-12, Math.min(12, opts.pitchSemitones));

  if (opts.mediaElement) {
    opts.mediaElement.preservesPitch = false;
    opts.mediaElement.playbackRate = tempo;
  }

  node.playbackRate.value = tempo;
  node.pitch.value = 1;
  node.pitchSemitones.value = semitones;
}
