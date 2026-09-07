import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/lib/rendering/webgpu/shaders/moduleFx.wgsl.ts';
const src = readFileSync(path, 'utf8');
const match = src.match(/export const MODULE_FX_WGSL = \/\* wgsl \*\/ `([\s\S]*?)`;/);
if (!match) throw new Error('MODULE_FX_WGSL not found');
const wgsl = match[1];

const markers = {
  uniforms: wgsl.indexOf('struct Uniforms'),
  rhythm: wgsl.indexOf('fn beatPulse('),
  noise: wgsl.indexOf('fn rot2('),
  mirror: wgsl.indexOf('fn mirrorRepeat('),
  idle: wgsl.indexOf('fn idleFade('),
  sampling: wgsl.indexOf('fn sampleSource('),
  transition: wgsl.indexOf('fn transitionIntervalBeats(')
};

for (const [name, index] of Object.entries(markers)) {
  if (index < 0) throw new Error(`marker missing: ${name}`);
}

const fullscreen = wgsl.slice(0, markers.uniforms);
const uniforms = wgsl.slice(markers.uniforms, markers.rhythm);
const rhythm = wgsl.slice(markers.rhythm, markers.noise);
const noise = wgsl.slice(markers.noise, markers.mirror);
const mirror = wgsl.slice(markers.mirror, markers.idle);
const middle = wgsl.slice(markers.idle, markers.sampling);
const sampling = wgsl.slice(markers.sampling, markers.transition);
const tail = wgsl.slice(markers.transition);

const reassembled = fullscreen + uniforms + rhythm + noise + mirror + middle + sampling + tail;
if (reassembled !== wgsl) {
  for (let i = 0; i < Math.max(reassembled.length, wgsl.length); i += 1) {
    if (reassembled[i] !== wgsl[i]) {
      throw new Error(`reassemble mismatch at ${i}`);
    }
  }
  throw new Error('reassemble mismatch');
}

function exportConst(name: string, body: string) {
  return `export const ${name} = /* wgsl */ \`${body}\`;`;
}

const out = `/** Shared WGSL snippets — leaf module, no imports (Beatform wgslLib pattern). */\n\n${[
  exportConst('WGSL_FULLSCREEN_VERTEX', fullscreen),
  exportConst('WGSL_UNIFORMS_AND_BINDINGS', uniforms),
  exportConst('WGSL_RHYTHM', rhythm),
  exportConst('WGSL_NOISE', noise),
  exportConst('WGSL_MIRROR', mirror),
  exportConst('WGSL_SAMPLING', sampling)
].join('\n\n')}\n`;

writeFileSync('src/lib/rendering/webgpu/shaders/wgslLib.ts', out);
console.log('wgslLib.ts written');
