import { get } from 'svelte/store';
import { currentRackSlotForModule, videoLayers, bypassed } from '$lib/stores/rack';
import { pgmSource, queuedPgmSource, clearPgmQueue, cutImmediate, selectPgmSource } from '$lib/stores/pgm';
import { viewMode } from '$lib/stores/rackUi';
import { selectedTimingSlot, timingEditorCollapsed, timingStatus } from '$lib/stores/timing';
import { transportDisplay } from '$lib/stores/transportDisplay';
import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';

export function pgmSourceAvailable(id: string): boolean {
  const slot = currentRackSlotForModule(id);
  return !!slot && !!get(videoLayers)[slot] && (get(viewMode) === 'timing'
    ? get(timingStatus)[slot]?.state === 'ready'
    : !get(bypassed)[id]);
}

/** Rail, viewport and digit keys share selection and beat-quantized routing. */
export function selectRackSource(id: string): void {
  const slot = currentRackSlotForModule(id);
  if (!slot) return;
  const timing = get(viewMode) === 'timing';
  if (timing) {
    selectedTimingSlot.set(slot);
    timingEditorCollapsed.set(false);
  }
  // A loading viewport can still be edited; it must not replace ready output.
  if (!pgmSourceAvailable(id)) return;
  if (id === get(pgmSource)) { clearPgmQueue(); return; }
  if (!get(transportDisplay).playing) {
    clearPgmQueue();
    cutImmediate(id);
  } else if (get(queuedPgmSource) === id) {
    clearPgmQueue();
  } else {
    selectPgmSource(id);
    if (!timing) void mediaRuntime.prewarmModule(slot).catch(() => {});
  }
}
