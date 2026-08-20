import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const source = (path: string) => readFileSync(resolve('src/lib', path), 'utf8');

describe('arrangement sequencer entry', () => {
  test('puts ARRANGE on the top bar as its own control, not inside VIEW', () => {
    const topBar = source('components/TopBar.svelte');
    const arrangeBtn = topBar.indexOf("label={$viewMode === 'arrange' ? 'PERFORM' : 'ARRANGE'}");
    const viewMenu = topBar.indexOf('id="view"');
    expect(arrangeBtn).toBeGreaterThan(-1);
    expect(arrangeBtn).toBeLessThan(viewMenu);

    const viewBlock = topBar.slice(viewMenu);
    expect(viewBlock).not.toContain("Open the arrangement sequencer");
  });

  test('lets the arrangement screen return to perform without hunting the top bar', () => {
    const arrange = source('components/ArrangeView.svelte');
    expect(arrange).toContain("viewMode.set('perform')");
    expect(arrange).toContain('>PERFORM</button>');
  });
});
