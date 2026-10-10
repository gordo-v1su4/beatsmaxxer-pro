import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, lstatSync, existsSync } from 'node:fs';
import { realpathSync, statfsSync } from 'node:fs';
import { resolve } from 'node:path';
import { isIP } from 'node:net';
import { RELEASE_OWNER, RELEASE_MARKER, parseRawEnv, requireEnvKeys, waitForHealthy, pruneReleaseCache } from './deploySupport.mjs';

// This runner deliberately deploys one app on VM100; identity checks are allowlists.
const identity = { home: '/home/gordo/', stack: 'beatsmaxxer-pro', container: 'beatsmaxxer-pro-web', dependencies: 'beatsmaxxer-deploy-dependencies' };

const revision = process.argv[2];
assert(/^[a-f0-9]{40}$/.test(revision ?? ''), 'Expected a full committed revision');
assert(process.env.GITHUB_REF === 'refs/heads/main', 'Deploy only main');
const readEnv = path => parseRawEnv(readFileSync(path, 'utf8'));
const target = readEnv('/opt/beatsmaxxer-pro/deploy.env');
const privateEnv = readEnv('/opt/beatsmaxxer-pro/private.env');
requireEnvKeys(target, ['DOCKHAND_URL', 'DOCKHAND_ENV_ID', 'APP_RELEASE_ROOT'], 'deploy.env');
requireEnvKeys(privateEnv, ['APP_ORIGIN', 'APP_ACCESS_PIN', 'MEDIA_GATEWAY_TOKEN', 'INTERPOLATION_WORKER_URL'], 'private.env');
const analysisEnabled = privateEnv.ESSENTIA_ANALYSIS_ENABLED ?? 'true';
assert(['true', 'false'].includes(analysisEnabled), 'Invalid ESSENTIA_ANALYSIS_ENABLED');
if (analysisEnabled === 'true') requireEnvKeys(privateEnv, ['ESSENTIA_API_BASE_URL', 'ESSENTIA_API_KEY'], 'private.env');
const control = new URL(target.DOCKHAND_URL);
assert(['http:', 'https:'].includes(control.protocol), 'Dockhand needs HTTP or HTTPS');
const octets = control.hostname.split('.').map(Number);
assert(isIP(control.hostname) === 4 && octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127, 'Dockhand must stay on its private Tailnet address');
// This existing Dockhand API has no extra HTTP credential; Tailscale controls access.
const base = control.origin;
const environment = Number(target.DOCKHAND_ENV_ID);
assert(Number.isInteger(environment) && environment > 0, 'Invalid Dockhand environment');
const publicOrigin = new URL(privateEnv.APP_ORIGIN).origin;
assert(publicOrigin.startsWith('https://'), 'Production needs HTTPS');
const releaseRoot = resolve(target.APP_RELEASE_ROOT);
assert(releaseRoot.startsWith(identity.home), 'Unexpected release directory');
mkdirSync(releaseRoot, { recursive: true });
assert(realpathSync(releaseRoot) === releaseRoot, 'Release root must not be a symlink');
const disk = statfsSync(releaseRoot);
assert(disk.bavail * disk.bsize >= 2 * 1024 ** 3, 'Insufficient free space for a safe app build');
const root = `${releaseRoot}/${revision}`;
const image = `${identity.container}:${revision}`;
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  assert(result.status === 0, `${command} failed`);
  return result.stdout;
};
const capture = (command, args) => run(command, args, {
  stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
}).trim();
const pause = () => new Promise(resolve => setTimeout(resolve, 2000));
async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', Origin: base },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  assert(response.ok, `Dockhand ${method} failed (${response.status})`);
  return response.json();
}
const stackPath = `/api/stacks/${identity.stack}/compose?env=${environment}`;
const original = (await request(stackPath)).content;
assert(original.includes('name: beatsmaxxer-pro'), 'Unexpected managed stack');
assert(original.includes('container_name: beatsmaxxer-pro-web'), 'Unexpected container');
assert(original.includes('pull_policy: never'), 'Managed image must stay local');
assert(/image: beatsmaxxer-pro-web:[a-z0-9-]+/.test(original), 'Unexpected image reference');
const previousImage = original.match(/image: (beatsmaxxer-pro-web:[a-z0-9-]+)/)[1];
capture('docker', ['image', 'inspect', previousImage, '--format', '{{.Id}}']);
if (existsSync(root)) {
  assert(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink(), 'Unsafe existing release path');
  const marker = JSON.parse(readFileSync(root + '/' + RELEASE_MARKER, 'utf8'));
  assert(marker.owner === RELEASE_OWNER && marker.revision === revision, 'Existing release cache is not owned by this app');
}
mkdirSync(root, { recursive: true });
writeFileSync(root + '/' + RELEASE_MARKER, JSON.stringify({ owner: RELEASE_OWNER, revision }));
const archive = spawnSync('git', ['archive', revision], { maxBuffer: 128 * 1024 * 1024 });
assert(archive.status === 0, 'Git export failed');
run('tar', ['-x', '-C', root], { input: archive.stdout, stdio: ['pipe', 'inherit', 'inherit'] });
writeFileSync(root + '/compose-before.yaml', original, { mode: 0o600 });
const dependencies = `${identity.dependencies}:${revision}`;
run('docker', ['build', '--target', 'dependencies', '-f', root + '/infra/app-vm/Dockerfile', '-t', dependencies, root]);
run('docker', ['run', '--rm', '--cpus=1', '--memory=4g', '-v', `${root}:/app`, '-w', '/app', dependencies,
  'sh', '-c', 'bun install --frozen-lockfile && bun run check && bun run test --maxWorkers=1 --minWorkers=1']);
