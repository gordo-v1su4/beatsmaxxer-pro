import type { RequestHandler } from './$types';
import { open, readFile, realpath, stat } from 'node:fs/promises';
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

interface ResolvedQaMediaFile {
  realFile: string;
  size: number;
}

async function resolveQaMediaFile(requestPath: string): Promise<ResolvedQaMediaFile | Response> {
  const candidate = _resolveQaMediaRequestPath(requestPath);
  if (!candidate) return new Response('Forbidden', { status: 403 });
  try {
    const [realRoot, realFile] = await Promise.all([realpath(candidate.root), realpath(candidate.filePath)]);
    if (!isContained(realRoot, realFile)) return new Response('Forbidden', { status: 403 });
    const info = await stat(realFile);
    if (!info.isFile()) return new Response('Not found', { status: 404 });
    return { realFile, size: info.size };
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

function mediaHeaders(realFile: string, size: number) {
  return new Headers({
    'Content-Type': contentType(realFile),
    'Content-Length': String(size),
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*'
  });
}

function parseSingleByteRange(value: string, size: number): { start: number; end: number } | null {
  if (!value.startsWith('bytes=') || value.includes(',')) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size < 1) return null;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

export const HEAD: RequestHandler = async ({ params }) => {
  const resolved = await resolveQaMediaFile(params.path ?? '');
  if (resolved instanceof Response) return resolved;
  return new Response(null, { status: 200, headers: mediaHeaders(resolved.realFile, resolved.size) });
};

export const GET: RequestHandler = async ({ params, request }) => {
  const resolved = await resolveQaMediaFile(params.path ?? '');
  if (resolved instanceof Response) return resolved;
  const { realFile, size } = resolved;
  const rangeValue = request?.headers.get('range');
  if (rangeValue) {
    const range = parseSingleByteRange(rangeValue, size);
    if (!range) {
      const headers = mediaHeaders(realFile, 0);
      headers.set('Content-Range', `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    const length = range.end - range.start + 1;
    const handle = await open(realFile, 'r');
    try {
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(buffer, 0, length, range.start);
      const headers = mediaHeaders(realFile, bytesRead);
      headers.set('Content-Range', `bytes ${range.start}-${range.start + bytesRead - 1}/${size}`);
      return new Response(buffer.subarray(0, bytesRead), { status: 206, headers });
    } finally {
      await handle.close();
    }
  }
  try {
    const data = await readFile(realFile);
    return new Response(data, { headers: mediaHeaders(realFile, size) });
  } catch {
    return new Response('Not found', { status: 404 });
  }
};
