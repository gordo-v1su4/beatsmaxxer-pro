import { get, writable } from 'svelte/store';
import { isVideoFile } from '$lib/media/videoFile';
import { readClipPoster } from '$lib/media/clipThumbnail';

/**
 * The clip bank: every clip the operator has brought in this session, whether or
 * not it is currently mounted in a rack slot. The rack holds ten decode lanes;
 * this holds the whole shoot, so a clip can be swapped onto a slot repeatedly
 * without reopening a file picker.
 *
 * Files are retained by reference — no copy — so the library costs a poster
 * frame per clip and nothing more.
 */
export type LibraryClipSource =
  | { kind: 'file'; file: File }
  | { kind: 'url'; url: string };

export interface LibraryClip {
  id: string;
  name: string;
  source: LibraryClipSource;
  thumbnail: string | null;
  duration: number | null;
}

export const clipLibrary = writable<LibraryClip[]>([]);

/**
 * Identity is the file itself, not the name: two takes exported as `clip.mp4`
 * from different folders are different clips, and re-importing the same folder
 * must not double the bank.
 */
function clipKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function urlClipKey(url: string) {
  return `url:${url}`;
}

export function findLibraryClip(id: string): LibraryClip | undefined {
  return get(clipLibrary).find((clip) => clip.id === id);
}

/**
 * Adds video files to the bank and returns only the ones that were new. Posters
 * are decoded one at a time: a folder drop can be dozens of clips, and racing
 * that many concurrent <video> decodes starves the rack's own playback.
 */
export async function addClipsToLibrary(files: File[]): Promise<LibraryClip[]> {
  const videos = files.filter(isVideoFile);
  if (videos.length === 0) return [];

  const existing = new Set(get(clipLibrary).map((clip) => clip.id));
  const fresh = videos.filter((file) => {
    const key = clipKey(file);
    if (existing.has(key)) return false;
    existing.add(key);
    return true;
  });
  if (fresh.length === 0) return [];

  // Insert first with no poster so the tiles appear immediately, then fill each
  // poster in as it decodes. A twenty-clip import should not look frozen.
  const added: LibraryClip[] = fresh.map((file) => ({
    id: clipKey(file),
    name: file.name,
    source: { kind: 'file', file },
    thumbnail: null,
    duration: null
  }));
  clipLibrary.update((clips) => [...clips, ...added]);

  for (const clip of added) {
    if (clip.source.kind !== 'file') continue;
    const poster = await readClipPoster(clip.source.file);
    clipLibrary.update((clips) =>
      clips.map((c) => (c.id === clip.id ? { ...c, ...poster } : c))
    );
  }
  return added;
}

export interface UrlLibraryClipInput {
  name: string;
  url: string;
}

/** Add URL-backed QA/bundled clips without materializing their full media as Blob/File objects. */
export async function addUrlClipsToLibrary(inputs: UrlLibraryClipInput[]): Promise<LibraryClip[]> {
  const existing = new Set(get(clipLibrary).map((clip) => clip.id));
  const fresh = inputs.filter(({ name, url }) => {
    if (!name || !url) return false;
    const key = urlClipKey(url);
    if (existing.has(key)) return false;
    existing.add(key);
    return true;
  });
  const added: LibraryClip[] = fresh.map(({ name, url }) => ({
    id: urlClipKey(url),
    name,
    source: { kind: 'url', url },
    thumbnail: null,
    duration: null
  }));
  if (added.length === 0) return [];
  clipLibrary.update((clips) => [...clips, ...added]);
  for (const clip of added) {
    if (clip.source.kind !== 'url') continue;
    const poster = await readClipPoster(clip.source.url);
    clipLibrary.update((clips) => clips.map((candidate) => candidate.id === clip.id ? { ...candidate, ...poster } : candidate));
  }
  return added;
}

export function removeClipFromLibrary(id: string) {
  clipLibrary.update((clips) => clips.filter((clip) => clip.id !== id));
}

export function clearClipLibrary() {
  clipLibrary.set([]);
}
