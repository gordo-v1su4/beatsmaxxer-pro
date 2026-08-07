import { detectRuntime, type AppRuntime } from '$lib/platform/runtime';

export const WEB_PREVIEW_TARGET_FPS = 30;
export const DESKTOP_PREVIEW_TARGET_FPS = 60;

/** Desktop uses the native display cadence; web keeps the proven preview budget. */
export function previewTargetFps(runtime: AppRuntime = detectRuntime()) {
  return runtime === 'tauri' ? DESKTOP_PREVIEW_TARGET_FPS : WEB_PREVIEW_TARGET_FPS;
}
