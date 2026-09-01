import { detectRuntime, type AppRuntime } from '$lib/platform/runtime';

export const WEB_PREVIEW_TARGET_FPS = 30;
export const DESKTOP_PREVIEW_TARGET_FPS = 60;

/** Desktop uses the native display cadence; web keeps the proven preview budget. */
export function previewTargetFps(runtime: AppRuntime = detectRuntime()) {
  return runtime === 'tauri' ? DESKTOP_PREVIEW_TARGET_FPS : WEB_PREVIEW_TARGET_FPS;
}

/**
 * How much output buffer to ask the AudioContext for.
 *
 * `'interactive'` asks for the smallest buffer the device will give. That is
 * right on a desktop, where there is headroom to spare and a live instrument
 * wants the shortest path to the speaker. It is wrong on a phone, and wrong in
 * the specific way that was reported: the GPU is already competing for the same
 * CPU and thermal budget, so the smallest buffer is the one that underruns —
 * heard as the track stuttering, and worst exactly when SoundTouch refills its
 * WSOLA window, which is what changing TEMPO or BPM makes it do. A phone needs
 * a *larger* buffer than a laptop, not a smaller one.
 *
 * `'playback'` on the phone buys a few ms of output latency that nobody
 * performing with this can perceive, and spends it on not dropping out. The
 * pitch/tempo controls stay responsive because their latency is dominated by
 * WSOLA's lookahead, not by the output buffer.
 *
 * Takes the phone flag as an argument rather than reading a store, so the
 * decision is explicit at the call site and testable without a DOM. A desktop
 * browser keeps 'interactive'; only an actual phone trades output latency for
 * not dropping out. Keeping mobile compromises from leaking into the desktop
 * build through a shared global is the whole point of putting it here.
 *
 * Note this is not a regression being reverted: 'interactive' is the Web Audio
 * default, so the phone was always running the smallest buffer. Naming it here
 * is what makes it possible to choose otherwise.
 */
export function audioLatencyHint(
  mobile: boolean,
  runtime: AppRuntime = detectRuntime()
): AudioContextLatencyCategory {
  if (runtime === 'tauri') return 'interactive';
  return mobile ? 'playback' : 'interactive';
}
