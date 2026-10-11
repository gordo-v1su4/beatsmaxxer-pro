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
