import { writable } from 'svelte/store';

/**
 * Phone shell UI state.
 *
 * Deliberately separate from `rackUi`: those stores describe a rack that has
 * rails, rows and collapse states, none of which exist here. The only thing the
 * two surfaces share is the engine underneath.
 */

/**
 * The module editor is a sheet you pull up over the picture and push back down,
 * not a screen you navigate to. `peek` is the resting grabber; `full` is the
 * control surface. Keeping the picture visible behind it is the whole point —
 * you are dialling an effect while watching it land.
 */
export type SheetState = 'closed' | 'peek' | 'full';
export const sheetState = writable<SheetState>('peek');

/**
 * Live drag offset in px while a sheet gesture is in flight; 0 when settled.
 *
 * Named for the portrait case, but it carries travel along whichever axis the
 * sheet moves on — which is X in landscape, where the sheet is a right-hand
 * panel rather than a bottom one. One store either way: the gesture is "how far
 * along its own axis has the sheet been pulled", and splitting it in two would
 * mean every reader had to ask the orientation first.
 */
export const sheetDragY = writable(0);

/**
 * Is the picture itself a control surface right now?
 *
 * Off by default, and deliberately explicit. Touching the picture is not
 * obviously a parameter gesture — on every other video app it is a scrub or a
 * play toggle — so arming it is a decision the operator makes once, and the
 * stage says which two parameters it just handed to their finger.
 */
export const macroPadArmed = writable(false);

/** Browser sheet — clips, FX, song. Pulls up over the picture. */
export const drawerOpen = writable(false);
export type DrawerTab = 'fx' | 'clips' | 'song';
export const drawerTab = writable<DrawerTab>('clips');

export function openDrawer(tab: DrawerTab) {
  drawerTab.set(tab);
  drawerOpen.set(true);
  // The module editor peeks so two sheets are not stacked opaque over the frame.
  sheetState.update((s) => (s === 'full' ? 'peek' : s));
}

/**
 * One-time nudges. Dismissal is per session — nothing is persisted.
 *
 * There was a `rotateHintDismissed` here for a "turn sideways to perform" pill.
 * It is gone along with the pill: landscape does not actually make this surface
 * better, so advertising it was talking users into a worse screen.
 */
export const desktopNoteDismissed = writable(false);

/** Transient toast line under the top bar (clip loaded, no WebGPU, etc). */
export const mobileToast = writable<string | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showMobileToast(message: string, ms = 2200) {
  if (toastTimer) clearTimeout(toastTimer);
  mobileToast.set(message);
  toastTimer = setTimeout(() => mobileToast.set(null), ms);
}
