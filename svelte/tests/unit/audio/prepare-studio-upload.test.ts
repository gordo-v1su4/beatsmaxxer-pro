import { describe, expect, it } from "vitest";
import { isStudioMp3File, prepareStudioUpload, prepareDesktopStudioUpload, DESKTOP_STUDIO_UPLOAD_MAX_BYTES } from "$lib/audio/prepareStudioUpload";

describe("prepareStudioUpload", () => {
  it('preserves the entire native WAV beyond the web upload limit', () => {
    const file = new File([new Uint8Array(38_559_738)], 'For Me.wav', { type: 'audio/wav' });
    expect(prepareDesktopStudioUpload(file)).toBe(file);
    expect(prepareDesktopStudioUpload(file).size).toBe(38_559_738);
  });

  it('rejects empty, unsupported and oversized native audio before IPC', () => {
    expect(() => prepareDesktopStudioUpload(new File([], 'empty.wav'))).toThrow(/empty/);
    expect(() => prepareDesktopStudioUpload(new File(['audio'], 'song.flac'))).toThrow(/WAV and MP3/);
    const file = new File(['audio'], 'song.wav');
    Object.defineProperty(file, 'size', { value: DESKTOP_STUDIO_UPLOAD_MAX_BYTES + 1 });
    expect(() => prepareDesktopStudioUpload(file)).toThrow(/256 MiB/);
  });
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
