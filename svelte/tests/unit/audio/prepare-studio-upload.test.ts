import { describe, expect, it } from "vitest";
import { isStudioMp3File, prepareStudioUpload } from "$lib/audio/prepareStudioUpload";

describe("prepareStudioUpload", () => {
  it("passes through MP3 files unchanged", () => {
    const file = new File([new Uint8Array(128)], "song.mp3", { type: "audio/mpeg" });
    expect(prepareStudioUpload(file)).toBe(file);
    expect(isStudioMp3File(file)).toBe(true);
  });

  it("rejects non-MP3 uploads", () => {
    const wav = new File([new Uint8Array(128)], "song.wav", { type: "audio/wav" });
    expect(() => prepareStudioUpload(wav)).toThrow(/MP3/i);
  });
});
