import { writable } from 'svelte/store';

const KEY = 'bmx-timing-sources-compact';
function readCompact(): boolean {
  try { return localStorage.getItem(KEY) === 'true'; }
  catch { return false; }
}

/** View preference only; never included in timing presets or recorded takes. */
export const timingSourcesCompact = writable(readCompact());
timingSourcesCompact.subscribe(value => {
  try { localStorage.setItem(KEY, String(value)); }
  catch { /* Storage may be unavailable in private or server contexts. */ }
});
