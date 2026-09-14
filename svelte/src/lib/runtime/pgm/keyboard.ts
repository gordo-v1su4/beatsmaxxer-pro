/** Keyboard digits match physical rack slots, including gaps in a rack row. */
export function pgmDigit(event: Pick<KeyboardEvent,'key'|'repeat'|'altKey'|'ctrlKey'|'metaKey'|'shiftKey'|'defaultPrevented'>, editable: boolean): number | null {
  if (editable || event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !/^[0-9]$/.test(event.key)) return null;
  return Number(event.key);
}
export function pgmSlotNumber(slot: string) { return Number(slot.split('-')[1])+(slot.startsWith('bottom-')?5:0); }
