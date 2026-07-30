import type { ModuleType } from '$lib/engine/contracts';
import {
  catalogIds,
  DEFAULT_RACK_BOTTOM,
  DEFAULT_RACK_TOP,
  getModuleDef,
  listCatalog,
  type ModuleDefinition
} from '$lib/modules/catalog';
import { writable, derived } from 'svelte/store';
import type { VideoLayer } from '$lib/engine/contracts';
import type { RackRow } from '$lib/stores/drag';

export interface MidiLayer {
  name: string;
  notes: Array<{ time: number; note: number; velocity: number }>;
  duration: number;
}

function buildModuleRecord<T>(ids: string[], value: T): Record<string, T> {
  return Object.fromEntries(ids.map((id) => [id, value]));
}

function defaultParams(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const def of listCatalog()) {
    out[def.id] = { ...def.params };
  }
  return out;
}

/** Rack slot assignments — 4 top + 4 bottom, same layout as today. */
export const rackTop = writable<string[]>([...DEFAULT_RACK_TOP]);
export const rackBottom = writable<string[]>([...DEFAULT_RACK_BOTTOM]);

export const moduleParams = writable(defaultParams());
export const bypassed = writable(buildModuleRecord(catalogIds(), false));
export const muted = writable(buildModuleRecord(catalogIds(), false));
export const videoLayers = writable(buildModuleRecord(catalogIds(), null as VideoLayer | null));
export const midiLayers = writable(buildModuleRecord(catalogIds(), null as MidiLayer | null));
export const fxHold = writable(false);

/** Modules registered in catalog but not currently in any rack slot (future palette-only). */
export const paletteOnly = derived([rackTop, rackBottom], ([top, bottom]) => {
  const inRack = new Set([...top, ...bottom]);
  return catalogIds().filter((id) => !inRack.has(id));
});

export function modulesInRack(): ModuleDefinition[] {
  return listCatalog();
}

export function getRackModules(row: RackRow, ids: string[]): ModuleDefinition[] {
  return ids
    .map((id) => getModuleDef(id))
    .filter((d): d is ModuleDefinition => d !== undefined);
}

export function allRackModuleIds(top: string[], bottom: string[]): string[] {
  return [...new Set([...top, ...bottom])];
}

export function updateParam(moduleId: string, key: string, value: number) {
  moduleParams.update((params) => ({
    ...params,
    [moduleId]: { ...(params[moduleId] ?? {}), [key]: value }
  }));
}

export function toggleBypass(moduleId: string) {
  bypassed.update((b) => ({ ...b, [moduleId]: !b[moduleId] }));
}

export function toggleMute(moduleId: string) {
  muted.update((m) => ({ ...m, [moduleId]: !m[moduleId] }));
}

/** Swap two slots within the same row (reorder). */
export function reorderInRow(row: RackRow, fromIndex: number, toIndex: number) {
  const store = row === 'top' ? rackTop : rackBottom;
  store.update((order) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return order;
    const next = [...order];
    if (fromIndex >= next.length || toIndex >= next.length) return order;
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    return next;
  });
}

/** Swap module assignments between two rack slots (any row). */
export function swapRackSlots(
  from: { row: RackRow; index: number },
  to: { row: RackRow; index: number }
) {
  if (from.row === to.row && from.index === to.index) return;

  let fromId = '';
  let toId = '';

  rackTop.update((top) => {
    if (from.row === 'top') fromId = top[from.index] ?? '';
    if (to.row === 'top') toId = top[to.index] ?? '';
    return top;
  });
  rackBottom.update((bottom) => {
    if (from.row === 'bottom') fromId = bottom[from.index] ?? '';
    if (to.row === 'bottom') toId = bottom[to.index] ?? '';
    return bottom;
  });

  if (!fromId) return;

  if (from.row === to.row) {
    reorderInRow(from.row, from.index, to.index);
    return;
  }

  rackTop.update((top) => {
    const next = [...top];
    if (from.row === 'top') next[from.index] = toId || fromId;
    if (to.row === 'top') next[to.index] = fromId;
    return next;
  });
  rackBottom.update((bottom) => {
    const next = [...bottom];
    if (from.row === 'bottom') next[from.index] = toId || fromId;
    if (to.row === 'bottom') next[to.index] = fromId;
    return next;
  });
}

/** Drop a palette module onto a rack slot — swaps if already in rack. */
export function assignModuleToSlot(row: RackRow, slotIndex: number, moduleId: string) {
  const def = getModuleDef(moduleId);
  if (!def) return;

  const store = row === 'top' ? rackTop : rackBottom;
  store.update((slots) => {
    const next = [...slots];
    const existingIndex = next.indexOf(moduleId);
    const displaced = next[slotIndex];

    if (existingIndex >= 0 && existingIndex !== slotIndex) {
      next[existingIndex] = displaced;
    }
    next[slotIndex] = moduleId;
    return next;
  });
}

export function randomize() {
  moduleParams.update((params) => {
    const next = { ...params };
    for (const id of catalogIds()) {
      const p = { ...(next[id] ?? {}) };
      for (const key of Object.keys(p)) {
        p[key] = Math.round(Math.random() * 100);
      }
      next[id] = p;
    }
    return next;
  });
}

export function clearParams() {
  moduleParams.set(defaultParams());
}

/** Legacy alias */
export const orderTop = rackTop;
export const orderBottom = rackBottom;

export function reorderModules(row: RackRow, fromId: string, toId: string) {
  const store = row === 'top' ? rackTop : rackBottom;
  store.update((order) => {
    const fi = order.indexOf(fromId);
    const ti = order.indexOf(toId);
    if (fi < 0 || ti < 0) return order;
    const next = [...order];
    next.splice(fi, 1);
    next.splice(ti, 0, fromId);
    return next;
  });
}

export { listCatalog as ALL_MODULES };
