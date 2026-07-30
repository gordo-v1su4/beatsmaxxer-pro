import { writable } from 'svelte/store';
import type { CapabilityState } from '$lib/rendering/webgpu/capability';

export const capabilities = writable<CapabilityState>({
  renderer: 'checking',
  webgpu: false,
  webcodecs: false,
  reason: null
});

export const transportPlaying = writable(false);
export const transportBpm = writable(128);
export const transportBpmLocked = writable(false);
