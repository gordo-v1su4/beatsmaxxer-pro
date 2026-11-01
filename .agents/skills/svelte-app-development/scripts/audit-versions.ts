#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const project = resolve(process.argv[2] ?? '.');
const manifestPath = resolve(project, 'package.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const declared = { ...manifest.dependencies, ...manifest.devDependencies };
const candidates = [
  'svelte',
  '@sveltejs/kit',
  '@sveltejs/vite-plugin-svelte',
  'svelte-check',
  'vite',
  'tailwindcss',
  '@skeletonlabs/skeleton',
  'bits-ui'
].filter((name) => declared[name]);

const rows = await Promise.all(candidates.map(async (name) => {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`);
  if (!response.ok) throw new Error(`${name}: registry returned ${response.status}`);
  const latest = await response.json() as { version: string };
  return { package: name, declared: declared[name], latest: latest.version };
}));

if (process.argv.includes('--json')) console.log(JSON.stringify({ project, packages: rows }, null, 2));
else console.table(rows);
