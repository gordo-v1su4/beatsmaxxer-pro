export interface DemoAsset { name: string; path: string; sha256: string; size: number; type: string }
export interface DemoManifest {
  version: 1; id: string; title: string;
  song: DemoAsset; analysis: DemoAsset; midi: DemoAsset; structure: DemoAsset;
  clips: DemoAsset[];
}
export function parseDemoManifest(raw: unknown): DemoManifest {
  const doc = raw as DemoManifest;
  if (!doc || doc.version !== 1 || typeof doc.id !== 'string' || !doc.id || typeof doc.title !== 'string'
    || !Array.isArray(doc.clips) || doc.clips.length < 10 || doc.clips.length > 30) throw new Error('Invalid demo manifest');
  for (const asset of [doc.song, doc.analysis, doc.midi, doc.structure, ...doc.clips]) {
    if (!asset || typeof asset.name !== 'string' || !asset.name || !/^[a-f0-9]{64}$/.test(asset.sha256)
      || !Number.isSafeInteger(asset.size) || asset.size <= 0 || typeof asset.type !== 'string'
      || !new RegExp(`^/demo-media/${asset.sha256}\\.(mp4|mp3|json)$`).test(asset.path)) throw new Error('Invalid demo asset');
  }
  if (new Set(doc.clips.map(c => c.name)).size !== doc.clips.length) throw new Error('Duplicate demo clip names');
  return doc;
}
