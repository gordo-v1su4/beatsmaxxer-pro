import { describe, expect, test } from 'vitest';
import { mediaTimelineResyncAction } from '$lib/audio/AudioEngine';

describe('uploaded-media timeline resynchronization', () => {
  test('anchors validated playback to the actuator position', () => {
    expect(mediaTimelineResyncAction('playing', 0.82, 0.8)).toEqual({
      action: 'play', positionSeconds: 0.82
    });
  });

  test('routes stalls and pauses through the central pause mutation', () => {
    expect(mediaTimelineResyncAction('waiting', 4, 4)).toEqual({
      action: 'pause', positionSeconds: 4
    });
    expect(mediaTimelineResyncAction('pause', 4, 4)).toEqual({
      action: 'pause', positionSeconds: 4
    });
  });

  test('classifies explicit seeks and native loop wraps centrally', () => {
    expect(mediaTimelineResyncAction('seeking', 7, 3)).toMatchObject({
      action: 'seek', reason: 'seek', positionSeconds: 7
    });
    expect(mediaTimelineResyncAction('timeupdate', 0.02, 9.9)).toMatchObject({
      action: 'seek', reason: 'loop-wrap', positionSeconds: 0.02
    });
  });
});
