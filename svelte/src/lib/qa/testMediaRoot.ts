import path from 'node:path';

/** Repo parent directory (beatsmaxxer-pro root when cwd is `svelte/`). */
export function defaultRepoRoot(fromSvelteCwd = process.cwd()) {
  return path.resolve(fromSvelteCwd, '..');
}

/**
 * Physical Redline bundle root (`test_media` by default).
 * Override with `TEST_MEDIA_ROOT` or `BMX_TEST_MEDIA_ROOT` when the bundle lives elsewhere.
 */
export function redlineTestMediaRoot(repoRoot = defaultRepoRoot()) {
  const override = process.env.TEST_MEDIA_ROOT ?? process.env.BMX_TEST_MEDIA_ROOT;
  if (override?.trim()) return path.resolve(override.trim());
  return path.resolve(repoRoot, 'test_media');
}
