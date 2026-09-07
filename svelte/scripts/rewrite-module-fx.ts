import { readFileSync, writeFileSync } from 'node:fs';

const modulePath = 'src/lib/rendering/webgpu/shaders/moduleFx.wgsl.ts';
const backupPath = 'src/lib/rendering/webgpu/shaders/moduleFx.wgsl.ts.bak';

// Recover the original WGSL from git if backup missing
let src = readFileSync(modulePath, 'utf8');
if (src.includes('${middle}')) {
  try {
    src = readFileSync(backupPath, 'utf8');
  } catch {
    const { execSync } = await import('node:child_process');
    src = execSync('git show HEAD:src/lib/rendering/webgpu/shaders/moduleFx.wgsl.ts', {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    writeFileSync(backupPath, src);
  }
}

const match = src.match(/export const MODULE_FX_WGSL = \/\* wgsl \*\/ `([\s\S]*?)`;/);
if (!match) throw new Error('MODULE_FX_WGSL not found');
const wgsl = match[1];

const markers = {
  idle: wgsl.indexOf('fn idleFade('),
  sampling: wgsl.indexOf('fn sampleSource('),
  transition: wgsl.indexOf('fn transitionIntervalBeats(')
};

const middle = wgsl.slice(markers.idle, markers.sampling);
const tail = wgsl.slice(markers.transition);

const shaderEffectModeMatch = src.match(/export const SHADER_EFFECT_MODE[\s\S]*$/);
if (!shaderEffectModeMatch) throw new Error('SHADER_EFFECT_MODE block missing');

function escapeTemplate(body: string) {
  return body.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

const out = `import {
  WGSL_FULLSCREEN_VERTEX,
  WGSL_MIRROR,
  WGSL_NOISE,
  WGSL_RHYTHM,
  WGSL_SAMPLING,
  WGSL_UNIFORMS_AND_BINDINGS
} from './wgslLib';

const WGSL_MODULE_BODY = /* wgsl */ \`${escapeTemplate(middle)}\`;
const WGSL_EFFECTS = /* wgsl */ \`${escapeTemplate(tail)}\`;

/** Unified param-driven FX shader — beat-synced, no fake wall-clock rhythm. */
export const MODULE_FX_WGSL = /* wgsl */ \`\${WGSL_FULLSCREEN_VERTEX}\${WGSL_UNIFORMS_AND_BINDINGS}\${WGSL_RHYTHM}\${WGSL_NOISE}\${WGSL_MIRROR}\${WGSL_MODULE_BODY}\${WGSL_SAMPLING}\${WGSL_EFFECTS}\`;

${shaderEffectModeMatch[0]}
`;

writeFileSync(modulePath, out);
console.log('moduleFx.wgsl.ts fixed');
