import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, utimes, access, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RELEASE_MARKER, RELEASE_OWNER, parseRawEnv, requireEnvKeys, waitForHealthy, pruneReleaseCache } from '../../../../scripts/deploySupport.mjs';

describe('deployment safety', () => {
  it('normalizes raw env keys and reports missing names without values', () => {
    const env = parseRawEnv('# comment\n PIN = private=value\n EMPTY=\n');
    expect(env.PIN).toBe('private=value');
    expect(() => requireEnvKeys(env, ['EMPTY'], 'private.env')).toThrow('private.env: EMPTY is required');
  });
  it('waits through recreation and rejects a healthy previous image', async () => {
    let attempts = 0;
    await waitForHealthy('app:new', () => {
      attempts++;
      if (attempts === 1) throw new Error('missing');
      return attempts === 2 ? 'app:old healthy' : 'app:new healthy';
    }, async () => {}, 3);
    expect(attempts).toBe(3);
    await expect(waitForHealthy('app:new', () => 'app:old healthy', async () => {}, 2)).rejects.toThrow('health budget');
  });
  it('preserves rollback, newest caches and foreign or linked directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'beatsmaxxer-cache-test-'));
    const revisions = [1, 2, 3, 4, 5].map(n => n.toString(16).padStart(40, '0'));
    try {
      for (let i = 0; i < revisions.length; i++) {
        const path = join(root, revisions[i]);
        await mkdir(path);
        await writeFile(join(path, RELEASE_MARKER), JSON.stringify({ owner: RELEASE_OWNER, revision: revisions[i] }));
        await utimes(path, i + 1, i + 1);
      }
      const foreign = 'f'.repeat(40), linked = 'e'.repeat(40);
      await mkdir(join(root, foreign));
      await symlink(join(root, revisions[4]), join(root, linked), 'dir');
      const retired: string[] = [];
      expect(await pruneReleaseCache(root, [revisions[0]], async (revision: string) => { retired.push(revision); return true; }, 2)).toBe(2);
      expect(retired.sort()).toEqual([revisions[1], revisions[2]].sort());
      for (const revision of [revisions[0], revisions[3], revisions[4], foreign, linked]) await access(join(root, revision));
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('keeps a cache when its image cannot be retired', async () => {
    const root = await mkdtemp(join(tmpdir(), 'beatsmaxxer-cache-test-'));
    try {
      for (let n = 1; n <= 3; n++) {
        const revision = String(n).padStart(40, '0'), path = join(root, revision);
        await mkdir(path);
        await writeFile(join(path, RELEASE_MARKER), JSON.stringify({ owner: RELEASE_OWNER, revision }));
        await utimes(path, n, n);
      }
      expect(await pruneReleaseCache(root, [], async () => false, 2)).toBe(0);
      await access(join(root, '1'.padStart(40, '0')));
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
