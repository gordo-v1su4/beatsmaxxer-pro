import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

describe('DesignCode-inspired instrument design contract', () => {
  test('centralizes surface, motion, focus, and control-depth tokens', () => {
    const css = read('src/app.css');

    for (const token of [
      '--surface-canvas',
      '--surface-panel',
      '--control-face',
      '--control-shadow',
      '--control-shadow-pressed',
      '--focus-ring',
      '--ease-out',
      '--dur-control'
    ]) {
      expect(css).toContain(token);
    }
    expect(css).toContain(":focus-visible");
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  test('shared redesigned controls do not use blanket transitions', () => {
    const files = [
      'src/lib/components/TopBar.svelte',
      'src/lib/components/PgmRail.svelte',
      'src/lib/components/rack/RackBtn.svelte',
      'src/lib/components/rack/HeaderBtn.svelte',
      'src/lib/components/rack/TopBtn.svelte',
      'src/lib/components/rack/ClipBrowser.svelte',
      'src/lib/mobile/hardware/MobileKey.svelte',
      'src/lib/mobile/hardware/MobileFader.svelte'
    ];

    for (const file of files) {
      expect(read(file), file).not.toMatch(/transition\s*:\s*all\b/i);
    }
  });

  test('desktop and mobile key primitives include press and reduced-motion states', () => {
    const rack = read('src/lib/components/rack/RackBtn.svelte');
    const mobile = read('src/lib/mobile/hardware/MobileKey.svelte');

    expect(rack).toContain('.rack-btn:active');
    expect(rack).toContain('prefers-reduced-motion');
    expect(mobile).toContain('.key:active:not(:disabled)');
    expect(mobile).toContain('prefers-reduced-motion');
  });
  test('keeps the top browser on the left and the module editor on the bottom', () => {
    const drawer = read('src/lib/mobile/MobileDrawer.svelte');
    const moduleSheet = read('src/lib/mobile/MobileModuleSheet.svelte');

    expect(drawer).toContain('transform: translateX(-110%)');
    expect(drawer).toContain('style={dragging ? `transform: translateX(${dragX}px);` : undefined}');
    expect(moduleSheet).toContain(
      'landscape ? `translate3d(${offset}px,0,0)` : `translate3d(0,${offset}px,0)`'
    );
  });
});
