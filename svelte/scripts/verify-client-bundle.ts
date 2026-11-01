import { stat } from 'node:fs/promises';
import path from 'node:path';

interface ManifestEntry {
  file?: string;
  imports?: string[];
}

const clientRoot = path.resolve('.svelte-kit/output/client');
const manifestPath = path.join(clientRoot, '.vite/manifest.json');
let manifest: Record<string, ManifestEntry>;
try {
  manifest = await Bun.file(manifestPath).json() as Record<string, ManifestEntry>;
} catch (error) {
  throw new Error(
    `Client bundle check could not read ${manifestPath}; confirm Vite produced the client manifest. ${error instanceof Error ? error.message : String(error)}`
  );
}

const nodeEntries = Object.entries(manifest).filter(([key, entry]) =>
  /\/nodes\/\d+\.js$/.test(key) && typeof entry.file === 'string'
);
if (nodeEntries.length === 0) {
  throw new Error('Client bundle check could not find any SvelteKit route node entries.');
}

// The workbench is the largest route node today. Choosing by emitted size
// avoids pinning SvelteKit's generated node index, which changes as routes and
// layouts are added.
const nodeSizes = await Promise.all(nodeEntries.map(async ([key, entry]) => ({
  key,
  bytes: (await stat(path.join(clientRoot, entry.file!))).size,
})));
const pageEntryKey = nodeSizes.sort((a, b) => b.bytes - a.bytes)[0].key;
const visited = new Set<string>();
const queue = [pageEntryKey];
const startupFiles: string[] = [];
while (queue.length) {
  const key = queue.pop()!;
  if (visited.has(key)) continue;
  visited.add(key);
  const entry = manifest[key];
  if (!entry?.file) continue;
  startupFiles.push(entry.file);
  for (const dependency of entry.imports ?? []) queue.push(dependency);
}

const sources = await Promise.all(startupFiles.map(async (file) => {
  const filePath = path.join(clientRoot, file);
  try {
    return {
      bytes: (await stat(filePath)).size,
      source: await Bun.file(filePath).text(),
    };
  } catch (error) {
    throw new Error(`Client bundle check could not inspect ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}));
const startupBytes = sources.reduce((total, source) => total + source.bytes, 0);
// The current workbench graph is ~1.45 MB raw across its statically imported
// chunks. Keep enough headroom for normal chunking changes while still
// rejecting the former 8.5 MB inlined-image regression.
const maxStartupBytes = 2_000_000;

if (startupBytes > maxStartupBytes) {
  throw new Error(
    `Startup JavaScript is ${(startupBytes / 1_000_000).toFixed(2)} MB; expected at most ${(maxStartupBytes / 1_000_000).toFixed(2)} MB. `
      + 'Check for large assets or dependencies in statically reachable startup chunks.'
  );
}

const inlineImages = sources.flatMap(({ source }) =>
  source.match(/data:image\/[^;,]+;base64,[A-Za-z0-9+/=]+/g) ?? []
);
const largestInlineImage = inlineImages.reduce((largest, image) => Math.max(largest, image.length), 0);
const maxInlineImageBytes = 32_000;

if (largestInlineImage > maxInlineImageBytes) {
  throw new Error(
    `Startup JavaScript contains an inlined image of ${(largestInlineImage / 1_000).toFixed(1)} kB; `
      + `expected at most ${(maxInlineImageBytes / 1_000).toFixed(0)} kB.`
  );
}

console.log(
  `PASS client bundle: ${(startupBytes / 1_000).toFixed(1)} kB across ${startupFiles.length} startup chunks, no large inlined images`
);
