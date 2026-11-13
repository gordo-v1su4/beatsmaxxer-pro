import { describe, expect, it } from 'vitest';
import { nextDesktopVersion } from '../../../../scripts/desktop-release-version';

describe('automatic desktop release versions', () => {
  it('advances beyond the last published update without committing a version bump', () => {
    expect(nextDesktopVersion('0.2.13', 'v0.2.14')).toBe('0.2.15');
    expect(nextDesktopVersion('0.2.13', 'v0.3.0')).toBe('0.3.1');
  });
  it('respects a newer repository version and handles the first release', () => {
    expect(nextDesktopVersion('0.3.0', 'v0.2.99')).toBe('0.3.1');
    expect(nextDesktopVersion('0.2.13')).toBe('0.2.14');
  });
  it('rejects ambiguous tags and versions Windows cannot install', () => {
    expect(() => nextDesktopVersion('0.2.13', 'nightly')).toThrow();
    expect(() => nextDesktopVersion('0.2.65535')).toThrow(/Windows/);
  });
});
