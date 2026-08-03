import type { ModuleType } from '$lib/engine/contracts';
import {
  catalogIds,
  DEFAULT_RACK_BOTTOM,
  DEFAULT_RACK_TOP,
  canPlaceInRow,
  getModuleDef,
  listCatalog,
  type ModuleDefinition
} from '$lib/modules/catalog';
import { writable, derived, get } from 'svelte/store';
import type { VideoLayer } from '$lib/engine/contracts';
import type { DragPayload, RackRow } from '$lib/stores/drag';
import { pgmSource, queuedPgmSource } from '$lib/stores/pgm';

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

/** Four modules start in each row; a fifth stable slot can be added by drop. */
export const rackTop = writable<string[]>([...DEFAULT_RACK_TOP]);
export const rackBottom = writable<string[]>([...DEFAULT_RACK_BOTTOM]);

export const MAX_RACK_SLOTS_PER_ROW = 5;
export type RackSlotId = `top-${0 | 1 | 2 | 3 | 4}` | `bottom-${0 | 1 | 2 | 3 | 4}`;
export const RACK_SLOT_IDS: readonly RackSlotId[] = [
  'top-0', 'top-1', 'top-2', 'top-3', 'top-4',
  'bottom-0', 'bottom-1', 'bottom-2', 'bottom-3', 'bottom-4'
];

export function isRackSlotId(id: string): id is RackSlotId {
  return (RACK_SLOT_IDS as readonly string[]).includes(id);
}

export function rackSlotId(row: RackRow, index: number): RackSlotId {
  return `${row}-${index}` as RackSlotId;
}

/** Stable media/decode slot currently occupied by an effect module. */
export function currentRackSlotForModule(
  moduleId: string,
  top = get(rackTop),
  bottom = get(rackBottom)
): RackSlotId | null {
  const topIndex = top.indexOf(moduleId);
  if (topIndex >= 0) return rackSlotId('top', topIndex);
  const bottomIndex = bottom.indexOf(moduleId);
  return bottomIndex >= 0 ? rackSlotId('bottom', bottomIndex) : null;
}

/** Effect module currently rendered by a stable media/decode slot. */
export function currentRackModuleForSlot(
  slotId: string,
  top = get(rackTop),
  bottom = get(rackBottom)
): string | null {
  const match = /^(top|bottom)-([0-4])$/.exec(slotId);
  if (!match) return null;
  const modules = match[1] === 'top' ? top : bottom;
  return modules[Number(match[2])] ?? null;
}

export function currentRackAssignments(
  top = get(rackTop),
  bottom = get(rackBottom)
): Array<{ slotId: RackSlotId; moduleId: string }> {
  return [
    ...top.map((moduleId, index) => ({ slotId: rackSlotId('top', index), moduleId })),
    ...bottom.map((moduleId, index) => ({ slotId: rackSlotId('bottom', index), moduleId }))
  ];
}

export function activeRackSlotIds(
  top = get(rackTop),
  bottom = get(rackBottom)
): RackSlotId[] {
  return currentRackAssignments(top, bottom).map(({ slotId }) => slotId);
}

export const moduleParams = writable(defaultParams());
type RackParams = Record<string, Record<string, number>>;

const undoStack: RackParams[] = [];
const redoStack: RackParams[] = [];
const HISTORY_LIMIT = 100;
const historyRevision = writable(0);
let transactionDepth = 0;
let transactionStart: RackParams | null = null;

export const canUndo = derived(historyRevision, () => undoStack.length > 0);
export const canRedo = derived(historyRevision, () => redoStack.length > 0);

function cloneParams(params: RackParams): RackParams {
  return Object.fromEntries(
    Object.entries(params).map(([moduleId, values]) => [moduleId, { ...values }])
  );
}

function paramsEqual(a: RackParams, b: RackParams): boolean {
  const aIds = Object.keys(a);
  const bIds = Object.keys(b);
  if (aIds.length !== bIds.length) return false;
  return aIds.every((id) => {
    const aValues = a[id] ?? {};
    const bValues = b[id] ?? {};
    const aKeys = Object.keys(aValues);
    const bKeys = Object.keys(bValues);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every((key) => Object.is(aValues[key], bValues[key]))
    );
  });
}

