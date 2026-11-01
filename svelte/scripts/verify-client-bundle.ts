import { stat } from 'node:fs/promises';
import path from 'node:path';

const clientRoot = path.resolve('.svelte-kit/output/client');
const manifestPath = path.join(clientRoot, '.vite/manifest.json');
const manifest = await Bun.file(manifestPath).json() as Record<string, { file?: string }>;
const pageEntry = manifest['.svelte-kit/generated/client-optimized/nodes/2.js'];

if (!pageEntry?.file) {
  throw new Error('Client bundle check could not find the main route entry.');
}

const pagePath = path.join(clientRoot, pageEntry.file);
const pageBytes = (await stat(pagePath)).size;
const maxPageBytes = 1_000_000;

if (pageBytes > maxPageBytes) {
  throw new Error(
    `Main route bundle is ${(pageBytes / 1_000_000).toFixed(2)} MB; expected at most ${(maxPageBytes / 1_000_000).toFixed(2)} MB. `
      + 'Check for large assets inlined into startup JavaScript.'
  );
}

const source = await Bun.file(pagePath).text();
const inlineImages = source.match(/data:image\/[^;,]+;base64,[A-Za-z0-9+/=]+/g) ?? [];
const largestInlineImage = inlineImages.reduce((largest, image) => Math.max(largest, image.length), 0);
const maxInlineImageBytes = 32_000;

if (largestInlineImage > maxInlineImageBytes) {
  throw new Error(
    `Main route contains an inlined image of ${(largestInlineImage / 1_000).toFixed(1)} kB; `
      + `expected at most ${(maxInlineImageBytes / 1_000).toFixed(0)} kB.`
  );
}

console.log(`PASS client bundle: main route ${(pageBytes / 1_000).toFixed(1)} kB, no large inlined images`);
