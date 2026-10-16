import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, utimes, access, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { RELEASE_MARKER, RELEASE_OWNER, parseRawEnv, requireEnvKeys, waitForHealthy, pruneReleaseCache, withPublicDemoMount, validatePublicDemoDirectory, verifyStagedDemoBundle, verifyPublishedDemoAssets } from '../../../../scripts/deploySupport.mjs';

describe('deployment safety', () => {
  it('rejects relative demo roots before any filesystem checks', () => {
    expect(()=>validatePublicDemoDirectory('demo-media')).toThrow('Invalid public demo directory');
    expect(validatePublicDemoDirectory('/srv/reviewed-demo')).toBe('/srv/reviewed-demo');
  });
  it('rejects missing or changed staged assets even when their catalog is present', async () => {
    const root=await mkdtemp(join(tmpdir(),'beatsmaxxer-public-demo-test-'));
    const asset=(name:string,bytes:string)=>{const sha256=createHash('sha256').update(bytes).digest('hex');return {name,path:`/demo-media/${sha256}.mp4`,sha256,size:bytes.length,type:'video/mp4'};};
    const a=asset('first.mp4','first'),b=asset('later.mp4','later');
    const catalog={song:a,analysis:a,midi:a,structure:a,clips:[b]};
    const file=(item:typeof a)=>join(root,item.path.split('/').at(-1)!);
    try{
      await writeFile(join(root,'manifest.json'),JSON.stringify(catalog));await writeFile(file(a),'first');await writeFile(file(b),'later');
      await verifyStagedDemoBundle(root,catalog);
      await writeFile(file(b),'other');await expect(verifyStagedDemoBundle(root,catalog)).rejects.toThrow('failed verification: later.mp4');
      await rm(file(b));await expect(verifyStagedDemoBundle(root,catalog)).rejects.toThrow();
    }finally{
      expect(root.startsWith(join(tmpdir(),'beatsmaxxer-public-demo-test-'))).toBe(true);
      await rm(root,{recursive:true,force:true});
    }
  });
  it('checks every published asset and rejects unavailable or wrong-size responses',async()=>{
    const catalog=JSON.parse(readFileSync(new URL('../../../../svelte/src/lib/runtime/publicDemo.json',import.meta.url),'utf8'));
    const assets=[catalog.song,catalog.analysis,catalog.midi,catalog.structure,...catalog.clips];
    const request=vi.fn(async(url:Parameters<typeof fetch>[0])=>{const asset=assets.find(a=>String(url).endsWith(a.path))!;return new Response(null,{headers:{'content-length':String(asset.size),'content-type':asset.type}})});
    await verifyPublishedDemoAssets('https://app.test',catalog,request);
    expect(request).toHaveBeenCalledTimes(14);expect(request.mock.calls.every(call=>String(call[0]).startsWith('https://app.test/demo-media/'))).toBe(true);
    await expect(verifyPublishedDemoAssets('https://app.test',catalog,async()=>new Response(null,{status:404}))).rejects.toThrow('unavailable or changed');
    await expect(verifyPublishedDemoAssets('https://app.test',catalog,async()=>new Response(null,{headers:{'content-length':'1','content-type':'video/mp4'}}))).rejects.toThrow('unavailable or changed');
  });
  it('normalizes the committed demo mount template to the directory actually verified by deployment', () => {
    const template = readFileSync(new URL('../../../../infra/app-vm/dockhand-compose.yaml', import.meta.url), 'utf8');
    for (const root of ['/opt/beatsmaxxer-pro/demo-media', '/srv/reviewed-demo']) {
      const result = withPublicDemoMount(template, root);
      expect(result).toContain(`      - ${root}:/app/demo-media:ro`);
      expect(result).not.toContain('${DEMO_MEDIA_DIR:-');
      expect(withPublicDemoMount(result, root)).toBe(result);
      expect(() => withPublicDemoMount(result.replace(':/app/demo-media:ro', ':/app/demo-media:rw'), root)).toThrow('Unexpected existing demo mount');
      expect(() => withPublicDemoMount(result.replace('    volumes:', `    volumes:\n      - ${root}:/app/demo-media:ro`), root)).toThrow('Unexpected existing demo mount');
      expect(() => withPublicDemoMount(template.replace('${DEMO_MEDIA_DIR:-', '${UNREVIEWED:-'), root)).toThrow('Unexpected existing demo mount');
    }
  });
  it('adds one read-only demo mount without changing worker services or existing app volumes', () => {
    const original = 'name: beatsmaxxer-pro\nservices:\n  app:\n    image: app:old\n    volumes:\n      - old-data:/work\n    environment:\n      APP_ORIGIN: ${APP_ORIGIN}\n  worker:\n    volumes:\n      - queue:/work\n';
    const next = withPublicDemoMount(original, '/opt/beatsmaxxer-pro/demo-media');
    expect(next).toContain('      - old-data:/work');
    expect(next).toContain('      - /opt/beatsmaxxer-pro/demo-media:/app/demo-media:ro');
    expect(next).toContain('      DEMO_MEDIA_ROOT: /app/demo-media');
    expect(next.split('  worker:')[1]).toBe(original.split('  worker:')[1]);
    expect(withPublicDemoMount(next, '/opt/beatsmaxxer-pro/demo-media')).toBe(next);
    expect(() => withPublicDemoMount(original, '/tmp/media:rw')).toThrow();
    expect(() => withPublicDemoMount(next, '/another-folder')).toThrow('Unexpected existing demo mount');
    expect(withPublicDemoMount(original.replace('    volumes:', '    volumes:\n      # - /old:/app/demo-media:ro'), '/opt/beatsmaxxer-pro/demo-media')).toContain('      - /opt/beatsmaxxer-pro/demo-media:/app/demo-media:ro');
    expect(()=>withPublicDemoMount(original.replace('      APP_ORIGIN: ${APP_ORIGIN}', '      - APP_ORIGIN=${APP_ORIGIN}'), '/opt/beatsmaxxer-pro/demo-media')).toThrow('environment must use map form');
  });
  it('normalizes raw env keys and reports missing names without values', () => {
    const env = parseRawEnv('# comment\n PIN = private=value\n EMPTY=\n');
    expect(env.PIN).toBe('private=value');
    expect(() => requireEnvKeys(env, ['EMPTY'], 'private.env')).toThrow('private.env: EMPTY is required');
  });
  it('waits through recreation and rejects a healthy previous image', async () => {
    let attempts = 0;
    await waitForHealthy('app:new', () => {
      attempts++;
      if (attempts === 1) throw new Error('missing');
      return attempts === 2 ? 'app:old healthy' : 'app:new healthy';
    }, async () => {}, 3);
    expect(attempts).toBe(3);
    await expect(waitForHealthy('app:new', () => 'app:old healthy', async () => {}, 2)).rejects.toThrow('health budget');
  });
  it('preserves rollback, newest caches and foreign or linked directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'beatsmaxxer-cache-test-'));
    const revisions = [1, 2, 3, 4, 5].map(n => n.toString(16).padStart(40, '0'));
    try {
      for (let i = 0; i < revisions.length; i++) {
        const path = join(root, revisions[i]);
        await mkdir(path);
        await writeFile(join(path, RELEASE_MARKER), JSON.stringify({ owner: RELEASE_OWNER, revision: revisions[i] }));
        await utimes(path, i + 1, i + 1);
      }
      const foreign = 'f'.repeat(40), linked = 'e'.repeat(40);
      await mkdir(join(root, foreign));
      await symlink(join(root, revisions[4]), join(root, linked), 'dir');
      const retired: string[] = [];
      expect(await pruneReleaseCache(root, [revisions[0]], async (revision: string) => { retired.push(revision); return true; }, 2)).toBe(2);
      expect(retired.sort()).toEqual([revisions[1], revisions[2]].sort());
      for (const revision of [revisions[0], revisions[3], revisions[4], foreign, linked]) await access(join(root, revision));
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('keeps a cache when its image cannot be retired', async () => {
    const root = await mkdtemp(join(tmpdir(), 'beatsmaxxer-cache-test-'));
    try {
      for (let n = 1; n <= 3; n++) {
        const revision = String(n).padStart(40, '0'), path = join(root, revision);
        await mkdir(path);
        await writeFile(join(path, RELEASE_MARKER), JSON.stringify({ owner: RELEASE_OWNER, revision }));
        await utimes(path, n, n);
      }
      expect(await pruneReleaseCache(root, [], async () => false, 2)).toBe(0);
      await access(join(root, '1'.padStart(40, '0')));
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
