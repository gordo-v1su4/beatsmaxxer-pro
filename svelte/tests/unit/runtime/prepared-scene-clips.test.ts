import { afterEach, expect, test, vi } from 'vitest';
import { ClipRegistry } from '$lib/media/ClipRegistry';
import type { VideoCandidate } from '$lib/media/VideoPool';
import { PreparedSceneClips } from '$lib/runtime/media/PreparedSceneClips';

afterEach(() => vi.restoreAllMocks());
const source = (id: string) => ({ slotId: id, clip: { name: `${id}.mp4`, url: `https://example.test/${id}.mp4` } });
const candidate = (id: string, url: string): VideoCandidate => ({ moduleId: id, url,
  token: 1, generation: 0, video: {} as HTMLVideoElement });

test('prepares one decoder at a time and leaves current clips authoritative until claim', async () => {
  const registry = new ClipRegistry();
  const current = registry.registerUrl('top-0', 'old', 'https://example.test/old.mp4');
  let release!: () => void;
  const pool = { prepare: vi.fn(async (id: string, url: string) => candidate(id, url)),
    parkCandidate: vi.fn(() => new Promise<void>(r => { release = r; })),
    discardCandidate: vi.fn(async () => {}) };
  const prepared = new PreparedSceneClips(registry, pool);
  prepared.stage('next', [source('top-0'), source('top-1')], 40);
  await vi.waitFor(() => expect(pool.parkCandidate).toHaveBeenCalledTimes(1));
  expect(pool.prepare).toHaveBeenCalledTimes(1);
  expect(registry.get('top-0')).toBe(current);
  release();
  await vi.waitFor(() => expect(pool.parkCandidate).toHaveBeenCalledTimes(2));
  release();
  await vi.waitFor(() => expect(prepared.diagnostics.ready).toBe(2));
  const clip = prepared.take('top-0', source('top-0').clip.url)!;
  expect(clip.url).toBe(source('top-0').clip.url);
  expect(prepared.candidateFor(clip)).toBeDefined();
  expect(registry.get('top-0')).toBe(current);
  registry.commit(clip);
  expect(registry.get('top-0')).toBe(clip);
  await prepared.releaseTransfer(clip);
  await prepared.clear();
});

test('repeating a plan does not create duplicate decoders or staged URLs', async () => {
  const registry = new ClipRegistry(), stage = vi.spyOn(registry, 'stageUrl');
  const pool = { prepare: vi.fn(async (id: string, url: string) => candidate(id, url)),
    parkCandidate: vi.fn(async () => {}), discardCandidate: vi.fn(async () => {}) };
  const prepared = new PreparedSceneClips(registry, pool), clips = [source('top-0')];
  prepared.stage('next', clips, 40);
  await vi.waitFor(() => expect(prepared.diagnostics.ready).toBe(1));
  prepared.stage('next', clips, 40);
  expect(stage).toHaveBeenCalledTimes(1);
  expect(pool.prepare).toHaveBeenCalledTimes(1);
  await prepared.clear();
});

test('cancels stale pending preparation without touching the current clip', async () => {
  const registry = new ClipRegistry();
  const current = registry.registerUrl('top-0', 'old', 'https://example.test/old.mp4');
  let aborted = false;
  const pool = { prepare: vi.fn((_id: string, _url: string, signal?: AbortSignal) =>
    new Promise<VideoCandidate>((_resolve, reject) => signal!.addEventListener('abort', () => {
      aborted = true; reject(new Error('cancelled'));
    }))), parkCandidate: vi.fn(async () => {}), discardCandidate: vi.fn(async () => {}) };
  const prepared = new PreparedSceneClips(registry, pool);
  prepared.stage('next', [source('top-0')], 40);
  await vi.waitFor(() => expect(pool.prepare).toHaveBeenCalledTimes(1));
  await prepared.clear();
  expect(aborted).toBe(true);
  expect(prepared.diagnostics.pending).toBe(0);
  expect(registry.get('top-0')).toBe(current);
});

test('a late or different registration cannot consume an unready candidate', async () => {
  const registry = new ClipRegistry();
  const pool = { prepare: vi.fn(async (id: string, url: string) => candidate(id, url)),
    parkCandidate: vi.fn(async () => {}), discardCandidate: vi.fn(async () => {}) };
  const prepared = new PreparedSceneClips(registry, pool);
  prepared.stage('next', [source('top-0')], 40);
  await vi.waitFor(() => expect(prepared.diagnostics.ready).toBe(1));
  expect(prepared.take('top-0', 'https://example.test/different.mp4')).toBeNull();
  await prepared.clear();
  await vi.waitFor(() => expect(pool.discardCandidate).toHaveBeenCalled());
});

test('cancelling a ready file waits for decoder release before revoking its URL', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:prepared');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  let release!: () => void;
  const pool = { prepare: vi.fn(async (id: string, url: string) => candidate(id, url)),
    parkCandidate: vi.fn(async () => {}), discardCandidate: vi.fn(async () => {}) };
  const prepared = new PreparedSceneClips(new ClipRegistry(), pool);
  const file = new File(['clip'], 'next.mp4');
  prepared.stage('next', [{ slotId: 'top-0', clip: { name: file.name, url: '', file } }], 40);
  await vi.waitFor(() => expect(prepared.diagnostics.ready).toBe(1));
  pool.discardCandidate.mockImplementationOnce(() => new Promise<void>(r => { release = r; }));
  const clearing = prepared.clear();
  expect(revoke).not.toHaveBeenCalled();
  release(); await clearing;
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:prepared');
});
