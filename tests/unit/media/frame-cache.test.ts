import { describe, expect, test } from "bun:test";
import {
  FrameCache,
  PresentationReceipt,
} from "../../../src/media/FrameCache";
import { FakeFrame } from "./fakes";

function identity(
  timestampUs: number,
  generation = 1,
  clipId = "clip-a",
) {
  return { clipId, generation, timestampUs };
}

describe("bounded frame cache ownership", () => {
  test("evicts least-recently-used frames and closes exactly once", () => {
    const cache = new FrameCache<FakeFrame>(2);
    const first = new FakeFrame(0);
    const second = new FakeFrame(33_333);
    const third = new FakeFrame(66_666);

    expect(cache.insert(identity(0), first)).toBe(true);
    expect(cache.insert(identity(33_333), second)).toBe(true);
    expect(cache.acquire(identity(33_333), "touch")?.release()).toBeUndefined();
    expect(cache.insert(identity(66_666), third)).toBe(true);

    expect(first.closeCount).toBe(1);
    expect(second.closeCount).toBe(0);
    cache.dispose();
    cache.dispose();
    expect(second.closeCount).toBe(1);
    expect(third.closeCount).toBe(1);
  });

  test("keeps a leased frame alive through the presentation receipt", () => {
    const cache = new FrameCache<FakeFrame>(1);
    const frame = new FakeFrame(0);
    cache.insert(identity(0), frame);
    const lease = cache.acquire(identity(0), "compositor");
    expect(lease).not.toBeNull();
    const receipt = PresentationReceipt.submitted(lease!);

    cache.clear();
    expect(frame.closeCount).toBe(0);
    expect(lease?.valid).toBe(true);
    expect(receipt.release()).toBeUndefined();
    expect(receipt.release()).toBeUndefined();
    expect(frame.closeCount).toBe(1);
    expect(lease?.valid).toBe(false);
  });

  test("transfer leaves one owner and clone owners close independently", () => {
    const cache = new FrameCache<FakeFrame>(1);
    const frame = new FakeFrame(0);
    cache.insert(identity(0), frame);
    const original = cache.acquire(identity(0), "main");
    const clone = original?.clone("worker-clone");
    const transferred = original?.transfer("worker-transfer");

    expect(original?.valid).toBe(false);
    expect(transferred?.valid).toBe(true);
    expect(clone?.valid).toBe(true);
    original?.release();
    expect(frame.closeCount).toBe(0);
    clone?.release();
    clone?.release();
    expect(frame.clones[0].closeCount).toBe(1);

    cache.clear();
    expect(frame.closeCount).toBe(0);
    transferred?.release();
    expect(frame.closeCount).toBe(1);
  });

  test("rejects an incoming frame when every cache owner is leased", () => {
    const cache = new FrameCache<FakeFrame>(1);
    const retained = new FakeFrame(0);
    const rejected = new FakeFrame(33_333);
    cache.insert(identity(0), retained);
    const lease = cache.acquire(identity(0), "presenter");

    expect(cache.insert(identity(33_333), rejected)).toBe(false);
    expect(rejected.closeCount).toBe(1);
    expect(retained.closeCount).toBe(0);
    lease?.release();
    cache.dispose();
    expect(retained.closeCount).toBe(1);
  });

  test("selects only the requested source and generation interval", () => {
    const cache = new FrameCache<FakeFrame>(4);
    const old = new FakeFrame(0, 40_000, "old");
    const current = new FakeFrame(0, 40_000, "current");
    const other = new FakeFrame(0, 40_000, "other");
    cache.insert(identity(0, 1), old);
    cache.insert(identity(0, 2), current);
    cache.insert(identity(0, 2, "clip-b"), other);

    const lease = cache.acquireForTimestamp(
      "clip-a",
      2,
      20_000,
      "selector",
    );
    expect(lease?.frame).toBe(current);
    lease?.release();
    cache.dispose();
  });
});
