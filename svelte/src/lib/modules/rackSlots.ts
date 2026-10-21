/** Shared slot geometry; independent of stores so loaders and runtimes agree. */
export const RACK_SLOTS_PER_ROW = 6;
export const RACK_SLOT_COUNT = RACK_SLOTS_PER_ROW * 2;
export type RackSlotId = `top-${0 | 1 | 2 | 3 | 4 | 5}` | `bottom-${0 | 1 | 2 | 3 | 4 | 5}`;
export const RACK_SLOT_IDS: readonly RackSlotId[] = Array.from({ length: RACK_SLOT_COUNT }, (_, index) =>
  `${index < RACK_SLOTS_PER_ROW ? 'top' : 'bottom'}-${index % RACK_SLOTS_PER_ROW}` as RackSlotId);
export function slotIndexForId(slot: string): number | null {
  const index = (RACK_SLOT_IDS as readonly string[]).indexOf(slot);
  return index < 0 ? null : index;
}
export function slotIdForIndex(index: number): RackSlotId | null {
  return Number.isInteger(index) ? RACK_SLOT_IDS[index] ?? null : null;
}
