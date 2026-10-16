import { createHash } from 'node:crypto';
import { parsePublishedDemoManifest } from '../svelte/src/lib/runtime/demoManifest';

/** Anonymous production smoke: verify every advertised byte and browser range support. */
export async function verifyPublicDemo(origin: string) {
  const base = new URL(origin);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Expected an HTTP application origin');
  const fetchPublic = (path: string, init: RequestInit = {}) => fetch(new URL(path, base.origin), { ...init, signal: AbortSignal.timeout(60000) });
  const response = await fetchPublic('/demo-media/manifest.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Demo catalog returned ${response.status}`);
  const manifest = parsePublishedDemoManifest(await response.json());
  const assets = [manifest.song, manifest.analysis, manifest.midi, manifest.structure, ...manifest.clips];
  let bytes = 0;
  for (let i = 0; i < assets.length; i += 3) {
    await Promise.all(assets.slice(i, i + 3).map(async asset => {
      const file = await fetchPublic(asset.path);
      if (!file.ok) throw new Error(`${asset.name}: HTTP ${file.status}`);
      const body = new Uint8Array(await file.arrayBuffer());
      if (body.byteLength !== asset.size || createHash('sha256').update(body).digest('hex') !== asset.sha256) throw new Error(`${asset.name}: content verification failed`);
      const end = Math.min(31, body.byteLength - 1);
      const range = await fetchPublic(asset.path, { headers: { Range: `bytes=0-${end}` } });
      const rangeBody = new Uint8Array(await range.arrayBuffer());
      if (range.status !== 206 || range.headers.get('content-range') !== `bytes 0-${end}/${body.byteLength}`
        || !Buffer.from(rangeBody).equals(Buffer.from(body.subarray(0, end + 1)))) throw new Error(`${asset.name}: byte range verification failed`);
      bytes += body.byteLength;
    }));
  }
  return { origin: base.origin, demo: manifest.id, clips: manifest.clips.length, files: assets.length, verifiedBytes: bytes, anonymous: true, ranges: true };
}

if (import.meta.main) {
  if (!process.argv[2]) throw new Error('Usage: bun scripts/verify-demo-media.ts <application-origin>');
  console.info(JSON.stringify(await verifyPublicDemo(process.argv[2])));
}
