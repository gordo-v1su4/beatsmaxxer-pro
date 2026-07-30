import { writable } from 'svelte/store';

export type DragSource = 'palette' | 'rack';
export type RackRow = 'top' | 'bottom';

export interface DragPayload {
  moduleId: string;
  source: DragSource;
  row?: RackRow;
  slotIndex?: number;
}

export interface DragState {
  active: boolean;
  payload: DragPayload | null;
  /** Current pointer position for ghost */
  x: number;
  y: number;
  /** Slot currently hovered as drop target */
  hoverTarget: { row: RackRow; slotIndex: number } | null;
}

const initial: DragState = {
  active: false,
  payload: null,
  x: 0,
  y: 0,
  hoverTarget: null
};

export const dragState = writable<DragState>(initial);

export function startDrag(payload: DragPayload, x: number, y: number) {
  dragState.set({ active: true, payload, x, y, hoverTarget: null });
}

export function moveDrag(x: number, y: number) {
  dragState.update((s) => (s.active ? { ...s, x, y } : s));
}

export function setHoverTarget(target: DragState['hoverTarget']) {
  dragState.update((s) => (s.active ? { ...s, hoverTarget: target } : s));
}

export function endDrag() {
  dragState.set(initial);
}
