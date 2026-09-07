import { get } from 'svelte/store';
import type { TimelineFrame } from '$lib/transport';
import {
  arrangementClips,
  arrangementRecording,
  arrangementTriggers,
  type ArrangementClip,
} from '$lib/stores/arrangement';
import { currentRackSlotForModule, rackSlotIndex } from '$lib/stores/rack';
import { pgmSource } from '$lib/stores/pgm';

/** Beat window after a fire where triggerAge still reads as "just triggered". */
const TRIGGER_EDGE_BEATS = 0.14;
/** Minimum wall-clock gap between trigger marks on one lane. */
const TRIGGER_DEBOUNCE_S = 0.07;

let openClipId: string | null = null;
let lastPgmSlotIndex: number | null = null;
let lastTriggerSecondBySlot = new Map<number, number>();
const prevTriggerActive = new Map<string, boolean>();
let clipSerial = 0;
let triggerSerial = 0;

export function resetArrangementRecorderState() {
  openClipId = null;
  lastPgmSlotIndex = null;
  lastTriggerSecondBySlot.clear();
  prevTriggerActive.clear();
}

export function beginArrangementRecording(startSeconds: number, clearPrevious = true) {
  if (clearPrevious) {
    arrangementClips.set([]);
    arrangementTriggers.set([]);
  }
  resetArrangementRecorderState();
  arrangementRecording.set(true);
  const live = get(pgmSource);
  const slot = currentRackSlotForModule(live);
  const slotIndex = slot ? rackSlotIndex(slot) : null;
  if (slotIndex != null) openPgmClip(slotIndex, startSeconds);
}

export function endArrangementRecording(endSeconds: number) {
  closeOpenClip(endSeconds);
  arrangementRecording.set(false);
  resetArrangementRecorderState();
}

function closeOpenClip(endSeconds: number) {
  if (!openClipId) return;
  const id = openClipId;
  arrangementClips.update((clips) =>
    clips.map((clip) =>
      clip.id === id && clip.endSeconds === null
        ? { ...clip, endSeconds: Math.max(clip.startSeconds, endSeconds) }
        : clip,
    ),
  );
  openClipId = null;
  lastPgmSlotIndex = null;
}

function openPgmClip(slotIndex: number, startSeconds: number) {
  if (lastPgmSlotIndex === slotIndex && openClipId) return;
  closeOpenClip(startSeconds);
  const id = `rec-${++clipSerial}`;
  openClipId = id;
  lastPgmSlotIndex = slotIndex;
  const clip: ArrangementClip = {
    id,
    slotIndex,
    startSeconds,
    endSeconds: null,
  };
  arrangementClips.update((clips) => [...clips, clip]);
}

function recordTrigger(slotIndex: number, seconds: number) {
  const last = lastTriggerSecondBySlot.get(slotIndex) ?? -Infinity;
  if (seconds - last < TRIGGER_DEBOUNCE_S) return;
  lastTriggerSecondBySlot.set(slotIndex, seconds);
  arrangementTriggers.update((marks) => [
    ...marks,
    { id: `trg-${++triggerSerial}`, slotIndex, seconds },
  ]);
}

/** Rising edge on shader triggerAge — one mark per fire. */
export function triggerJustFired(age: number | undefined): boolean {
  if (age == null || !Number.isFinite(age)) return false;
  return age >= 0 && age < TRIGGER_EDGE_BEATS;
}

/**
 * Paint PGM occupancy clips and per-fire trigger marks while REC is on.
 * Called once per AppLoop frame.
 */
export function tickArrangementRecorder(
  frame: TimelineFrame,
  moduleIds: readonly string[],
  triggerAges: Readonly<Record<string, number>>,
) {
  if (!get(arrangementRecording)) return;

  const time = frame.positionSeconds;

  if (frame.playing) {
    const live = get(pgmSource);
    const slot = currentRackSlotForModule(live);
    const slotIndex = slot ? rackSlotIndex(slot) : null;
    if (slotIndex != null) openPgmClip(slotIndex, time);
  }

  for (const moduleId of moduleIds) {
    const age = triggerAges[moduleId];
    const active = triggerJustFired(age);
    const was = prevTriggerActive.get(moduleId) ?? false;
    prevTriggerActive.set(moduleId, active);
    if (!active || was) continue;
    const modSlot = currentRackSlotForModule(moduleId);
    const slotIndex = modSlot ? rackSlotIndex(modSlot) : null;
    if (slotIndex != null) recordTrigger(slotIndex, time);
  }
}
