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
  });

  test('themes native dropdown menus and their selected options globally', () => {
    const css = read('src/app.css');

    expect(css).toContain('color-scheme: dark');
    expect(css).toContain('::picker(select)');
    expect(css).toMatch(/select option:is\(:checked, :hover, :focus\)/);
    expect(css).toContain('background: #19302e !important');
  });
});
