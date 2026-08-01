import { describe, expect, test } from "vitest";
import { prepareAnalysisUpload } from "$lib/audio/prepareAnalysisUpload";

function buildToneWav(durationSeconds: number, sampleRate = 44_100): ArrayBuffer {
  const frameCount = Math.floor(durationSeconds * sampleRate);
  const pcm = new Int16Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    pcm[i] = Math.round(Math.sin((i / sampleRate) * 440 * Math.PI * 2) * 12_000);
  }

  const bytes = 44 + pcm.byteLength;
  const buffer = new ArrayBuffer(bytes);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  write(0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  new Int16Array(buffer, 44).set(pcm);
  return buffer;
}

describe("prepareAnalysisUpload", () => {
  test("passes through small files unchanged", async () => {
    const wav = buildToneWav(8);
    const source = new File([wav], "short-track.wav", { type: "audio/wav" });

    const prepared = await prepareAnalysisUpload(source);

    expect(prepared).toBe(source);
  });

  test.runIf(typeof AudioContext !== "undefined")(
    "shrinks large uploads below the Vercel proxy budget",
    async () => {
      const wav = buildToneWav(120);
      const source = new File([wav], "long-track.wav", { type: "audio/wav" });
      expect(source.size).toBeGreaterThan(3_400_000);

      const prepared = await prepareAnalysisUpload(source);

      expect(prepared.size).toBeLessThan(3_400_000);
      expect(prepared.type).toBe("audio/wav");
      expect(prepared.name.endsWith("-analysis.wav")).toBe(true);
    },
  );
});
