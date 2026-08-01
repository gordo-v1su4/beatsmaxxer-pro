import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { ClipRegistry } from '$lib/media/ClipRegistry';
import { MediaRuntime } from '$lib/runtime/media/MediaRuntime';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createHarness(prepareVideo: (id: string, url: string) => Promise<HTMLVideoElement>) {
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
    create.mockReset();
    revoke.mockReset();
    let id = 0;
    create.mockImplementation(() => `blob:runtime-${++id}`);
  });

  afterAll(() => {
    create.mockRestore();
    revoke.mockRestore();
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
