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
    const mediaRoot = path.resolve('/Volumes/RedlineBundle');
    process.env.TEST_MEDIA_ROOT = mediaRoot;
    expect(redlineTestMediaRoot(repoRoot)).toBe(mediaRoot);
  });

  test('defaultRepoRoot resolves parent of svelte cwd', () => {
    const projectRoot = path.resolve('/Users/me/beatsmaxxer-pro');
    expect(defaultRepoRoot(path.join(projectRoot, 'svelte'))).toBe(projectRoot);
  });
});
