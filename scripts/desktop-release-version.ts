import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

function parseVersion(value: string): number[] {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) throw new Error(`Invalid desktop release version: ${value}`);
  const parts = match.slice(1).map(Number);
  if (parts.some((part, index) => !Number.isSafeInteger(part) || part > (index < 2 ? 255 : 65535))) {
    throw new Error('Desktop version exceeds Windows installer limits');
  }
  return parts;
}

export function nextDesktopVersion(repositoryVersion: string, latestTag?: string): string {
  const repository = parseVersion(repositoryVersion);
  const latest = latestTag ? parseVersion(latestTag) : repository;
  const comparison = repository[0]! - latest[0]! || repository[1]! - latest[1]! || repository[2]! - latest[2]!;
  const next = [...(comparison >= 0 ? repository : latest)];
  next[2]! += 1;
  parseVersion(next.join('.'));
  return next.join('.');
}

if (import.meta.main) {
  const configPath = 'desktop/src-tauri/tauri.conf.json';
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const automatic = process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_REF === 'refs/heads/main';
  const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined;
  const version = automatic
    ? nextDesktopVersion(config.version, process.env.LATEST_DESKTOP_TAG)
    : tag ? parseVersion(tag).join('.') : config.version;
  if (automatic || tag) {
    for (const path of [configPath, 'desktop/package.json']) {
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      manifest.version = version;
      writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    const manifest = 'desktop/src-tauri/Cargo.toml';
    writeFileSync(manifest, readFileSync(manifest, 'utf8').replace(/^version = "[^"]+"/m, `version = "${version}"`));
    const lock = 'desktop/src-tauri/Cargo.lock';
    writeFileSync(lock, readFileSync(lock, 'utf8').replace(
      /(name = "beatsmaxxer-pro-desktop"\r?\nversion = ")[^"]+/, `$1${version}`,
    ));
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\ntag=${automatic || tag ? `v${version}` : ''}\n`);
  }
  console.log(`Desktop build version: ${version}`);
}
