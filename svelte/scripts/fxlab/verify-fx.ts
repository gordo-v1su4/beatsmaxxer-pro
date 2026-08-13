/**
 * fxlab entry point: render every module's preview card beside the same effect
 * applied to a picture, so the two can be compared directly.
 *
 * The pass condition for a module is:
 *   1. the card and the applied-to-video row show the SAME effect, and
 *   2. sweeping the control visibly changes both.
 *
 * A card that draws an impression of the effect fails (1) -- it advertises a
 * look the module cannot produce. A card that ignores its params fails (2).
 *
 *   bun run verify:fx              every module
 *   bun run verify:fx leak vhs     just these
 */
import { mkdirSync } from 'node:fs';
import { buildGlsl } from './build-glsl';
import { makeSources } from './make-source';
import { renderSheet, type Cell } from './render';
import { FXLAB_OUT } from './env';
import { MODULE_CATALOG } from '../../src/lib/modules/catalog';
import { SHADER_EFFECT_MODE } from '../../src/lib/rendering/webgpu/shaders/moduleFx.wgsl';

const outDir = process.env.FXLAB_SHEETS ?? `${FXLAB_OUT}/sheets`;
const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'));

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

buildGlsl();
mkdirSync(outDir, { recursive: true });
const sources = await makeSources(`${FXLAB_OUT}/src`);

const modules = [...MODULE_CATALOG.values()].filter(
  (m) => requested.length === 0 || requested.includes(m.id)
);
if (modules.length === 0) {
  console.error(`no catalog module matched: ${requested.join(', ')}`);
  process.exit(1);
}

for (const mod of modules) {
  const mode = SHADER_EFFECT_MODE[mod.shaderKey ?? mod.id];
  if (typeof mode !== 'number') {
    console.error(`${mod.id}: no shader effect mode`);
    continue;
  }
  const accentRgb = hexToRgb(mod.accentColor);
  const mix = mod.params.mix ?? 100;
  const cells: Cell[] = [];

  // Row 1: the preview card. Row 2: the same settings over a picture.
  // Sweeping p0 across the row is what exposes a control that does nothing.
  for (const source of [undefined, sources.reference]) {
    for (const p0 of [15, 50, 90]) {
      cells.push({
        label: `${source ? 'video' : 'card'} p0=${p0}`,
        mode,
        mix,
        p0,
        p1: 50,
        p2: 50,
        p3: mod.params.type ?? mod.params.beat ?? 40,
        beat: 2.4,
        beatPhase: 0.12,
        playing: 1,
        bassAmp: 0.35,
        accentRgb,
        source
      });
    }
  }

  const path = await renderSheet(
    { cells, cols: 3, title: `${mod.name} (mode ${mode}) — card vs applied, p0 swept` },
    `${outDir}/${mod.id}.png`
  );
  console.log(`  ${mod.id.padEnd(12)} -> ${path}`);
}

console.log(`\n${modules.length} sheet(s) in ${outDir}`);
