import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

/** Only the curated public demo bundle is exposed; never the QA tree. */
export async function serveDemoMedia(req: IncomingMessage, res: ServerResponse, root: string, name: string) {
  const fail = (status: number) => { res.writeHead(status, { 'Cache-Control': 'no-store' }); res.end(); };
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405);
  if (!root || !/^(?:manifest\.json|[a-f0-9]{64}\.(?:mp4|mp3|json))$/.test(name)) return fail(404);
  let file: string, size: number;
  try {
    const base = await realpath(resolve(root));
    file = await realpath(resolve(base, name));
    if (!file.startsWith(base + sep)) return fail(404);
    const info = await stat(file);
    if (!info.isFile()) return fail(404);
    size = info.size;
  } catch { return fail(404); }
  const headers: Record<string, string> = {
    'Content-Type': ({ '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.json': 'application/json' } as Record<string, string>)[extname(file)]!,
    'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes',
    'Cache-Control': name === 'manifest.json' ? 'no-cache' : 'public, max-age=31536000, immutable'
  };
  let start = 0, end = size - 1, status = 200;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1] && !match[2]) || size < 1) return fail(416);
    if (!match[1]) start = Math.max(0, size - Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) {
      res.setHeader('Content-Range', `bytes */${size}`); return fail(416);
    }
    status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = String(Math.max(0, end - start + 1));
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || size === 0) return res.end();
  const stream = createReadStream(file, { start, end });
  stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
}
