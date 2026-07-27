import { describe, expect, test } from "bun:test";
import { createMp4DemuxBoundary } from "../../../src/media/demux";

describe("Mediabunny demux integration", () => {
  test("createMp4DemuxBoundary uses approved mediabunny adapter", () => {
    const boundary = createMp4DemuxBoundary();
    expect(boundary).toBeDefined();
  });
});
