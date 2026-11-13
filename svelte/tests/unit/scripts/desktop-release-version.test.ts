import { describe, expect, it } from 'vitest';
import { nextDesktopVersion, desktopReleasePlan } from '../../../../scripts/desktop-release-version';

describe('automatic desktop release versions', () => {
  it('keeps manual runs artifact-only even when a version tag is selected', () => {
    expect(desktopReleasePlan('0.2.13', { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.2.14' }))
      .toEqual({ version: '0.2.14', tag: '' });
  });
  it('publishes main pushes and rejects stale manual version tags', () => {
    expect(desktopReleasePlan('0.2.13', { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', LATEST_DESKTOP_TAG: 'v0.2.14' }))
      .toEqual({ version: '0.2.15', tag: 'v0.2.15' });
    expect(() => desktopReleasePlan('0.2.13', { GITHUB_EVENT_NAME: 'push', GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.2.13', LATEST_DESKTOP_TAG: 'v0.2.14' }))
      .toThrow(/older/);
  });
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
