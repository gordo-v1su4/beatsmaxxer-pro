export type AppRuntime = 'web' | 'tauri';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: { core?: unknown };
  }
}

/** Detect whether the UI runs inside a Tauri desktop shell. */
export function detectRuntime(): AppRuntime {
  if (typeof window === 'undefined') return 'web';
  if (window.__TAURI_INTERNALS__ || window.__TAURI__?.core) return 'tauri';
  return 'web';
}

export function isTauriRuntime() {
  return detectRuntime() === 'tauri';
}

export function isWebRuntime() {
  return detectRuntime() === 'web';
}