run('docker', ['build', '--build-arg', `APP_REVISION=${revision}`, '--build-arg', 'ESSENTIA_API_BASE_URL', '--build-arg', `ESSENTIA_ANALYSIS_ENABLED=${analysisEnabled}`,
  '-f', root + '/infra/app-vm/Dockerfile', '-t', image, root], {
  env: { ...process.env, ESSENTIA_API_BASE_URL: privateEnv.ESSENTIA_API_BASE_URL ?? '' },
});

async function activate(content) {
  const saved = await request(stackPath, 'PUT', { content, restart: false });
  assert(saved.success, 'Managed Compose save failed');
  const deployed = await request(`/api/stacks/beatsmaxxer-pro/deploy?env=${environment}`, 'POST', {
    pull: false, build: false, forceRecreate: true,
  });
  if (deployed.jobId) {
    for (let attempt = 0; attempt < 90; attempt++) {
      const job = await request('/api/jobs/' + encodeURIComponent(deployed.jobId));
      if (job.status === 'done') { assert(job.result?.success === true, 'Managed deploy failed'); break; }
      assert(!['failed', 'cancelled', 'error'].includes(job.status), 'Managed deployment job failed');
      assert(attempt < 89, 'Managed deployment timed out');
      await pause();
    }
  } else assert(deployed.success, 'Managed deploy was not accepted');
  assert((await request(stackPath)).content === content, 'Managed Compose did not retain the image');
}
try {
  await activate(original.replace(/image: beatsmaxxer-pro-web:[a-z0-9-]+/, 'image: ' + image));
  await waitForHealthy(image, () => capture('docker', ['inspect', identity.container, '--format', '{{.Config.Image}} {{.State.Health.Status}}']), pause);
  const originHealth = JSON.parse(capture('docker', ['exec', 'beatsmaxxer-pro-web', 'bun', '-e',
    "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>r.text()).then(console.log)"]));
  assert(originHealth.revision === revision, 'Running revision differs');
  const publicHealth = await fetch(publicOrigin + '/health', { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  assert(publicHealth.ok && (await publicHealth.json()).revision === revision, 'Public revision differs');
  const gate = await fetch(publicOrigin + '/__api/gate', { signal: AbortSignal.timeout(30000) });
  assert(gate.ok, 'Public access gate unavailable');
  const session = await gate.json();
  assert(session.required === true && session.unlocked === false, 'Anonymous access gate failed');
  const media = await fetch(publicOrigin + '/__api/media/jobs/' + 'a'.repeat(64), {
    headers: { Origin: publicOrigin }, signal: AbortSignal.timeout(30000),
  });
  assert(media.status === 401, 'Anonymous media API is accessible');
  console.log(JSON.stringify({ revision, image, health: 'healthy', managed: true, publicRevisionMatches: true, privateMedia: true }));
} catch (error) {
  console.error('App verification failed; restoring the previous Dockhand image.');
  try {
    await activate(original);
    await waitForHealthy(previousImage, () => capture('docker', ['inspect', identity.container, '--format', '{{.Config.Image}} {{.State.Health.Status}}']), pause);
    console.error('Previous Dockhand app image is healthy again.');
  } catch (rollbackError) { console.error('Rollback verification failed: ' + rollbackError.message); }
  throw error;
}
// Cleanup is non-critical and runs only after the activation/rollback boundary.
try {
  const protectedRevisions = [revision, previousImage.split(':')[1], ...capture('docker', ['ps', '-a', '--format', '{{.Image}}'])
    .split('\n').filter(name => name.startsWith(identity.container + ':') || name.startsWith(identity.dependencies + ':')).map(name => name.split(':')[1])];
  const retired = await pruneReleaseCache(releaseRoot, protectedRevisions, async stale => {
    for (const prefix of [identity.container, identity.dependencies]) {
      const tag = `${prefix}:${stale}`;
      const present = spawnSync('docker', ['image', 'inspect', tag], { stdio: 'ignore' });
      if (present.status === 0 && spawnSync('docker', ['image', 'rm', tag], { stdio: 'ignore' }).status !== 0) return false;
    }
    return true;
  });
  console.log(JSON.stringify({ retiredReleaseCaches: retired, retainedNewest: 7, rollbackProtected: true }));
} catch (cleanupError) { console.error('Release-cache cleanup deferred: ' + cleanupError.message); }
