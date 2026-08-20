import { describe, expect, test } from 'vitest';
import {
  advanceManualFire,
  mergeTriggerAge,
  transitionDurationBeats
} from '$lib/runtime/manualFire';

describe('TRANSITION manual FIRE', () => {
  test('matches the shader duration window', () => {
    expect(transitionDurationBeats(40)).toBeCloseTo(0.15 + 0.4 * 0.85);
  });

  test('does not fire on first observation of the default trig value', () => {
    const first = advanceManualFire(null, 0, 16, 40);
    expect(first.age).toBeNull();
    expect(first.state.armed).toBe(false);
  });

  test('a trig bump starts an envelope that expires after durBeats', () => {
    const seeded = advanceManualFire(null, 0, 8, 40).state;
    const fired = advanceManualFire(seeded, 1, 8, 40);
    expect(fired.age).toBe(0);
    expect(fired.state.armed).toBe(true);

    const mid = advanceManualFire(fired.state, 1, 8.2, 40);
    expect(mid.age).toBeCloseTo(0.2);

    const window = transitionDurationBeats(40);
    const expired = advanceManualFire(mid.state, 1, 8 + window + 0.01, 40);
    expect(expired.age).toBeNull();
    expect(expired.state.armed).toBe(false);
  });

  test('MIDI hits outrank FIRE; a silent MIDI slot still lets FIRE through', () => {
    expect(mergeTriggerAge(0.4, 0.1)).toBe(0.4);
    expect(mergeTriggerAge(-1, 0.2)).toBe(0.2);
    expect(mergeTriggerAge(undefined, 0.3)).toBe(0.3);
    expect(mergeTriggerAge(undefined, undefined)).toBe(-1);
  });
});
