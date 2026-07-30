/** @deprecated Use $lib/modules/catalog — kept for backward-compatible imports. */
export {
  listCatalog as ALL_MODULES,
  DEFAULT_RACK_TOP as MODULES_ROW1,
  DEFAULT_RACK_BOTTOM as MODULES_ROW2,
  getModuleDef,
  listCatalog,
  catalogIds
} from './catalog';

import { catalogIds, listCatalog } from './catalog';
import type { ModuleType } from '$lib/engine/contracts';

export function moduleRecord<T>(value: T): Record<ModuleType, T> {
  return Object.fromEntries(catalogIds().map((id) => [id, value])) as Record<ModuleType, T>;
}

export function defaultModuleParams(): Record<string, Record<string, number>> {
  return Object.fromEntries(listCatalog().map((m) => [m.id, { ...m.params }]));
}

export function parseAccentColor(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}
