import { writable } from 'svelte/store';

export type ClipLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ClipStatusEntry {
  status: ClipLoadStatus;
  error?: string;
  name?: string;
}

export const clipStatus = writable<Record<string, ClipStatusEntry>>({});

export function setClipLoading(moduleId: string, name?: string) {
  clipStatus.update((s) => ({
    ...s,
    [moduleId]: { status: 'loading', name }
  }));
}

export function setClipReady(moduleId: string, name?: string) {
  clipStatus.update((s) => ({
    ...s,
    [moduleId]: { status: 'ready', name }
  }));
}

export function setClipError(moduleId: string, error: string, name?: string) {
  clipStatus.update((s) => ({
    ...s,
    [moduleId]: { status: 'error', error, name }
  }));
}

export function clearClipStatus(moduleId: string) {
  clipStatus.update((s) => {
    const next = { ...s };
    delete next[moduleId];
    return next;
  });
}
