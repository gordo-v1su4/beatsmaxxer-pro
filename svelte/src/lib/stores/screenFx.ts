import { writable } from 'svelte/store';

/**
 * CRT glass on/off, per surface.
 *
 * The treatment reads as character on the big PGM monitor and as damage on a
 * 164px rack preview — at that size the vignette and scanlines cost more image
 * than they add mood, and the operator is looking at those tiles to judge what
 * to cut to. So the rack defaults off and the viewer defaults on, and both are
 * switchable from the top bar.
 */
const STORAGE_KEY = 'bsp.screenfx.v1';

interface ScreenFxPrefs {
  viewer: boolean;
  modules: boolean;
}

const DEFAULTS: ScreenFxPrefs = { viewer: true, modules: false };

function load(): ScreenFxPrefs {
  if (typeof localStorage === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ScreenFxPrefs>;
    return {
      viewer: typeof parsed.viewer === 'boolean' ? parsed.viewer : DEFAULTS.viewer,
      modules: typeof parsed.modules === 'boolean' ? parsed.modules : DEFAULTS.modules
    };
  } catch {
    return DEFAULTS;
  }
}

const initial = load();

export const screenFxViewer = writable(initial.viewer);
export const screenFxModules = writable(initial.modules);

function persist(patch: Partial<ScreenFxPrefs>) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...load(), ...patch }));
  } catch {
    /* private mode — the toggle still works for this session */
  }
}

screenFxViewer.subscribe((viewer) => persist({ viewer }));
screenFxModules.subscribe((modules) => persist({ modules }));
