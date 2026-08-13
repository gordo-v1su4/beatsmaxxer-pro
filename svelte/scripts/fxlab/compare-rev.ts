/**
 * Render the same modules from a git revision and from the working tree, so a
 * card or effect change can be judged as a before/after pair.
 *
 *   bun scripts/fxlab/compare-rev.ts HEAD grain vhs leak
 *
 * Works by extracting the shader at that revision to a temp file and compiling
 * it to its own output directory. Nothing in the working tree is touched --
 * doing this by stashing risks losing uncommitted work if a render is
 * interrupted, which is exactly how it went wrong the first time.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildGlsl } from './build-glsl';
import { FXLAB_OUT } from './env';

const rev = process.argv[2] ?? 'HEAD';
const modules = process.argv.slice(3);
const SHADER = 'svelte/src/lib/rendering/webgpu/shaders/moduleFx.wgsl.ts';

const show = spawnSync('git', ['show', `${rev}:${SHADER}`], {
  encoding: 'utf8',
  cwd: `${process.cwd()}/..`
});
if (show.status !== 0) throw new Error(`git show ${rev}:${SHADER} failed:\n${show.stderr}`);

const dir = `${FXLAB_OUT}/rev-${rev.replace(/[^a-zA-Z0-9]/g, '_')}`;
mkdirSync(dir, { recursive: true });
const modPath = `${dir}/moduleFx.wgsl.ts`;
writeFileSync(modPath, show.stdout);

const { MODULE_FX_IDLE_WGSL } = await import(modPath);
buildGlsl(MODULE_FX_IDLE_WGSL, dir);
console.log(`compiled ${rev} -> ${dir}`);

// Re-enter verify-fx with FXLAB_OUT pointed at the revision build, so the sheet
// renderer picks up that GLSL instead of the working tree's.
const run = spawnSync('bun', ['scripts/fxlab/verify-fx.ts', ...modules], {
  stdio: 'inherit',
  env: {
    ...process.env,
    FXLAB_OUT: dir,
    FXLAB_SHEETS: process.env.FXLAB_SHEETS ?? `${dir}/sheets`,
    FXLAB_SKIP_BUILD: '1'
  }
});
process.exit(run.status ?? 1);