function notifyHistoryChanged() {
  historyRevision.update((revision) => revision + 1);
}

function pushUndo(snapshot: RackParams) {
  undoStack.push(snapshot);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
}

function commitParams(next: RackParams) {
  const current = get(moduleParams);
  if (paramsEqual(current, next)) return;

  if (transactionDepth === 0) {
    pushUndo(cloneParams(current));
    redoStack.length = 0;
    notifyHistoryChanged();
  }
  moduleParams.set(next);
}

/** Starts a possibly long-running parameter gesture (for example pointer drag). */
export function beginRackParamTransaction() {
  const outermost = transactionDepth === 0;
  if (outermost) transactionStart = cloneParams(get(moduleParams));
  transactionDepth += 1;
}

/** Finishes a parameter gesture and records its initial state as one undo step. */
export function endRackParamTransaction() {
  if (transactionDepth === 0) return;
  transactionDepth -= 1;
  if (transactionDepth === 0) {
    const before = transactionStart;
    transactionStart = null;
    if (before && !paramsEqual(before, get(moduleParams))) {
      pushUndo(before);
      redoStack.length = 0;
      notifyHistoryChanged();
    }
  }
}

/** Groups any nested parameter mutations into one undoable rack operation. */
export function runRackParamTransaction(operation: () => void) {
  beginRackParamTransaction();
  try {
    operation();
  } finally {
    endRackParamTransaction();
  }
}

export function undoRackParams() {
  const previous = undoStack.pop();
  if (!previous) return;
  redoStack.push(cloneParams(get(moduleParams)));
  moduleParams.set(previous);
  notifyHistoryChanged();
}

export function redoRackParams() {
  const next = redoStack.pop();
  if (!next) return;
  pushUndo(cloneParams(get(moduleParams)));
  moduleParams.set(next);
  notifyHistoryChanged();
}

/** Test/setup helper: clears history without changing current parameter values. */
export function resetRackParamHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  transactionDepth = 0;
  transactionStart = null;
  notifyHistoryChanged();
}
export const bypassed = writable(buildModuleRecord(catalogIds(), false));
export const muted = writable(buildModuleRecord(catalogIds(), false));
export const videoLayers = writable(
  buildModuleRecord([...RACK_SLOT_IDS], null as VideoLayer | null)
);
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
  const params = get(moduleParams);
  commitParams({
    ...params,
    [moduleId]: { ...(params[moduleId] ?? {}), [key]: value }
  });
}

/** Applies a module preset or other multi-control update as one history entry. */
export function updateParams(moduleId: string, values: Record<string, number>) {
  runRackParamTransaction(() => {
    for (const [key, value] of Object.entries(values)) updateParam(moduleId, key, value);
  });
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
): boolean {
  if (from.row === to.row && from.index === to.index) return false;

  const top = get(rackTop);
  const bottom = get(rackBottom);
  const fromSlots = from.row === 'top' ? top : bottom;
  const toSlots = to.row === 'top' ? top : bottom;
  if (
    !Number.isInteger(from.index) ||
    !Number.isInteger(to.index) ||
    from.index < 0 ||
    to.index < 0 ||
    from.index >= fromSlots.length ||
    to.index >= toSlots.length
  ) return false;

  const fromId = fromSlots[from.index];
  const toId = toSlots[to.index];
  if (!fromId || !toId) return false;

  if (from.row === to.row) {
    reorderInRow(from.row, from.index, to.index);
    return true;
  }

  const fromDef = getModuleDef(fromId);
  const toDef = getModuleDef(toId);
  if (!fromDef || !toDef || !canPlaceInRow(fromDef, to.row) || !canPlaceInRow(toDef, from.row)) {
    return false;
  }

  rackTop.update((top) => {
    const next = [...top];
    if (from.row === 'top') next[from.index] = toId;
    if (to.row === 'top') next[to.index] = fromId;
    return next;
  });
  rackBottom.update((bottom) => {
    const next = [...bottom];
    if (from.row === 'bottom') next[from.index] = toId;
    if (to.row === 'bottom') next[to.index] = fromId;
    return next;
  });
  return true;
}

