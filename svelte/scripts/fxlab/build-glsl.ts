/**
 * Compile the SHIPPED module shader to GLSL ES so it can be rendered off-GPU.
 *
 * Going through naga rather than hand-porting is the whole point: what gets
 * rendered here is the exact WGSL the app ships, so a proof sheet cannot drift
 * away from the shader it claims to be showing. A transliteration could look
 * right while the real shader did something else.
 *
 * The external-texture variant cannot be compiled outside WebGPU, so this uses
 * MODULE_FX_IDLE_WGSL — the same two string replacements the engine already
 * applies. The app relies on those two paths being equivalent (see
 * WebGpuEngine.createPipelines), so the maths is identical.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { MODULE_FX_IDLE_WGSL } from '../../src/lib/rendering/webgpu/shaders/moduleFx.wgsl';
import { FXLAB_OUT, nagaBinary } from './env';

export function buildGlsl(source = MODULE_FX_IDLE_WGSL, outDir = FXLAB_OUT) {
  const naga = nagaBinary();
  mkdirSync(outDir, { recursive: true });
  const wgslPath = `${outDir}/module.wgsl`;
  writeFileSync(wgslPath, source);

  for (const [stage, entry] of [
    ['vert', 'vertexMain'],
    ['frag', 'fragmentMain']
  ] as const) {
    const outPath = `${outDir}/module.${stage}`;
    // es300 is GLSL ES 3.00, which is what WebGL2 accepts. es310 compiles but
    // WebGL2 rejects the version directive.
    const result = spawnSync(
      naga,
      [wgslPath, outPath, '--entry-point', entry, '--profile', 'es300'],
      { encoding: 'utf8' }
    );
    if (result.status !== 0 || !existsSync(outPath)) {
      throw new Error(
        `naga failed compiling ${entry}:\n${result.stderr ?? ''}${result.stdout ?? ''}`
      );
    }
  }
  return { vert: `${outDir}/module.vert`, frag: `${outDir}/module.frag` };
}

if (import.meta.main) {
  buildGlsl();
  console.log(`compiled shipped WGSL -> ${FXLAB_OUT}/module.{vert,frag}`);
}
