import { describe, expect, test } from 'vitest';
import { mobileShellForViewport } from '$lib/mobile/mobileEnv';

describe('mobile shell selection', () => {
  test('keeps a phone on the mobile shell in either orientation', () => {
    expect(mobileShellForViewport(390, 844)).toBe(true);
    expect(mobileShellForViewport(844, 390)).toBe(true);
  });

  test('keeps a tablet on the desktop shell in either orientation', () => {
    expect(mobileShellForViewport(768, 1024)).toBe(false);
    expect(mobileShellForViewport(1024, 768)).toBe(false);
  });

  test('honors explicit review overrides', () => {
    expect(mobileShellForViewport(1440, 900, '?mobile=1')).toBe(true);
    expect(mobileShellForViewport(390, 844, '?desktop=1')).toBe(false);
  });
});
