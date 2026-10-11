import { writable } from 'svelte/store';
/** Shared transport gate without a media/audio import cycle. */
export const timingPreparationBlocked=writable(false);
