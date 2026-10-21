import { slotIndexForId } from '$lib/modules/rackSlots';
/** Keyboard digits match physical rack slots, including gaps in a rack row. */
export function pgmDigit(event: Pick<KeyboardEvent,'key'|'repeat'|'altKey'|'ctrlKey'|'metaKey'|'shiftKey'|'defaultPrevented'>, editable: boolean): number | null {
  if (editable || event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !(/^[0-9]$/.test(event.key)||event.key==='-'||event.key==='=')) return null;
  return event.key==='-'?10:event.key==='='?11:Number(event.key);
}
export function pgmSlotNumber(slot: string) { return slotIndexForId(slot)??-1; }
