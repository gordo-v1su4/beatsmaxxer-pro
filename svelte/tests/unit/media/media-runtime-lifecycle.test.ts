import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { ClipRegistry } from '$lib/media/ClipRegistry';
import { MediaRuntime } from '$lib/runtime/media/MediaRuntime';
import { get } from 'svelte/store';
import { timingActive, timingSettings, parseTimingSettings, timingClipRestrictions } from '$lib/stores/timing';
import * as interpolation from '$lib/runtime/timing/interpolation';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createHarness(prepareVideo: (id: string, url: string) => Promise<HTMLVideoElement>,residentReady?: (source:File|string)=>boolean,residentFactor?: (source:File|string)=>number|null) {
  const published: Array<{ id: string; url: string | null }> = [];
  let token = 0;
  const pool = {
    prepare: vi.fn(async (id: string, url: string) => ({
      moduleId: id,
      url,
      token: ++token,
      video: await prepareVideo(id, url),
      generation: 0
    })),
    prewarmCandidate: vi.fn(async () => {}),
    parkCandidate: vi.fn(async () => {}),
    commitCandidate: vi.fn((candidate) => ({
      video: candidate.video,
      previousReleased: Promise.resolve()
    })),
    discardCandidate: vi.fn(async () => {}),
    prewarm: vi.fn(async () => {}),
    markFreeRun: vi.fn(),
    detach: vi.fn(async () => {}),
    dispose: vi.fn(async () => {})
  };
  const runtime = new MediaRuntime({
    clipRegistry: new ClipRegistry(),
    pool,
    residentFactor:residentFactor??(residentReady?source=>residentReady(source)?1:null:undefined),
    decks: {
      lifecycle: () => undefined,
      upsert: () => ({}) as never,
      dispose: vi.fn()
    },
    publish: (id, clip) => published.push({ id, url: clip?.url ?? null })
  });
  return { runtime, pool, published };
}

