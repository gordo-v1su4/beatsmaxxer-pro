import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const source = (path: string) => readFileSync(resolve('src/lib', path), 'utf8');

describe('desktop updater entry', () => {
  test('keeps the updater in the persistent top-bar actions after VIEW', () => {
    const topBar = source('components/TopBar.svelte');
    const viewMenu = topBar.indexOf('id="view"');
    const updater = topBar.indexOf('<DesktopUpdater />');
    expect(viewMenu).toBeGreaterThan(-1);
    expect(updater).toBeGreaterThan(viewMenu);
  });

  test('gates native bindings and installs before relaunching', () => {
    const updater = source('components/DesktopUpdater.svelte');
    expect(updater).toContain('if (!isTauriRuntime()) return;');
    expect(updater.indexOf('pendingUpdate.downloadAndInstall')).toBeLessThan(
      updater.indexOf('adapter.relaunch')
    );
    expect(updater).toContain("phase = pendingUpdate ? 'available' : 'current'");
  });
});
