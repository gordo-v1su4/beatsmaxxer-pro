/** SoundTouch.js integration — lazy-loaded so Node/vitest does not require AudioWorklet. */

export interface SoundTouchHandle extends AudioNode {
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
  const node: unknown = new mod.SoundTouchNode({ context: ctx });
  if (!isSoundTouchHandle(node)) {
    console.warn('[SoundTouch] registered node does not expose the required AudioNode controls');
    return null;
  }
  return node;
}

function isSoundTouchHandle(value: unknown): value is SoundTouchHandle {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const hasValue = (key: string) => {
    const control = candidate[key];
    return typeof control === 'object' && control !== null &&
      typeof (control as { value?: unknown }).value === 'number';
  };
  return typeof candidate.connect === 'function' &&
    typeof candidate.disconnect === 'function' &&
    hasValue('playbackRate') && hasValue('pitch') && hasValue('pitchSemitones');
}

export function applySoundTouchParams(
  node: SoundTouchHandle | null,
  opts: {
    tempo: number;
    /** Continuous pitch ratio (1 = original). */
    pitch: number;
    /** Integer semitone transposition (KEY). */
    keySemitones: number;
    mediaElement?: HTMLAudioElement | null;
  }
) {
  if (!node) return;

  const tempo = Math.max(0.5, Math.min(2, opts.tempo));
  const pitch = Math.max(0.5, Math.min(2, opts.pitch));
  const keySemitones = Math.max(-12, Math.min(12, Math.round(opts.keySemitones)));

  if (opts.mediaElement) {
    opts.mediaElement.preservesPitch = false;
    opts.mediaElement.playbackRate = tempo;
  }

  node.playbackRate.value = tempo;
  node.pitch.value = pitch;
  node.pitchSemitones.value = keySemitones;
}
