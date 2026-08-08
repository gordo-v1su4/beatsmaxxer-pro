import { writable } from 'svelte/store';
import type { RackRow } from '$lib/stores/drag';

/**
 * Dragging a clip onto a slot is a separate gesture from dragging a module.
 * Modules rearrange the rack — the drop swaps effects and carefully preserves
 * which physical slot is live. A clip drop changes only that slot's media and
 * leaves the effect alone. Keeping the two in one payload would mean teaching
 * every module-drop guard to ignore clips; a second store keeps that logic
 * untouched, and the gestures are mutually exclusive in time anyway.
 */
export interface ClipDragState {
  active: boolean;
  clipId: string | null;
  name: string;
  thumbnail: string | null;
  x: number;
  y: number;
  hoverTarget: { row: RackRow; slotIndex: number } | null;
}

const initial: ClipDragState = {
  active: false,
  clipId: null,
  name: '',
  thumbnail: null,
  x: 0,
  y: 0,
  hoverTarget: null
};

export const clipDragState = writable<ClipDragState>(initial);

export function startClipDrag(
  clip: { id: string; name: string; thumbnail: string | null },
  x: number,
  y: number
) {
  clipDragState.set({
    active: true,
    clipId: clip.id,
    name: clip.name,
    thumbnail: clip.thumbnail,
    x,
    y,
    hoverTarget: null
  });
}

export function moveClipDrag(x: number, y: number) {
  clipDragState.update((s) => (s.active ? { ...s, x, y } : s));
}

export function setClipHoverTarget(target: ClipDragState['hoverTarget']) {
  clipDragState.update((s) => (s.active ? { ...s, hoverTarget: target } : s));
}

export function endClipDrag() {
  clipDragState.set(initial);
}
