import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

describe('desktop and mobile access-gate route contract', () => {
  test('mounts one shared gate before either shell is selected', async () => {
    const pageSource = await readFile(
      new URL('../../../src/routes/+page.svelte', import.meta.url),
      'utf8'
    );

    expect(pageSource.match(/^\s*<AccessGate \/>$/gm)).toHaveLength(1);
    expect(pageSource).toContain('<AccessGate />\n<CapabilityGate');
    expect(pageSource).not.toContain('{#if !$isMobileShell}\n  <AccessGate />');
  });

  test('retains touch sizing for both physical and forced mobile shells', async () => {
    const gateSource = await readFile(
      new URL('../../../src/lib/components/AccessGate.svelte', import.meta.url),
      'utf8'
    );

    expect(gateSource).toContain('@media (max-width: 820px)');
    expect(gateSource).toContain(':global(.mobile-shell-active) .gate-backdrop');
    expect(gateSource).toContain('--g-field-h: 44px');
    expect(gateSource).toContain('--g-field-fs: 16px');
  });
});
