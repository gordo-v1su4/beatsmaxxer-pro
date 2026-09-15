import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { get } from 'svelte/store';

const mocks = vi.hoisted(() => ({ render: vi.fn(), schedule: vi.fn(), listener: null as null | ((id: string) => void) }));
vi.mock('$lib/audio', () => ({ audioEngine: {
  configurePgmSchedule: mocks.schedule,
  subscribePgmSelection: (fn: (id: string) => void) => { mocks.listener = fn; return () => { mocks.listener = null; }; }
} }));
vi.mock('$lib/rendering/webgpu/WebGpuEngine', () => ({ webGpuEngine: { setPgmLiveModule: mocks.render } }));
vi.mock('$lib/runtime/media/MediaRuntime', () => ({ mediaRuntime: { prewarmModule: vi.fn(async () => {}) } }));
vi.mock('$lib/stores/transportDisplay', async () => {
  const { writable } = await import('svelte/store');
  return { transportDisplay: writable({ playing: false }) };
});

import { pgmDirector } from '$lib/runtime/pgm/PgmDirector';
import { cutImmediate, pgmSource, queuedPgmSource, selectPgmSource } from '$lib/stores/pgm';
import { rackTop, rackBottom, videoLayers } from '$lib/stores/rack';
import { viewMode } from '$lib/stores/rackUi';
import { selectedTimingSlot, timingStatus } from '$lib/stores/timing';
import { transportDisplay } from '$lib/stores/transportDisplay';
import { canSelectRackSource, selectRackSource } from '$lib/runtime/pgm/selection';

beforeEach(() => {
  pgmDirector.stop();
  rackTop.set(['transition', 'speedramp', 'stutter', 'timesampler', 'lightleak']);
  rackBottom.set(['punchzoom', 'inception', 'handheld', 'driftcam', 'prism']);
  pgmSource.set('transition'); queuedPgmSource.set(null);
  viewMode.set('timing'); selectedTimingSlot.set('top-0');
  transportDisplay.update(v => ({ ...v, playing: false }));
  videoLayers.update(v => ({ ...v, 'top-3': { name: 'clip', url: '/clip.mp4' } as NonNullable<typeof v[string]> }));
  timingStatus.set({ 'top-3': { state: 'ready', frames: 24, total: 24, bytes: 100 } });
  vi.clearAllMocks(); pgmDirector.start();
});
afterEach(() => pgmDirector.stop());

test('a stopped direct cut keeps the store, scheduled source and renderer on the requested slot', () => {
  cutImmediate('timesampler');
  expect(get(pgmSource)).toBe('timesampler');
  expect(mocks.schedule).toHaveBeenLastCalledWith(expect.objectContaining({ active: 'timesampler' }));
  expect(mocks.render).toHaveBeenLastCalledWith('timesampler', 'top-3');
});

test('a scheduled cut commits only when the audio clock selects it', () => {
  selectPgmSource('timesampler');
  expect(get(pgmSource)).toBe('transition');
  expect(get(queuedPgmSource)).toBe('timesampler');
  mocks.listener?.('timesampler');
  expect(get(pgmSource)).toBe('timesampler');
  expect(get(queuedPgmSource)).toBeNull();
  expect(mocks.render).toHaveBeenLastCalledWith('timesampler', 'top-3');
});

test('replacing the live slot effect still keeps the physical video slot', () => {
  rackTop.update(row => ['speedramp', 'transition', ...row.slice(2)]);
  expect(get(pgmSource)).toBe('speedramp');
  expect(mocks.render).toHaveBeenLastCalledWith('speedramp', 'top-0');
});

test('shared stopped selection opens the same editor slot and cuts PGM there', () => {
  selectRackSource('timesampler');
  expect(get(selectedTimingSlot)).toBe('top-3');
  expect(get(pgmSource)).toBe('timesampler');
  expect(mocks.render).toHaveBeenLastCalledWith('timesampler', 'top-3');
});

test('shared playing selection updates the editor immediately and queues the output cut', () => {
  transportDisplay.update(v => ({ ...v, playing: true }));
  selectRackSource('timesampler');
  expect(get(selectedTimingSlot)).toBe('top-3');
  expect(get(pgmSource)).toBe('transition');
  expect(get(queuedPgmSource)).toBe('timesampler');
  mocks.listener?.('timesampler');
  expect(get(pgmSource)).toBe('timesampler');
  expect(get(selectedTimingSlot)).toBe('top-3');
});

test('a loading slot can be edited without sending an unavailable clip to output', () => {
  timingStatus.set({});
  selectRackSource('timesampler');
  expect(get(selectedTimingSlot)).toBe('top-3');
  expect(get(pgmSource)).toBe('transition');
  expect(get(queuedPgmSource)).toBeNull();
});

test('timing rail sources remain selectable while their resident bank loads', () => {
  expect(canSelectRackSource({ slot: 'top-3', hasVideo: true, timing: true, bypassed: false })).toBe(true);
  expect(canSelectRackSource({ slot: 'top-3', hasVideo: true, timing: false, bypassed: true })).toBe(false);
  expect(canSelectRackSource({ slot: 'top-3', hasVideo: false, timing: true, bypassed: false })).toBe(false);
});
