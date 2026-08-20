import { describe, expect, test, vi } from "vitest";
import { AudioTimeline } from "$lib/transport";

function context(currentTime = 0, sampleRate = 48_000) {
  return { currentTime, sampleRate };
}

describe("AudioTimeline", () => {
  test("is slaved to context time and remains continuous across rate and pause changes", () => {
    const ctx = context();
    const timeline = new AudioTimeline();
    timeline.bindContext(ctx);
    timeline.play();
    ctx.currentTime = 1;
    expect(timeline.publishFrame().positionSeconds).toBe(1);

    timeline.setPlaybackRate(2);
    ctx.currentTime = 1.5;
    expect(timeline.publishFrame().positionSeconds).toBe(2);
    timeline.pause();
    ctx.currentTime = 3;
    expect(timeline.publishFrame().positionSeconds).toBe(2);
    timeline.play();
    ctx.currentTime = 3.25;
    expect(timeline.publishFrame().positionSeconds).toBe(2.5);
  });

  test("follows a media actuator without bumping generation for small clock error", () => {
    const ctx = context();
    const timeline = new AudioTimeline();
    timeline.bindContext(ctx);
    timeline.play();
    ctx.currentTime = 1;
    const before = timeline.publishFrame();

    ctx.currentTime = 1.04;
    timeline.followPosition(1.03);
    const followed = timeline.publishFrame();
    expect(followed.positionSeconds).toBeCloseTo(1.03);
    expect(followed.generation).toBe(before.generation);
  });

  test("treats a large follow jump as a discontinuity so actuators can seek", () => {
    const ctx = context();
    const timeline = new AudioTimeline();
    timeline.bindContext(ctx);
    timeline.play();
    ctx.currentTime = 1;
    const before = timeline.publishFrame();

    timeline.followPosition(8);
    const jumped = timeline.publishFrame();
    expect(jumped.positionSeconds).toBe(8);
    expect(jumped.generation).toBe(before.generation + 1);
    expect(jumped.reason).toBe("seek");
  });

  test("does not apply playback rate twice to the fallback beat grid", () => {
    const ctx = context();
    const timeline = new AudioTimeline();
    timeline.bindContext(ctx);
    timeline.setPlaybackRate(2);
    (timeline.setBeatGrid as unknown as (
      beats: readonly number[],
      effectiveBpm: number,
      sourceBpm: number,
    ) => void)([], 256, 128);
    timeline.play();

    ctx.currentTime = 1;
    const frame = timeline.publishFrame();
    expect(frame.positionSeconds).toBe(2);
    expect(frame.beatPosition).toBeCloseTo(128 / 30);
    expect(frame.bpm).toBe(256);
  });

  test("publishes sample-precise ids and increments generation for discontinuities", () => {
    const ctx = context(1 / 48_000);
    const timeline = new AudioTimeline();
    timeline.bindContext(ctx);
    timeline.configureSource({ id: "track", durationSeconds: 2, loop: true });
    timeline.play();
    const first = timeline.publishFrame();
    expect(first.audioFrameId).toBe(1);
    const generation = first.generation;

    timeline.seek(1.9);
    ctx.currentTime += 0.2;
    const wrapped = timeline.publishFrame();
    expect(wrapped.reason).toBe("loop-wrap");
    expect(wrapped.generation).toBe(generation + 2);
    expect(wrapped.positionSeconds).toBeCloseTo(0.1);
  });

  test("dispatches the same frozen frame in stable order and defers mutations", () => {
    const timeline = new AudioTimeline();
    timeline.bindContext(context());
    const calls: string[] = [];
    const frames: unknown[] = [];
    const late = vi.fn(() => calls.push("late"));
    let addedLate = false;
    timeline.subscribe((frame) => {
      calls.push("analysis");
      frames.push(frame);
      if (!addedLate) {
        addedLate = true;
        timeline.subscribe(late, 5);
      }
    }, 0);
    timeline.subscribe((frame) => {
      calls.push("render");
      frames.push(frame);
    }, 10);

    const first = timeline.publishFrame();
    expect(calls).toEqual(["analysis", "render"]);
    expect(frames[0]).toBe(first);
    expect(frames[1]).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.events)).toBe(true);

    timeline.publishFrame();
    expect(calls.slice(2)).toEqual(["analysis", "late", "render"]);
    expect(() => timeline.subscribe(late)).toThrow(/already registered/);
  });

  test("rejects duplicate subscribers while their registration is deferred", () => {
    const timeline = new AudioTimeline();
    timeline.bindContext(context());
    const late = vi.fn();
    let registered = false;

    timeline.subscribe(() => {
      if (registered) return;
      registered = true;
      timeline.subscribe(late, 5);
      expect(() => timeline.subscribe(late, 6)).toThrow(/already registered/);
    });

    timeline.publishFrame();
    timeline.publishFrame();
    expect(late).toHaveBeenCalledTimes(1);
  });
});