describe('MediaRuntime clip transactions', () => {
  const create = vi.spyOn(URL, 'createObjectURL');
  const revoke = vi.spyOn(URL, 'revokeObjectURL');

  beforeEach(() => {
    timingActive.set(false);
    timingSettings.set({...parseTimingSettings(null),scope:'deck'});
    create.mockReset();
    revoke.mockReset();
    let id = 0;
    create.mockImplementation(() => `blob:runtime-${++id}`);
  });

  afterAll(() => {
    create.mockRestore();
    revoke.mockRestore();
  });

  test('replacing a clip preserves the slot clock instead of marking it free-running again', async () => {
    const {runtime,pool} = createHarness(async()=>({} as HTMLVideoElement));
    try {
      await runtime.registerModuleFileClip('top-1',new File(['first'],'first.mp4'));
      expect(pool.markFreeRun).toHaveBeenCalledOnce();
      pool.markFreeRun.mockClear();
      await runtime.registerModuleFileClip('top-1',new File(['next'],'next.mp4'));
      expect(pool.markFreeRun).not.toHaveBeenCalled();
      expect(pool.commitCandidate).toHaveBeenCalledTimes(2);
    } finally { await runtime.dispose(); }
  });

  test('a prepared scene transfers its staged URL and decoder without decoding twice', async () => {
    const { runtime, pool, published } = createHarness(async () => ({} as HTMLVideoElement));
    const old = new File(['old'], 'old.mp4'), next = new File(['next'], 'next.mp4');
    try {
      await runtime.registerModuleFileClip('top-0', old);
      runtime.prepareUpcomingScene('chorus', [{ slotId: 'top-0', clip: { name: next.name, url: '', file: next } }], 40);
      await vi.waitFor(() => expect(runtime.upcomingSceneSnapshot.ready).toBe(1));
      expect(published).toHaveLength(1);
      expect(runtime.clipRegistry.get('top-0')?.file).toBe(old);
      expect(pool.prepare).toHaveBeenCalledTimes(2);
      const prepared = await pool.prepare.mock.results[1].value;
      await expect(runtime.registerModuleFileClip('top-0', next)).resolves.toMatchObject({ status: 'success' });
      expect(pool.prepare).toHaveBeenCalledTimes(2);
      expect(pool.commitCandidate.mock.calls[1][0]).toBe(prepared);
      await runtime.clearUpcomingScene();
      expect(runtime.clipRegistry.get('top-0')?.file).toBe(next);
      expect(revoke).not.toHaveBeenCalledWith(prepared.url);
    } finally { await runtime.dispose(); }
  });

  test('superseding a claimed scene releases its decoder and staged URL', async () => {
    const { runtime, pool } = createHarness(async () => ({} as HTMLVideoElement));
    const next = new File(['next'], 'next.mp4'), manual = new File(['manual'], 'manual.mp4');
    try {
      runtime.prepareUpcomingScene('chorus', [{ slotId: 'top-0', clip: { name: next.name, url: '', file: next } }], 40);
      await vi.waitFor(() => expect(runtime.upcomingSceneSnapshot.ready).toBe(1));
      const prepared = await pool.prepare.mock.results[0].value;
      const recalled = runtime.registerModuleFileClip('top-0', next);
      const replacement = runtime.registerModuleFileClip('top-0', manual);
      await expect(recalled).resolves.toMatchObject({ status: 'superseded' });
      await expect(replacement).resolves.toMatchObject({ status: 'success' });
      expect(pool.discardCandidate).toHaveBeenCalledWith(prepared);
      expect(revoke).toHaveBeenCalledWith(prepared.url);
      expect(runtime.clipRegistry.get('top-0')?.file).toBe(manual);
    } finally { await runtime.dispose(); }
  });

  test('rejects a verified RIFE replacement in Stutter without decoding or replacing the original', async () => {
    const {runtime,pool,published}=createHarness(async()=>({} as HTMLVideoElement));
    await runtime.registerModuleFileClip('top-1',new File(['original'],'original.mp4'));
    const previous=runtime.clipRegistry.get('top-1');
    timingActive.set(true);
    const identify=vi.spyOn(interpolation,'identifyInterpolation').mockResolvedValue(4);
    try {
      const result=await runtime.registerModuleFileClip('top-1',new File(['rife'],'renamed.mp4'));
      expect(result).toMatchObject({status:'failed',error:expect.stringContaining('Speedramp slot')});
      expect(runtime.clipRegistry.get('top-1')).toBe(previous);
      expect(pool.prepare).toHaveBeenCalledTimes(1);
      expect(published).toHaveLength(1);
      expect(get(timingClipRestrictions)['top-1']).toContain('Speedramp slot');
    } finally { identify.mockRestore(); timingActive.set(false); }
  });

  test('publishes a verified resident clip before its HTML video is ready',async()=>{
    const pending=deferred<HTMLVideoElement>();
    const file=new File(['resident'],'resident.mp4');
    const {runtime,pool,published}=createHarness(()=>pending.promise,source=>source===file);
    timingActive.set(true);
    const identify=vi.spyOn(interpolation,'identifyInterpolation').mockResolvedValue(1);
    try{
      const registering=runtime.registerModuleFileClip('top-1',file);
      await vi.waitFor(()=>expect(pool.prepare).toHaveBeenCalledOnce());
      expect(published).toEqual([{id:'top-1',url:'blob:runtime-1'}]);
      expect(runtime.clipRegistry.get('top-1')?.file).toBe(file);
      expect(pool.commitCandidate).not.toHaveBeenCalled();
      pending.resolve({} as HTMLVideoElement);
      await expect(registering).resolves.toMatchObject({status:'success'});
      expect(published).toHaveLength(1);
    }finally{identify.mockRestore();timingActive.set(false);}
  });

  test('publishes a ready verified bank synchronously without repeating verification',async()=>{
    const pending=deferred<HTMLVideoElement>();
    const file=new File(['ready'],'ready.mp4');
    const {runtime,published}=createHarness(()=>pending.promise,undefined,source=>source===file?1:null);
    timingActive.set(true);
    const identify=vi.spyOn(interpolation,'identifyInterpolation').mockResolvedValue(1);
    try{
      const result=runtime.registerModuleFileClip('top-1',file);
      expect(published).toEqual([{id:'top-1',url:'blob:runtime-1'}]);
      expect(identify).not.toHaveBeenCalled();
      pending.resolve({} as HTMLVideoElement);
      await expect(result).resolves.toMatchObject({status:'success'});
    }finally{pending.resolve({} as HTMLVideoElement);identify.mockRestore();timingActive.set(false);}
  });

  test('recalling the same verified resident file preserves the registered layer and URL',async()=>{
    const file=new File(['ready'],'same.mp4');
    const {runtime,pool,published}=createHarness(async()=>({} as HTMLVideoElement),undefined,source=>source===file?1:null);
    timingActive.set(true);
    const identify=vi.spyOn(interpolation,'identifyInterpolation').mockResolvedValue(1);
    try{
      await runtime.registerModuleFileClip('top-1',file);
      const clip=runtime.clipRegistry.get('top-1');
      await expect(runtime.registerModuleFileClip('top-1',file)).resolves.toMatchObject({status:'success',clip});
      expect(runtime.clipRegistry.get('top-1')).toBe(clip);
      expect(published).toHaveLength(1);
      expect(pool.prepare).toHaveBeenCalledOnce();
      expect(create).toHaveBeenCalledOnce();
    }finally{identify.mockRestore();timingActive.set(false);}
  });

  test('an immediate repeated recall still attaches the current resident clip to the HTML pool',async()=>{
    const file=new File(['ready'],'same.mp4');
    const {runtime,pool}=createHarness(async()=>({} as HTMLVideoElement),undefined,source=>source===file?1:null);
    timingActive.set(true);
    try{
      const first=runtime.registerModuleFileClip('top-1',file);
      await expect(runtime.registerModuleFileClip('top-1',file)).resolves.toMatchObject({status:'success'});
      await first;
      expect(pool.commitCandidate).toHaveBeenCalledOnce();
    }finally{timingActive.set(false);}
  });

  test('recalling the mounted file supersedes a pending replacement without remounting',async()=>{
    const file=new File(['ready'],'same.mp4'),pending=deferred<HTMLVideoElement>();let calls=0;
    const {runtime,pool,published}=createHarness(async()=>++calls===2?pending.promise:{} as HTMLVideoElement,undefined,source=>source===file?1:null);
    timingActive.set(true);
    const identify=vi.spyOn(interpolation,'identifyInterpolation').mockResolvedValue(1);
    try{
      await runtime.registerModuleFileClip('top-1',file);
      const clip=runtime.clipRegistry.get('top-1');
      const replacement=runtime.registerModuleFileClip('top-1',new File(['other'],'other.mp4'));
      await vi.waitFor(()=>expect(pool.prepare).toHaveBeenCalledTimes(2));
      await expect(runtime.registerModuleFileClip('top-1',file)).resolves.toMatchObject({status:'success',clip});
      pending.resolve({} as HTMLVideoElement);
      await expect(replacement).resolves.toMatchObject({status:'superseded'});
      expect(runtime.clipRegistry.get('top-1')).toBe(clip);
      expect(published).toHaveLength(1);
      expect(pool.commitCandidate).toHaveBeenCalledOnce();
      expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:runtime-2');
    }finally{pending.resolve({} as HTMLVideoElement);identify.mockRestore();timingActive.set(false);}
  });

  test('restores the previous committed resident source if HTML attachment fails',async()=>{
    const pending=deferred<HTMLVideoElement>();let calls=0;
    const file=new File(['resident'],'new.mp4');
    const {runtime,published}=createHarness(async()=>++calls===1?{} as HTMLVideoElement:pending.promise,source=>source===file);
    await runtime.registerModuleFileClip('top-1',new File(['old'],'old.mp4'));
    const previous=runtime.clipRegistry.get('top-1');
    timingActive.set(true);
    const identify=vi.spyOn(interpolation,'identifyInterpolation').mockResolvedValue(1);
    try{
      const registering=runtime.registerModuleFileClip('top-1',file);
      await vi.waitFor(()=>expect(published).toHaveLength(2));
      pending.reject(new Error('decode-failed'));
      await expect(registering).resolves.toMatchObject({status:'failed'});
      expect(runtime.clipRegistry.get('top-1')).toBe(previous);
      expect(published).toEqual([{id:'top-1',url:'blob:runtime-1'},{id:'top-1',url:'blob:runtime-2'},{id:'top-1',url:'blob:runtime-1'}]);
      expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:runtime-2');
    }finally{identify.mockRestore();timingActive.set(false);}
  });

  test('superseded resident publication cannot restore an older clip or leak pool URLs',async()=>{
    const pending=deferred<HTMLVideoElement>();let calls=0;
    const {runtime,pool,published}=createHarness(async()=>++calls===2?pending.promise:{} as HTMLVideoElement,()=>true);
    await runtime.registerModuleFileClip('top-1',new File(['old'],'old.mp4'));
    timingActive.set(true);
    const identify=vi.spyOn(interpolation,'identifyInterpolation').mockResolvedValue(1);
    try{
      const first=runtime.registerModuleFileClip('top-1',new File(['a'],'a.mp4'));
      await vi.waitFor(()=>expect(published).toHaveLength(2));
      await vi.waitFor(()=>expect(pool.prepare).toHaveBeenCalledTimes(2));
      const second=runtime.registerModuleFileClip('top-1',new File(['b'],'b.mp4'));
      await vi.waitFor(()=>expect(published).toHaveLength(3));
      expect(runtime.clipRegistry.get('top-1')?.name).toBe('b.mp4');
      // HTML attachments remain serialized, while the prepared GPU source lands.
      expect(pool.prepare).toHaveBeenCalledTimes(2);
      pending.resolve({} as HTMLVideoElement);
      await expect(first).resolves.toMatchObject({status:'superseded'});
      await expect(second).resolves.toMatchObject({status:'success'});
      expect(runtime.clipRegistry.get('top-1')?.name).toBe('b.mp4');
      expect(published.map(value=>value.url)).toEqual(['blob:runtime-1','blob:runtime-2','blob:runtime-3']);
      expect(pool.discardCandidate).toHaveBeenCalledOnce();
      expect(revoke.mock.calls.map(call=>call[0]).sort()).toEqual(['blob:runtime-1','blob:runtime-2']);
    }finally{identify.mockRestore();timingActive.set(false);}
  });

  test('clearing an early resident commit prevents late publication',async()=>{
    const pending=deferred<HTMLVideoElement>();
    const {runtime,pool,published}=createHarness(()=>pending.promise,()=>true);
    timingActive.set(true);
    const identify=vi.spyOn(interpolation,'identifyInterpolation').mockResolvedValue(1);
    try{
      const registering=runtime.registerModuleFileClip('top-1',new File(['a'],'a.mp4'));
      await vi.waitFor(()=>expect(published).toHaveLength(1));
      await vi.waitFor(()=>expect(pool.prepare).toHaveBeenCalledOnce());
      await runtime.removeModuleClip('top-1');
      pending.resolve({} as HTMLVideoElement);
      await expect(registering).resolves.toMatchObject({status:'superseded'});
      expect(runtime.clipRegistry.get('top-1')).toBeNull();
      expect(published.map(value=>value.url)).toEqual(['blob:runtime-1',null]);
      expect(pool.discardCandidate).toHaveBeenCalledOnce();
      expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:runtime-1');
    }finally{identify.mockRestore();timingActive.set(false);}
  });

  test('allows verified RIFE in Speedramp and original clips in Stutter', async () => {
    const {runtime}=createHarness(async()=>({} as HTMLVideoElement));
    timingActive.set(true);
    const identify=vi.spyOn(interpolation,'identifyInterpolation').mockResolvedValueOnce(4).mockResolvedValueOnce(1);
    try {
      await expect(runtime.registerModuleFileClip('top-0',new File(['rife'],'rife.mp4'))).resolves.toMatchObject({status:'success'});
      await expect(runtime.registerModuleFileClip('top-1',new File(['original'],'original.mp4'))).resolves.toMatchObject({status:'success'});
    } finally { identify.mockRestore(); timingActive.set(false); }
  });

  test('publishes only the committed registry URL and preserves it when replacement fails', async () => {
    let fail = false;
    const { runtime, published } = createHarness(async () => {
      if (fail) throw new Error('decode-failed');
      return {} as HTMLVideoElement;
    });

    const first = await runtime.registerModuleFileClip('fx', new File(['a'], 'a.mp4'));
    fail = true;
    const second = await runtime.registerModuleFileClip('fx', new File(['b'], 'b.mp4'));

    expect(first.status).toBe('success');
    expect(second).toMatchObject({ status: 'failed', error: 'Error: decode-failed' });
    expect(runtime.clipRegistry.get('fx')?.url).toBe('blob:runtime-1');
    expect(published).toEqual([{ id: 'fx', url: 'blob:runtime-1' }]);
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:runtime-2');
  });

  test('returns superseded and commits only the newest concurrent request', async () => {
    const firstAttach = deferred<HTMLVideoElement>();
    let calls = 0;
    const { runtime, pool, published } = createHarness(async () => {
      calls += 1;
      return calls === 1 ? firstAttach.promise : ({} as HTMLVideoElement);
    });

    const first = runtime.registerModuleFileClip('fx', new File(['a'], 'a.mp4'));
    await vi.waitFor(() => expect(pool.prepare).toHaveBeenCalledTimes(1));
    const second = runtime.registerModuleFileClip('fx', new File(['b'], 'b.mp4'));
    firstAttach.resolve({} as HTMLVideoElement);

    await expect(first).resolves.toMatchObject({ status: 'superseded' });
    await expect(second).resolves.toMatchObject({ status: 'success' });
    expect(runtime.clipRegistry.get('fx')?.url).toBe('blob:runtime-2');
    expect(published).toEqual([{ id: 'fx', url: 'blob:runtime-2' }]);
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:runtime-1');
  });

  test('waits for replaced element destruction before revoking its registry URL', async () => {
    const release = deferred<void>();
    const { runtime, pool, published } = createHarness(async () => ({} as HTMLVideoElement));
    await runtime.registerModuleFileClip('fx', new File(['a'], 'a.mp4'));
    pool.commitCandidate.mockImplementationOnce((candidate) => ({
      video: candidate.video,
      previousReleased: release.promise
    }));

    const replacement = runtime.registerModuleFileClip('fx', new File(['b'], 'b.mp4'));
    await vi.waitFor(() => expect(published).toHaveLength(2));
    expect(revoke).not.toHaveBeenCalled();

    release.resolve();
    await expect(replacement).resolves.toMatchObject({ status: 'success' });
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:runtime-1');
  });

  test('clear during attach invalidates completion and eventually revokes once', async () => {
    const pending = deferred<HTMLVideoElement>();
    const { runtime, pool, published } = createHarness(() => pending.promise);
    const result = runtime.registerModuleFileClip('fx', new File(['a'], 'a.mp4'));
    await vi.waitFor(() => expect(pool.prepare).toHaveBeenCalledOnce());

    runtime.removeModuleClip('fx');
    pending.resolve({} as HTMLVideoElement);

    await expect(result).resolves.toMatchObject({ status: 'superseded' });
    expect(runtime.clipRegistry.get('fx')).toBeNull();
    expect(published).toEqual([{ id: 'fx', url: null }]);
    expect(pool.detach).toHaveBeenCalledOnce();
    expect(pool.discardCandidate).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:runtime-1');
  });

  test('dispose is idempotent and invalidates an in-flight attach', async () => {
    const pending = deferred<HTMLVideoElement>();
    const { runtime, pool } = createHarness(() => pending.promise);
    const result = runtime.registerModuleFileClip('fx', new File(['a'], 'a.mp4'));
    await vi.waitFor(() => expect(pool.prepare).toHaveBeenCalledOnce());

    runtime.dispose();
    runtime.dispose();
    pending.resolve({} as HTMLVideoElement);

    await expect(result).resolves.toMatchObject({ status: 'superseded' });
    expect(pool.dispose).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:runtime-1');
  });

  test('accepts a fresh registration after completed singleton-style disposal', async () => {
    const { runtime, pool, published } = createHarness(async () => ({} as HTMLVideoElement));
    await runtime.registerModuleFileClip('fx', new File(['a'], 'a.mp4'));
    await runtime.dispose();
    await runtime.dispose();

    const remounted = await runtime.registerModuleFileClip('fx', new File(['b'], 'b.mp4'));

    expect(remounted).toMatchObject({ status: 'success' });
    expect(runtime.clipRegistry.get('fx')?.url).toBe('blob:runtime-2');
    expect(pool.dispose).toHaveBeenCalledOnce();
    expect(published).toEqual([
      { id: 'fx', url: 'blob:runtime-1' },
      { id: 'fx', url: null },
      { id: 'fx', url: 'blob:runtime-2' }
    ]);
  });

  test('queues remount registration until an in-progress disposal completes', async () => {
    const disposal = deferred<void>();
    const { runtime, pool } = createHarness(async () => ({} as HTMLVideoElement));
    await runtime.registerModuleFileClip('fx', new File(['a'], 'a.mp4'));
    pool.dispose.mockImplementationOnce(() => disposal.promise);

    const disposing = runtime.dispose();
    const remounted = runtime.registerModuleFileClip('fx', new File(['b'], 'b.mp4'));
    expect(pool.prepare).toHaveBeenCalledOnce();

    disposal.resolve();
    await disposing;
    await expect(remounted).resolves.toMatchObject({ status: 'success' });
    expect(pool.prepare).toHaveBeenCalledTimes(2);
    expect(runtime.clipRegistry.get('fx')?.url).toBe('blob:runtime-2');
  });
});
