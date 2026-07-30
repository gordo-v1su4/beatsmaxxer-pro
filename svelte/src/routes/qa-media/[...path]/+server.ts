import type { RequestHandler } from './$types';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MEDIA_ROOT = path.resolve('tests', 'fixtures', 'media');

export const GET: RequestHandler = async ({ params }) => {
  const rel = params.path ?? '';
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(MEDIA_ROOT, safe);
  if (!filePath.startsWith(MEDIA_ROOT)) {
    return new Response('Forbidden', { status: 403 });
  }
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type =
      ext === '.json'
        ? 'application/json'
        : ext === '.mp4'
          ? 'video/mp4'
          : ext === '.wav'
            ? 'audio/wav'
            : ext === '.mp3'
              ? 'audio/mpeg'
              : 'application/octet-stream';
    return new Response(data, {
      headers: {
        'Content-Type': type,
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
};
