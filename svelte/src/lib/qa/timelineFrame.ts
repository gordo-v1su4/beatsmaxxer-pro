import { AudioTimeline, type TimelineFrame } from '$lib/transport/AudioTimeline';

/** Build QA frames through the same clock/grid contract as production. */
export function qaTimelineFrame(positionSeconds: number, bpm = 120, playing = true): TimelineFrame {
  const timeline = new AudioTimeline();
  timeline.setBeatGrid([], bpm);
  timeline.seek(positionSeconds);
  if (playing) timeline.play(positionSeconds);
  const frame = timeline.publishFrame();
  timeline.dispose();
  return frame;
}
