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

/** FX library left panel — retracts to a thin strip. */
export const fxLibOpen = writable(true);

/** PGM source rail — can retract later for extra rack rows. */
export const pgmRailOpen = writable(true);

export const topRowCompact = derived([rackTop, moduleCollapsed], ([top, collapsed]) => {
  if (top.length === 0) return false;
  return top.every((id) => collapsed[id] === true);
});

export const bottomRowCompact = derived([rackBottom, moduleCollapsed], ([bottom, collapsed]) => {
  if (bottom.length === 0) return false;
  return bottom.every((id) => collapsed[id] === true);
});

export const bonusRowVisible = derived([topRowCompact, bottomRowCompact], ([top, bottom]) => top && bottom);
