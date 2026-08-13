/**
 * Environment discovery for fxlab, with prerequisites that fail as sentences
 * rather than as stack traces.
 *
 * fxlab needs two things this repo does not otherwise use:
 *   naga        the reference WGSL compiler, so the GLSL is generated from the
 *               shipped shader instead of hand-written
 *   Chromium    already present via Playwright; fxlab reuses that download
 *               rather than fetching its own
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

export const FXLAB_DIR = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
export const FXLAB_OUT = `${FXLAB_DIR}/.out`;

const NAGA_HINT = [
  'fxlab needs the naga WGSL compiler and could not find it.',
  '',
  '  cargo install naga-cli',
  '',
  'Set NAGA_BIN to override the path. naga compiles the shader the app actually',
  'ships, which is what keeps these renders honest -- without it fxlab would be',
  'checking a hand-written copy instead of the real thing.'
].join('\n');

export function nagaBinary(): string {
  const candidates = [
    process.env.NAGA_BIN,
    `${homedir()}/.cargo/bin/naga`,
    '/usr/local/bin/naga',
    '/usr/bin/naga'
  ].filter((c): c is string => !!c);
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error(NAGA_HINT);
  return found;
}

const CHROME_HINT = [
  'fxlab needs a Chromium build and could not find one.',
  '',
  '  bunx playwright install chromium',
  '',
  'Set FXLAB_CHROME to override the path.'
].join('\n');

/**
 * Playwright normally resolves this itself, but the browser download lives
 * outside node_modules on this project (PLAYWRIGHT_BROWSERS_PATH), and pinning
 * the executable explicitly keeps fxlab working when the installed Playwright
 * version does not match the downloaded revision.
 */
export function chromeExecutable(): string | undefined {
  if (process.env.FXLAB_CHROME) {
    if (!existsSync(process.env.FXLAB_CHROME)) throw new Error(CHROME_HINT);
    return process.env.FXLAB_CHROME;
  }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined; // let Playwright resolve it
  const { readdirSync } = require('node:fs') as typeof import('node:fs');
  const dir = readdirSync(root)
    .filter((name) => name.startsWith('chromium-'))
    .sort()
    .pop();
  if (!dir) return undefined;
  const exe = `${root}/${dir}/chrome-linux/chrome`;
  return existsSync(exe) ? exe : undefined;
}

/** SwiftShader: there is no GPU in CI or in a cloud dev container. */
export const CHROME_ARGS = [
  '--no-sandbox',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist'
];
