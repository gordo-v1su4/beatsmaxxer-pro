import type { RequestHandler } from './$types';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

const MEDIA_ROOT = path.resolve('tests', 'fixtures', 'media');
const REDLINE_ROOT = path.resolve('..', 'docs', 'test_media', 'redline-media');

interface QaMediaCandidate {
  root: string;
  filePath: string;
}

function isContained(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

/** Resolve only the two explicit repo-owned fixture roots. */
export function _resolveQaMediaRequestPath(requestPath: string): QaMediaCandidate | null {
  if (!requestPath || requestPath.includes('\0')) return null;
  const portablePath = requestPath.replaceAll('\\', '/');
  const isRedline = portablePath.startsWith('redline/');
  const root = isRedline ? REDLINE_ROOT : MEDIA_ROOT;
  const relativePath = isRedline ? portablePath.slice('redline/'.length) : portablePath;
  const filePath = path.resolve(root, relativePath);
  return isContained(root, filePath) ? { root, filePath } : null;
}

function contentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') return 'application/json';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.mid' || ext === '.midi') return 'audio/midi';
  return 'application/octet-stream';
}

export const GET: RequestHandler = async ({ params }) => {
  const candidate = _resolveQaMediaRequestPath(params.path ?? '');
  if (!candidate) {
    return new Response('Forbidden', { status: 403 });
  }
  try {
    // Resolve symlinks before reading so a link inside the fixture directory
    // cannot escape to an arbitrary machine-local path.
    const [realRoot, realFile] = await Promise.all([
      realpath(candidate.root),
      realpath(candidate.filePath)
    ]);
    if (!isContained(realRoot, realFile)) {
      return new Response('Forbidden', { status: 403 });
    }
    const data = await readFile(realFile);
    return new Response(data, {
      headers: {
        'Content-Type': contentType(realFile),
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
};
