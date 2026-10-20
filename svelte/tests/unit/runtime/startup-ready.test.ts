import { afterEach, expect, test, vi } from 'vitest';
import { waitForStartupReady } from '$lib/runtime/startupReady';

afterEach(() => vi.useRealTimers());

test('keeps a slow startup covered beyond the old twelve second cutoff', async () => {
  vi.useFakeTimers();
  const state = { ready: 38, total: 40, frame: 100 };
  let opened = false;
  const waiting = waitForStartupReady(() => state, () => {}, new AbortController().signal)
    .then(() => { opened = true; });
  await vi.advanceTimersByTimeAsync(15000);
  expect(opened).toBe(false);
  state.ready = 40;
  await vi.advanceTimersByTimeAsync(50);
  expect(opened).toBe(false);
  state.frame++;
  await vi.advanceTimersByTimeAsync(50);
  await waiting;
  expect(opened).toBe(true);
});

test('a stalled or failed shader compilation reports an error instead of opening', async () => {
  vi.useFakeTimers();
  const waiting = waitForStartupReady(
    () => ({ ready: 39, total: 40, frame: 100 }), () => {}, new AbortController().signal, 1000
  );
  const assertion = expect(waiting).rejects.toThrow('Reload to try again');
  await vi.advanceTimersByTimeAsync(1000);
  await assertion;
});

test('unmounting cancels the startup wait', async () => {
  vi.useFakeTimers();
  const abort = new AbortController();
  const waiting = waitForStartupReady(() => ({ ready: 0, total: 40, frame: 0 }), () => {}, abort.signal);
  const assertion = expect(waiting).rejects.toThrow();
  abort.abort();
  await vi.advanceTimersByTimeAsync(50);
  await assertion;
});