/** Drop a palette module onto a rack slot — swaps if already in rack. */
export function assignModuleToSlot(row: RackRow, slotIndex: number, moduleId: string): boolean {
  const def = getModuleDef(moduleId);
  if (!def || !canPlaceInRow(def, row)) return false;

  const store = row === 'top' ? rackTop : rackBottom;
  const slots = get(store);
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > slots.length) return false;
  if (slotIndex === slots.length) {
    if (
      slots.length >= MAX_RACK_SLOTS_PER_ROW ||
      get(rackTop).includes(moduleId) ||
      get(rackBottom).includes(moduleId)
    ) return false;
    store.set([...slots, moduleId]);
    return true;
  }
  if (slots[slotIndex] === moduleId) return false;

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
  return true;
}

/** Whether a custom module drag can change the requested stable rack slot. */
export function canDropModuleOnSlot(
  payload: DragPayload,
  target: { row: RackRow; index: number },
  top = get(rackTop),
  bottom = get(rackBottom)
): boolean {
  const targetSlots = target.row === 'top' ? top : bottom;
  const isAddSlot = target.index === targetSlots.length;
  if (
    !Number.isInteger(target.index) ||
    target.index < 0 ||
    target.index > targetSlots.length ||
    (isAddSlot && targetSlots.length >= MAX_RACK_SLOTS_PER_ROW)
  ) return false;

  const draggedDef = getModuleDef(payload.moduleId);
  if (!draggedDef || !canPlaceInRow(draggedDef, target.row)) return false;

  if (isAddSlot) {
    return payload.source === 'palette' && !top.includes(payload.moduleId) && !bottom.includes(payload.moduleId);
  }

  if (payload.source === 'palette') {
    return targetSlots[target.index] !== payload.moduleId;
  }

  if (payload.row === undefined || payload.slotIndex === undefined) return false;
  const sourceSlots = payload.row === 'top' ? top : bottom;
  if (
    !Number.isInteger(payload.slotIndex) ||
    payload.slotIndex < 0 ||
    payload.slotIndex >= sourceSlots.length ||
    (payload.row === target.row && payload.slotIndex === target.index)
  ) return false;

  const displacedDef = getModuleDef(targetSlots[target.index] ?? '');
  return !!displacedDef && canPlaceInRow(displacedDef, payload.row);
}

/** Apply one rack drop without touching the stable slot's media/decode state. */
export function applyModuleDrop(
  payload: DragPayload,
  target: { row: RackRow; index: number }
): boolean {
  if (!canDropModuleOnSlot(payload, target)) return false;
  const liveSlot = currentRackSlotForModule(get(pgmSource));
  const queued = get(queuedPgmSource);
  const queuedSlot = queued ? currentRackSlotForModule(queued) : null;
  const changed = payload.source === 'palette'
    ? assignModuleToSlot(target.row, target.index, payload.moduleId)
    : swapRackSlots(
        { row: payload.row!, index: payload.slotIndex! },
        target
      );
  if (!changed) return false;

  // PGM follows the physical/video slot across an effect replacement. A user
  // trying another effect on a clip must never jump to a different clip.
  if (liveSlot) {
    const moduleId = currentRackModuleForSlot(liveSlot);
    if (moduleId) pgmSource.set(moduleId as ModuleType);
  }
  if (queuedSlot) {
    const moduleId = currentRackModuleForSlot(queuedSlot);
    queuedPgmSource.set((moduleId as ModuleType | null) ?? null);
  }
  return true;
}

export function randomize() {
  const params = get(moduleParams);
  const next = (() => {
    const next = { ...params };
    for (const id of catalogIds()) {
      const p = { ...(next[id] ?? {}) };
      for (const key of Object.keys(p)) {
        p[key] = Math.round(Math.random() * 100);
      }
      next[id] = p;
    }
    return next;
  })();
  commitParams(next);
}

export function clearParams() {
  commitParams(defaultParams());
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
