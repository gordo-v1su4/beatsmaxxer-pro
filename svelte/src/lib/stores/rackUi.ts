import { writable, derived } from 'svelte/store';
import { rackTop, rackBottom } from '$lib/stores/rack';

/** Per-module control collapse — preview-only strip when true. */
export const moduleCollapsed = writable<Record<string, boolean>>({});

export function toggleModuleCollapsed(id: string) {
  moduleCollapsed.update((m) => ({ ...m, [id]: !m[id] }));
}

export function setModuleCollapsed(id: string, collapsed: boolean) {
  moduleCollapsed.update((m) => ({ ...m, [id]: collapsed }));
}

/**
 * Every module in the rack collapsed to its preview strip. Collapsing them one
 * at a time is ten clicks, and the point of doing it is almost always the same:
 * reclaim the bottom of the window in one move.
 */
export const allModulesCollapsed = derived(
  [rackTop, rackBottom, moduleCollapsed],
  ([top, bottom, collapsed]) => {
    const ids = [...top, ...bottom];
    return ids.length > 0 && ids.every((id) => collapsed[id] === true);
  }
);

export function setAllModulesCollapsed(ids: string[], collapsed: boolean) {
  moduleCollapsed.update((m) => {
    const next = { ...m };
    for (const id of ids) next[id] = collapsed;
    return next;
  });
}

/** Left browser rail — retracts to a thin strip. */
export const fxLibOpen = writable(true);

/**
 * Which browser the left rail is showing. FX and clips were two separate
 * surfaces — a column and a full-width strip above the rack — for one list each.
 * They are both "things you drag onto a slot", so they share a rail and a tab.
 */
export type SideRailTab = 'fx' | 'clips';
export const sideRailTab = writable<SideRailTab>('fx');

/** PGM source rail — can retract later for extra rack rows. */
export const pgmRailOpen = writable(true);

/**
 * Clip bank drawer. Starts closed: loading clips is a setup activity, and the
 * rack should own the full width during a performance.
 */
export const clipLibraryOpen = writable(false);

export const topRowCompact = derived([rackTop, moduleCollapsed], ([top, collapsed]) => {
  if (top.length === 0) return false;
  return top.every((id) => collapsed[id] === true);
});

export const bottomRowCompact = derived([rackBottom, moduleCollapsed], ([bottom, collapsed]) => {
  if (bottom.length === 0) return false;
  return bottom.every((id) => collapsed[id] === true);
});
