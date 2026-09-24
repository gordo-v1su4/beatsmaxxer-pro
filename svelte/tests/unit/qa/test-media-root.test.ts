import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { defaultRepoRoot, redlineTestMediaRoot } from '$lib/qa/testMediaRoot';

describe('redlineTestMediaRoot', () => {
  const repoRoot = path.resolve('/tmp/beatsmaxxer-pro');

  afterEach(() => {
    delete process.env.TEST_MEDIA_ROOT;
    delete process.env.BMX_TEST_MEDIA_ROOT;
  });

  test('defaults to repoRoot/test_media', () => {
    expect(redlineTestMediaRoot(repoRoot)).toBe(path.resolve(repoRoot, 'test_media'));
  });

  test('honors TEST_MEDIA_ROOT override', () => {
    process.env.TEST_MEDIA_ROOT = '/Volumes/RedlineBundle';
    expect(redlineTestMediaRoot(repoRoot)).toBe('/Volumes/RedlineBundle');
  });

  test('defaultRepoRoot resolves parent of svelte cwd', () => {
    expect(defaultRepoRoot('/Users/me/beatsmaxxer-pro/svelte')).toBe('/Users/me/beatsmaxxer-pro');
  });
});
