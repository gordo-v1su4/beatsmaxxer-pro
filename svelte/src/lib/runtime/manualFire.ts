/**
 * Manual FIRE / pack-pick retrigger for TRANSITION.
 *
 * The shader already treats `triggerAge >= 0` as "start the move now". MIDI
 * fills that slot when a part is driving the module. This helper is the audio-
 * clock equivalent: bumping `trig` starts an envelope that lasts the same
 * `durBeats` window effectTransition uses, then returns the module to the
 * beat-grid interval.
 */
export interface ManualFireState {
  trig: number;
  originBeat: number;
  armed: boolean;
}

/** Match `effectTransition`: `durBeats = 0.15 + u.p1 * 0.85` with p1 = duration/100. */
export function transitionDurationBeats(durationParam: number): number {
  return 0.15 + (durationParam / 100) * 0.85;
}

export function advanceManualFire(
  previous: ManualFireState | null,
  trig: number | undefined,
  beatPosition: number,
  durationParam: number
): { age: number | null; state: ManualFireState } {
  const value = trig ?? 0;
  if (previous === null) {
    return { age: null, state: { trig: value, originBeat: beatPosition, armed: false } };
  }

  const state: ManualFireState =
    previous.trig !== value
      ? { trig: value, originBeat: beatPosition, armed: true }
      : previous;

  if (!state.armed) return { age: null, state };

  const age = beatPosition - state.originBeat;
  const window = transitionDurationBeats(durationParam);
  if (!Number.isFinite(age) || age < 0 || age > window) {
    return { age: null, state: { ...state, armed: false } };
  }
  return { age, state };
}

export function mergeTriggerAge(midiAge: number | undefined, fireAge: number | undefined): number {
  if (midiAge != null && midiAge >= 0) return midiAge;
  if (fireAge != null) return fireAge;
  return midiAge ?? -1;
}
