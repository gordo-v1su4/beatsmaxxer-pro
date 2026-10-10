import { derived, get, writable } from 'svelte/store';
import { sequencerArmed } from '$lib/stores/sequencer';
import { arrangementRecording } from '$lib/stores/arrangement';
import { beginArrangementRecording, endArrangementRecording } from './recorder';
import { rememberLiveWorkspace, restoreLiveWorkspace, captureTakeSection, applyTakeAt } from './takeSnapshot';
import { transportDisplay } from '$lib/stores/transportDisplay';
import { viewMode } from '$lib/stores/rackUi';
import { timingPreparationBlocked } from '$lib/runtime/timing/readiness';

/**
 * The arrangement's three transport modes, modelled on Ableton:
 *
 * - LIVE  — Session view. You cut PGM by hand; the timeline drives nothing and
 *           nothing is written. Play around.
 * - PLAY  — Arrangement playback. The timeline's cuts drive PGM. A manual cut
 *           takes over (like launching a Session clip) and the arrangement
 *           stays silent until BACK TO ARRANGEMENT.
 * - REC   — Arrangement Record. Manual cuts are written straight into the
 *           timeline as the transport runs. Replace (Ableton's default)
 *           clears existing cuts under the playhead; overdub keeps them.
 *
 * Derived from the two flags the runtime and QA gates already use —
 * `sequencerArmed` (timeline drives cuts) and `arrangementRecording` — so
 * anything that sets those directly still lands in a coherent mode.
 */
export type ArrangementMode = 'live' | 'play' | 'rec';

export const arrangementMode = derived(
  [sequencerArmed, arrangementRecording],
  ([armed, recording]): ArrangementMode => {
    if (recording) return 'rec';
    if (armed) return 'play';
    return 'live';
  },
);

/**
 * True after a manual cut in PLAY: the performer has the program, and the
 * timeline's cuts are held off until BACK TO ARRANGEMENT.
 */
export const arrangementOverridden = writable(false);

/** REC keeps existing cuts under the playhead instead of replacing them. */
export const recordOverdub = writable(false);

export function setArrangementMode(mode: ArrangementMode, playheadSeconds: number) {
  if(mode!=='live'&&get(timingPreparationBlocked))return;
  const current = get(arrangementMode);
  if (current === mode) return;
  if (current === 'rec') endArrangementRecording(playheadSeconds);
  if (mode === 'live') restoreLiveWorkspace();
  else rememberLiveWorkspace();
  arrangementOverridden.set(false);
  sequencerArmed.set(mode !== 'live');
  // Each REC pass is its own take on the lanes; overdub only changes what
  // happens to the cuts underneath.
  if (mode === 'rec') {
    captureTakeSection(playheadSeconds,get(transportDisplay).bpm||120);
    beginArrangementRecording(playheadSeconds, true);
  }
  if(mode==='play')return applyTakeAt(playheadSeconds,get(transportDisplay).bpm||120);
}

/** Hand the program back to the timeline (Ableton's Back to Arrangement). */
export function backToArrangement() {
  arrangementOverridden.set(false);
}

let previousView = get(viewMode);
viewMode.subscribe(mode => {
  if (previousView === 'arrange' && mode !== 'arrange') setArrangementMode('live',get(transportDisplay).time);
  previousView = mode;
});
