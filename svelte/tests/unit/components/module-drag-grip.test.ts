import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const source = (path: string) => readFileSync(resolve('src/lib', path), 'utf8');

const grip = source('components/rack/ModuleGrip.svelte');
const effect = source('components/EffectModule.svelte');
const compact = source('components/CompactModule.svelte');

describe('module drag grip', () => {
  test('the grip is the only thing carrying the drag gesture', () => {
    expect(grip).toContain('data-drag-handle');
    expect(grip).toContain('onpointerdown={onHeaderPointerDown}');
    expect(grip).toContain('cursor:grab');
  });

  test('neither header binds pointerdown itself', () => {
    // BYPASS/MUTE/COLLAPSE/CLIP used to start a reorder; the gesture stays on the grip.
    for (const [name, src] of [['EffectModule', effect], ['CompactModule', compact]] as const) {
      const header = src.slice(src.indexOf('<ModuleGrip'), src.indexOf('<ModuleGrip') + 40);
      expect(header, `${name} renders the shared grip`).toContain('<ModuleGrip');
      expect(src, `${name} does not bind pointerdown outside the grip`).not.toContain(
        'onpointerdown={onHeaderPointerDown}'
      );
      expect(src, `${name} does not mark its own drag handle`).not.toContain('data-drag-handle');
    }
  });

  test('both rows use the same grip component rather than their own copy', () => {
    for (const src of [effect, compact]) {
      expect(src).toContain("import ModuleGrip from '$lib/components/rack/ModuleGrip.svelte'");
      expect(src).toContain('<ModuleGrip {onHeaderPointerDown} />');
    }
  });

  test('both rows render the same header height and title type', () => {
    // Read from EffectModule rather than hardcoded: pins the rows together
    // without owning the type scale, which is free to move.
    for (const src of [effect, compact]) {
      expect(src).toContain('height:26px');
    }
    const titleType = effect.match(
      /font-size:\d+(?:\.\d+)?px;font-weight:\d+;letter-spacing:[\d.]+em;text-transform:uppercase/
    )?.[0];
    expect(titleType, 'EffectModule declares a module title style').toBeDefined();
    expect(compact, 'CompactModule uses the same title type').toContain(titleType);
  });
});
