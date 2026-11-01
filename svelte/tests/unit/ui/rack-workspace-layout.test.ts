import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

describe('Perform and Timing rack composition', () => {
  test('places the PGM source rail below the monitor and full-width section strip', () => {
    const page = read('src/routes/+page.svelte');

    expect(page).toMatch(
      /<MainViewer modules=\{rackModules\} \/>\s*<TimingSections\/>\s*<div class="source-rack-area">/,
    );
    expect(page.match(/<PgmRail modules=\{rackModules\}\/>/g)).toHaveLength(1);
    expect(page).not.toContain("$viewMode==='perform'?'0px'");
  });

  test('measures the shared source rows when fitting either workspace', () => {
    const fit = read('src/lib/components/RackViewportFit.svelte');

    expect(fit).toContain(".source-rows");
    expect(fit).not.toContain('.perform-rows');
    expect(fit).toContain('Math.min(1, width / naturalWidth)');
    expect(fit).not.toContain('height / Math.max(1, naturalHeight)');
  });

  test('themes native dropdown menus and their selected options globally', () => {
    const css = read('src/app.css');

    expect(css).toContain('color-scheme: dark');
    expect(css).toContain('::picker(select)');
    expect(css).toMatch(/select option:is\(:checked, :hover, :focus\)/);
    expect(css).toContain('background: var(--option-selected-bg) !important');
  });

  test('keeps the program viewer width-driven at the fitted desktop size', () => {
    const css = read('src/app.css');
    const viewer = read('src/lib/components/MainViewer.svelte');

    expect(viewer).toContain('height: clamp(260px, calc(21cqw + 12px), 560px)');
    expect(css).not.toContain('26dvh');
    expect(css).not.toMatch(/\.rack-fit[^\n]*\.main-viewer\s*\{[^}]*height:/);
  });

  test('lays out Timing PGM sources in compact sequential pairs without stretching preview rows', () => {
    const css = read('src/app.css');
    const pgm = read('src/lib/components/PgmRail.svelte');

    expect(css).not.toContain('--timing-source-rack-height');
    expect(css).not.toContain('.timing-workspace .source-rows > .rack-row { flex-grow: 1; }');
    expect(pgm).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
    expect(pgm).toContain('grid-auto-rows:24px');
    expect(pgm).toContain("class:timing-grid={$viewMode==='timing'}");
  });

  test('opens the Timing editor whenever Timing is selected', () => {
    const topBar = read('src/lib/components/TopBar.svelte');

    expect(topBar).toContain('timingEditorCollapsed.set(false)');
  });
});
