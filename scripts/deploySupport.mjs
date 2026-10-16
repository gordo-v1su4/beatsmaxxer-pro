import assert from 'node:assert/strict';
import { readdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';

export const RELEASE_OWNER = 'gordo-v1su4/beatsmaxxer-pro';
export const RELEASE_MARKER = '.beatsmaxxer-release.json';
const committed = /^[a-f0-9]{40}$/;

/** Same literal, unquoted KEY=value format as the private Compose raw env file.
 * @param {string} text */
export function parseRawEnv(text) {
  return Object.fromEntries(text.split('\n').filter(line => line.trim() && !line.trimStart().startsWith('#') && line.includes('='))
    .map(line => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]));
}
/** @param {Record<string, string>} values @param {string[]} keys @param {string} source */
export function requireEnvKeys(values, keys, source) {
  for (const key of keys) assert(typeof values[key] === 'string' && values[key].length, `${source}: ${key} is required`);
}

/** Add the curated read-only demo mount to this app's managed Compose only.
 * @param {string} content @param {string} demoRoot */
export function withPublicDemoMount(content, demoRoot) {
  assert(/^\/[A-Za-z0-9/_-]+$/.test(demoRoot), 'Invalid public demo directory');
  const lines = content.split('\n');
  const start = lines.findIndex(line => /^  app:\s*$/.test(line));
  assert(start >= 0, 'Managed app service not found');
  let end = start + 1;
  while (end < lines.length && (!lines[end].trim() || lines[end].startsWith('    '))) end++;
  const app = lines.slice(start, end);
  const mount = `      - ${demoRoot}:/app/demo-media:ro`;
  const existing = app.find(line => line.includes(':/app/demo-media'));
  assert(!existing || existing === mount, 'Unexpected existing demo mount');
  if (!existing) {
    const volumes = app.findIndex(line => /^    volumes:\s*$/.test(line));
    if (volumes >= 0) app.splice(volumes + 1, 0, mount);
    else app.splice(1, 0, '    volumes:', mount);
  }
  const env = app.findIndex(line => /^    environment:\s*$/.test(line));
  assert(env >= 0, 'Managed app environment not found');
  const configured = app.find(line => /^      DEMO_MEDIA_ROOT:/.test(line));
  assert(!configured || configured.trim() === 'DEMO_MEDIA_ROOT: /app/demo-media', 'Unexpected demo container directory');
  if (!configured) app.splice(env + 1, 0, '      DEMO_MEDIA_ROOT: /app/demo-media');
  return [...lines.slice(0, start), ...app, ...lines.slice(end)].join('\n');
}

/** A missing container during force-recreation is a pending state, not failure.
 * @param {string} image @param {() => string} inspect @param {() => Promise<void>} pause */
export async function waitForHealthy(image, inspect, pause, attempts = 90) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { if (inspect() === `${image} healthy`) return; } catch { /* Recreation may temporarily remove the name. */ }
    await pause();
  }
  throw new Error('Expected app image did not become healthy within the deployment health budget');
}

/** Retires only marked, reconstructable app caches; never global Docker data.
 * @param {string} root @param {Iterable<string>} protectedRevisions
 * @param {(revision: string) => Promise<boolean>} removeImages */
export async function pruneReleaseCache(root, protectedRevisions, removeImages, keep = 7) {
  assert(Number.isInteger(keep) && keep >= 2, 'Keep at least two release caches');
  const base = await realpath(root), protectedSet = new Set(protectedRevisions);
  const owned = [];
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || !committed.test(entry.name)) continue;
    const directory = join(base, entry.name);
    const resolved = await realpath(directory);
    assert(resolved.startsWith(base + sep), 'Release cache escaped its root');
    try {
      const marker = JSON.parse(await readFile(join(directory, RELEASE_MARKER), 'utf8'));
      if (marker.owner !== RELEASE_OWNER || marker.revision !== entry.name) continue;
      owned.push({ revision: entry.name, directory, modified: (await stat(directory)).mtimeMs });
    } catch { /* Unmarked/foreign directories remain operator-owned. */ }
  }
  owned.sort((a, b) => b.modified - a.modified);
  for (const entry of owned.slice(0, keep)) protectedSet.add(entry.revision);
  let retired = 0;
  for (const entry of owned) {
    if (protectedSet.has(entry.revision) || !await removeImages(entry.revision)) continue;
    // Recheck before recursive removal. Symlinked or replaced caches are never followed.
    assert(await realpath(entry.directory) === entry.directory, 'Release cache path changed');
    const marker = JSON.parse(await readFile(join(entry.directory, RELEASE_MARKER), 'utf8'));
    assert(marker.owner === RELEASE_OWNER && marker.revision === entry.revision, 'Release cache ownership changed');
    await rm(entry.directory, { recursive: true });
    retired++;
  }
  return retired;
}
