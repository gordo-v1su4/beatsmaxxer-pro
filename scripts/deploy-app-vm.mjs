import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const revision = process.argv[2];
assert(/^[a-f0-9]{40}$/.test(revision ?? ''), 'Expected a full committed revision');
assert(process.env.GITHUB_REF === 'refs/heads/main', 'Deploy only main');
const readEnv = path => Object.fromEntries(readFileSync(path, 'utf8').split('\n')
  .filter(line => line.trim() && !line.startsWith('#') && line.includes('='))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]));
const target = readEnv('/opt/beatsmaxxer-pro/deploy.env');
const privateEnv = readEnv('/opt/beatsmaxxer-pro/private.env');
const base = new URL(target.DOCKHAND_URL).origin;
const environment = Number(target.DOCKHAND_ENV_ID);
assert(Number.isInteger(environment) && environment > 0, 'Invalid Dockhand environment');
const publicOrigin = new URL(privateEnv.APP_ORIGIN).origin;
assert(publicOrigin.startsWith('https://'), 'Production needs HTTPS');
const root = `${target.APP_RELEASE_ROOT}/${revision}`;
assert(root.startsWith('/home/gordo/'), 'Unexpected release directory');
const image = `beatsmaxxer-pro-web:${revision}`;
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
const stackPath = `/api/stacks/beatsmaxxer-pro/compose?env=${environment}`;
const original = (await request(stackPath)).content;
assert(original.includes('name: beatsmaxxer-pro'), 'Unexpected managed stack');
assert(original.includes('container_name: beatsmaxxer-pro-web'), 'Unexpected container');
assert(original.includes('pull_policy: never'), 'Managed image must stay local');
assert(/image: beatsmaxxer-pro-web:[a-z0-9-]+/.test(original), 'Unexpected image reference');
mkdirSync(root, { recursive: true });
const archive = spawnSync('git', ['archive', revision], { maxBuffer: 128 * 1024 * 1024 });
assert(archive.status === 0, 'Git export failed');
run('tar', ['-x', '-C', root], { input: archive.stdout, stdio: ['pipe', 'inherit', 'inherit'] });
writeFileSync(root + '/compose-before.yaml', original);
const dependencies = `beatsmaxxer-deploy-dependencies:${revision}`;
run('docker', ['build', '--target', 'dependencies', '-f', root + '/infra/app-vm/Dockerfile', '-t', dependencies, root]);
run('docker', ['run', '--rm', '--cpus=1', '--memory=4g', '-v', `${root}:/app`, '-w', '/app', dependencies,
  'sh', '-c', 'bun install --frozen-lockfile && bun run check && bun run test --maxWorkers=1 --minWorkers=1']);
run('docker', ['build', '--build-arg', `APP_REVISION=${revision}`, '--build-arg', 'ESSENTIA_API_BASE_URL',
  '-f', root + '/infra/app-vm/Dockerfile', '-t', image, root], {
  env: { ...process.env, ESSENTIA_API_BASE_URL: privateEnv.ESSENTIA_API_BASE_URL },
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
      if (job.status === 'done') { assert(job.result?.success !== false, 'Managed deploy failed'); break; }
      assert(!['failed', 'cancelled'].includes(job.status), 'Managed deployment job failed');
      assert(attempt < 89, 'Managed deployment timed out');
      await pause();
    }
  } else assert(deployed.success, 'Managed deploy was not accepted');
  assert((await request(stackPath)).content === content, 'Managed Compose did not retain the image');
}
try {
  await activate(original.replace(/image: beatsmaxxer-pro-web:[a-z0-9-]+/, 'image: ' + image));
  let healthy = false;
  for (let attempt = 0; attempt < 45; attempt++) {
    const state = capture('docker', ['inspect', 'beatsmaxxer-pro-web', '--format', '{{.Config.Image}} {{.State.Health.Status}}']);
    if (state === `${image} healthy`) { healthy = true; break; }
    await pause();
  }
  assert(healthy, 'New app did not become healthy');
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
  await activate(original);
  throw error;
}
