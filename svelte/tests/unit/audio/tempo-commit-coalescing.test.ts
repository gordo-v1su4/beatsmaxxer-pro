import { describe, expect, test, vi } from 'vitest';
import { applySoundTouchParams } from '$lib/audio/soundtouch';

/**
 * Why TEMPO and BPM skip but PITCH and KEY do not.
 *
 * `applySoundTouchParams` writes `mediaElement.playbackRate`, and changing a
 * media element's rate mid-stream makes the browser re-rate its decode
 * pipeline — audible on a phone as the track skipping for a moment. Pitch and
 * key never change `tempo`, so that property is reassigned its existing value
 * and the browser has nothing to do; tempo and BPM do change it, and pay.
 *
 * This pins the asymmetry so the media-element write cannot quietly spread to
 * the pitch path, which would make all four controls skip.
 */

function fakeNode() {
  return {
    playbackRate: { value: 1 },
    pitch: { value: 1 },
    pitchSemitones: { value: 0 }
  };
}

/** Records every assignment to playbackRate, not just the final value. */
function recordingMediaElement() {
  const writes: number[] = [];
  let rate = 1;
  return {
    element: {
      preservesPitch: true,
      get playbackRate() {
        return rate;
      },
      set playbackRate(next: number) {
        writes.push(next);
        rate = next;
      }
    } as unknown as HTMLAudioElement,
    writes
  };
}

describe('what a control write costs', () => {
  test('a pitch change rewrites the rate with the same value', () => {
    const node = fakeNode();
    const { element, writes } = recordingMediaElement();

    applySoundTouchParams(node as never, {
      tempo: 1,
      pitch: 1,
      keySemitones: 0,
      mediaElement: element
    });
    applySoundTouchParams(node as never, {
      tempo: 1,
      pitch: Math.pow(2, 3 / 12),
      keySemitones: 0,
      mediaElement: element
    });

    // Both writes are 1: the value never actually changes, so the decoder is
    // never re-rated, which is why PITCH is smooth.
    expect(writes).toEqual([1, 1]);
    expect(new Set(writes).size).toBe(1);
    expect(node.pitch.value).toBeCloseTo(Math.pow(2, 3 / 12));
  });

  test('a key change likewise leaves the rate alone', () => {
    const node = fakeNode();
    const { element, writes } = recordingMediaElement();

    applySoundTouchParams(node as never, {
      tempo: 1,
      pitch: 1,
      keySemitones: 0,
      mediaElement: element
    });
    applySoundTouchParams(node as never, {
      tempo: 1,
      pitch: 1,
      keySemitones: -2,
      mediaElement: element
    });

    expect(new Set(writes).size).toBe(1);
    expect(node.pitchSemitones.value).toBe(-2);
  });

  test('a tempo change is the one that re-rates the element', () => {
    const node = fakeNode();
    const { element, writes } = recordingMediaElement();

    applySoundTouchParams(node as never, {
      tempo: 1,
      pitch: 1,
      keySemitones: 0,
      mediaElement: element
    });
    applySoundTouchParams(node as never, {
      tempo: 1.1,
      pitch: 1,
      keySemitones: 0,
      mediaElement: element
    });

    expect(writes).toEqual([1, 1.1]);
    expect(node.playbackRate.value).toBeCloseTo(1.1);
  });

  test('rate stays clamped to the range SoundTouch supports', () => {
    const node = fakeNode();
    const { element, writes } = recordingMediaElement();

    applySoundTouchParams(node as never, {
      tempo: 9,
      pitch: 1,
      keySemitones: 0,
      mediaElement: element
    });
    applySoundTouchParams(node as never, {
      tempo: 0.01,
      pitch: 1,
      keySemitones: 0,
      mediaElement: element
    });

    expect(writes).toEqual([2, 0.5]);
  });

  test('no media element is not a crash', () => {
    const node = fakeNode();
    expect(() =>
      applySoundTouchParams(node as never, { tempo: 1.5, pitch: 1, keySemitones: 0 })
    ).not.toThrow();
    expect(node.playbackRate.value).toBeCloseTo(1.5);
  });

  test('a null node is a no-op', () => {
    expect(() =>
      applySoundTouchParams(null, { tempo: 1.5, pitch: 1, keySemitones: 0 })
    ).not.toThrow();
  });
});
