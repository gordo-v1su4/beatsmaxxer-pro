import { writable, derived, get } from 'svelte/store';
import { rackTop, rackBottom, midiLayers } from '$lib/stores/rack';
import { midiChannels } from '$lib/stores/midiChannels';
import { setAllModuleTriggerSources } from '$lib/stores/midiTrigger';

/** Per-module control collapse — preview-only strip when true. */
export const moduleCollapsed = writable<Record<string, boolean>>({});

export function toggleModuleCollapsed(id: string) {
  moduleCollapsed.update((m) => ({ ...m, [id]: !m[id] }));
}

export function setModuleCollapsed(id: string, collapsed: boolean) {
  moduleCollapsed.update((m) => ({ ...m, [id]: collapsed }));
}

/**
 * Every module in the rack collapsed to its preview strip. Collapsing them one
 * at a time is ten clicks, and the point of doing it is almost always the same:
 * reclaim the bottom of the window in one move.
 */
export const allModulesCollapsed = derived(
  [rackTop, rackBottom, moduleCollapsed],
  ([top, bottom, collapsed]) => {
    const ids = [...top, ...bottom];
    return ids.length > 0 && ids.every((id) => collapsed[id] === true);
  }
);

export function setAllModulesCollapsed(ids: string[], collapsed: boolean) {
  moduleCollapsed.update((m) => {
    const next = { ...m };
    for (const id of ids) next[id] = collapsed;
    return next;
  });
}

/**
 * Which screen is up.
 *
 * The arrangement used to be a dock at the bottom of the performance view, and
 * it never fit: programming wants ten slot lanes across the length of a song,
 * performing wants the picture and nothing else. Stacked in one window they
 * each made the other worse. They are two activities, so they are two screens.
 */
export type ViewMode = 'perform' | 'arrange';
export const viewMode = writable<ViewMode>('perform');

/**
 * Strip the performance view back to the picture: rack modules to previews and
 * both side rails retracted. The rails are browsers — things you use while
 * building a set, not while playing one — so leaving them out of MIN ALL meant
 * the gesture never actually got you to a clean screen.
 */
export function setMinimalPerformView(ids: string[], on: boolean) {
  setAllModulesCollapsed(ids, on);
  fxLibOpen.set(!on);
  pgmRailOpen.set(!on);
}

/** Left browser rail — retracts to a thin strip. */
export const fxLibOpen = writable(true);

/**
 * Which browser the left rail is showing. FX and clips were two separate
 * surfaces — a column and a full-width strip above the rack — for one list each.
 * They are both "things you drag onto a slot", so they share a rail and a tab.
 */
export type SideRailTab = 'fx' | 'clips';
export const sideRailTab = writable<SideRailTab>('fx');

/** Open the rail on a given tab — used when a drop needs its target visible. */
export function showSideRailTab(tab: SideRailTab) {
  sideRailTab.set(tab);
  fxLibOpen.set(true);
}

/** PGM source rail — can retract later for extra rack rows. */
export const pgmRailOpen = writable(true);

/**
 * MIDI patch + trigger lanes on the rack.
 *
 * Off by default: a loaded part is exclusive with audio/onset triggers, and the
 * lanes steal the vertical space SPEEDRAMP and the mix strips need. Parts can
 * still be attached later; this only controls whether that surface is showing.
 */
export const midiUiOpen = writable(false);

export function setMidiUiOpen(open: boolean) {
  midiUiOpen.set(open);
  if (!open) setAllModuleTriggerSources('audio');
}

/** Open perform-view MIDI lanes when arranger stems or module parts are present. */
export function syncMidiUiFromLoadedParts() {
  const hasModuleMidi = Object.values(get(midiLayers)).some(
    (layer) => layer != null && layer.notes.length > 0
  );
  if (hasModuleMidi || get(midiChannels).length > 0) setMidiUiOpen(true);
}

export const topRowCompact = derived([rackTop, moduleCollapsed], ([top, collapsed]) => {
  if (top.length === 0) return false;
  return top.every((id) => collapsed[id] === true);
});

export const bottomRowCompact = derived([rackBottom, moduleCollapsed], ([bottom, collapsed]) => {
  if (bottom.length === 0) return false;
  return bottom.every((id) => collapsed[id] === true);
});
