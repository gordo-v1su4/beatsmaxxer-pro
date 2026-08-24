import manifestJson from '../../../tests/fixtures/media/manifest.json';

interface RedlineMediaManifest {
  bundle: string;
  sourceRoot: string;
  clips: string[];
  audio: string;
  audios: string[];
  midi: string;
  midis: string[];
}

const manifest = manifestJson as RedlineMediaManifest;
const VIRTUAL_ROOT = 'redline/';

function assertVirtualPath(path: string, extension: string) {
  if (!path.startsWith(VIRTUAL_ROOT) || path.includes('..') || !path.endsWith(extension)) {
    throw new Error(`Invalid Redline proof media path: ${path}`);
  }
  return path;
}

if (manifest.bundle !== 'redline-media' || manifest.sourceRoot !== 'test_media') {
  throw new Error('QA manifest is not the authoritative repo-local Redline media bundle');
}
if (manifest.clips.length !== 13 || new Set(manifest.clips).size !== 13) {
  throw new Error('Redline proof requires exactly 13 unique manifest video paths');
}
if (manifest.midis.length !== 7 || new Set(manifest.midis).size !== 7 || !manifest.midis.includes(manifest.midi)) {
  throw new Error('Redline proof requires all seven manifest MIDI stems');
}
if (!manifest.audios.includes(manifest.audio)) {
  throw new Error('Redline proof audio must be inventoried by the manifest');
}

export const REDLINE_MEDIA_SOURCE_ROOT = manifest.sourceRoot;
export const REDLINE_VIDEO_VIRTUAL_PATHS = Object.freeze(manifest.clips.map((path) => assertVirtualPath(path, '.mp4')));
export const REDLINE_VIDEO_NAMES = Object.freeze(REDLINE_VIDEO_VIRTUAL_PATHS.map((path) => path.split('/').at(-1)!));
export const REDLINE_AUDIO_VIRTUAL_PATH = assertVirtualPath(manifest.audio, '.wav');
export const REDLINE_AUDIO_NAME = REDLINE_AUDIO_VIRTUAL_PATH.split('/').at(-1)!;
export const REDLINE_MIDI_VIRTUAL_PATHS = Object.freeze(manifest.midis.map((path) => assertVirtualPath(path, '.mid')));
export const REDLINE_PRIMARY_MIDI_VIRTUAL_PATH = assertVirtualPath(manifest.midi, '.mid');

/** Convert a validated `/qa-media/redline/...` path to a path relative to `svelte/`. */
export function redlineVirtualPathToSourceRelative(path: string): string {
  if (!path.startsWith(VIRTUAL_ROOT) || path.includes('..')) {
    throw new Error(`Redline virtual path escapes the authoritative media root: ${path}`);
  }
  return `../${REDLINE_MEDIA_SOURCE_ROOT}/${path.slice(VIRTUAL_ROOT.length)}`;
}

export const REDLINE_VIDEO_SOURCE_PATHS = Object.freeze(REDLINE_VIDEO_VIRTUAL_PATHS.map(redlineVirtualPathToSourceRelative));
export const REDLINE_AUDIO_SOURCE_PATH = redlineVirtualPathToSourceRelative(REDLINE_AUDIO_VIRTUAL_PATH);
export const REDLINE_MIDI_SOURCE_PATHS = Object.freeze(REDLINE_MIDI_VIRTUAL_PATHS.map(redlineVirtualPathToSourceRelative));
export const REDLINE_PRIMARY_MIDI_SOURCE_PATH = redlineVirtualPathToSourceRelative(REDLINE_PRIMARY_MIDI_VIRTUAL_PATH);
