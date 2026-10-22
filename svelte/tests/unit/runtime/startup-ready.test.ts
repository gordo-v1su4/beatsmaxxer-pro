import { afterEach, expect, test, vi } from 'vitest';
import { waitForStartupReady } from '$lib/runtime/startupReady';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('resuming after fully suspended background timers does not spend the deadline', async () => {
  vi.useFakeTimers();
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
  const page = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('document', page);
  const state = { ready: 39, total: 40, frame: 1 };
  let failure: unknown;
  const waiting = waitForStartupReady(() => state, () => {}, new AbortController().signal, 1000)
    .catch((error) => { failure = error; });
  page.hidden = true;
  page.dispatchEvent(new Event('visibilitychange'));
  // No poll runs during the hidden interval, as in a frozen browser tab.
  clock.mockReturnValue(120000);
  page.hidden = false;
  page.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(50);
  expect(failure).toBeUndefined();
  state.ready = 40;
  state.frame++;
  await vi.advanceTimersByTimeAsync(50);
  await waiting;
  expect(failure).toBeUndefined();
});

test('accepts the first idle frame when every pipeline was already ready', async () => {
  await waitForStartupReady(
    () => ({ ready: 40, total: 40, frame: 1 }), () => {}, new AbortController().signal
  );
});

test('time spent in a background tab does not expire startup', async () => {
  vi.useFakeTimers();
  const state = { ready: 39, total: 40, frame: 1 };
  let visible = false;
  let opened = false;
  const waiting = waitForStartupReady(() => state, () => {}, new AbortController().signal, 1000, () => visible)
    .then(() => { opened = true; });
  await vi.advanceTimersByTimeAsync(10000);
  expect(opened).toBe(false);
  visible = true;
  state.ready = 40;
  state.frame++;
  await vi.advanceTimersByTimeAsync(50);
  await waiting;
  expect(opened).toBe(true);
});

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

test('shader progress renews the inactivity deadline instead of timing out an active startup', async () => {
  vi.useFakeTimers();
  const state = { ready: 1, total: 4, frame: 1 };
  let failure: unknown;
  const waiting = waitForStartupReady(() => state, () => {}, new AbortController().signal, 1000)
    .catch(error => { failure = error; });
  for (let ready = 2; ready <= 4; ready++) {
    await vi.advanceTimersByTimeAsync(900);
    state.ready = ready;
    await vi.advanceTimersByTimeAsync(50);
  }
  state.frame++;
  await vi.advanceTimersByTimeAsync(50);
  await waiting;
  expect(failure).toBeUndefined();
});

test('a watched stall stays covered and recovers automatically when graphics finish', async () => {
  vi.useFakeTimers();
  const state = { ready: 39, total: 40, frame: 1 };
  const stalled = vi.fn();
  let opened = false, failure: unknown;
  const waiting = waitForStartupReady(
    () => state, () => {}, new AbortController().signal, 1000, () => true, stalled
  ).then(() => { opened = true; }).catch(error => { failure = error; });
  await vi.advanceTimersByTimeAsync(1500);
  expect(failure).toBeUndefined();
  expect(opened).toBe(false);
  expect(stalled).toHaveBeenCalledExactlyOnceWith(true);
  state.ready = 40;
  await vi.advanceTimersByTimeAsync(50);
  expect(opened).toBe(false); // Pipelines alone do not reveal an undrawn workspace.
  state.frame++;
  await vi.advanceTimersByTimeAsync(50);
  await waiting;
  expect(opened).toBe(true);
  expect(stalled.mock.calls).toEqual([[true], [false]]);
});
