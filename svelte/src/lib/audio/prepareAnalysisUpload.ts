/** Keep rhythm uploads under Vercel's ~4.5 MB serverless body limit (multipart overhead included). */
const RHYTHM_UPLOAD_MAX_BYTES = 3_400_000;
const RHYTHM_SAMPLE_RATE_HZ = 22_050;
const RHYTHM_MAX_DURATION_S = 90;

/** Structure can use a lower rate and larger dev proxy budget to cover full songs. */
const STRUCTURE_UPLOAD_MAX_BYTES = 12_000_000;
const STRUCTURE_SAMPLE_RATE_HZ = 11_025;
const STRUCTURE_MAX_DURATION_S = 600;

/** all-in-one benefits from higher sample rate; keep within dev proxy upload budget. */
const STRUCTURE_ALLIN1_SAMPLE_RATE_HZ = 22_050;

export type AnalysisUploadProfile = "rhythm" | "structure" | "structure-allin1";

export interface PrepareAnalysisUploadOptions {
  profile?: AnalysisUploadProfile;
}

export async function prepareAnalysisUpload(
  file: File,
  options: PrepareAnalysisUploadOptions = {},
): Promise<File> {
  const profile = options.profile ?? "rhythm";
  const maxBytes = profile === "rhythm" ? RHYTHM_UPLOAD_MAX_BYTES : STRUCTURE_UPLOAD_MAX_BYTES;
  const maxDurationS = profile === "rhythm" ? RHYTHM_MAX_DURATION_S : STRUCTURE_MAX_DURATION_S;
  const preferredSampleRate =
    profile === "structure-allin1"
      ? STRUCTURE_ALLIN1_SAMPLE_RATE_HZ
      : profile === "structure"
        ? STRUCTURE_SAMPLE_RATE_HZ
        : RHYTHM_SAMPLE_RATE_HZ;
  const suffix =
    profile === "structure-allin1" ? "structure-allin1" : profile === "structure" ? "structure" : "analysis";

  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    const trimmedFrames = Math.min(
      decoded.length,
      Math.floor(maxDurationS * decoded.sampleRate),
    );
    if (trimmedFrames <= 0) {
      throw new Error("Audio file has no decodable samples for analysis.");
    }

    let durationSeconds = trimmedFrames / decoded.sampleRate;
    let sampleRate = preferredSampleRate;
    let pcm = resampleToMonoPcm16(decoded, trimmedFrames, sampleRate);

    while (estimateWavBytes(pcm.byteLength) > maxBytes && durationSeconds > 15) {
      durationSeconds *= 0.75;
      const frames = Math.min(decoded.length, Math.floor(durationSeconds * decoded.sampleRate));
      pcm = resampleToMonoPcm16(decoded, frames, sampleRate);
    }

    if (estimateWavBytes(pcm.byteLength) > maxBytes && sampleRate > 8_000) {
      sampleRate = 8_000;
      const frames = Math.min(decoded.length, Math.floor(durationSeconds * decoded.sampleRate));
      pcm = resampleToMonoPcm16(decoded, frames, sampleRate);
    }

    const wav = encodeWavMono16(pcm, sampleRate);
    const stem = file.name.replace(/\.[^.]+$/, "") || "upload";
    return new File([wav], `${stem}-${suffix}.wav`, { type: "audio/wav" });
  } finally {
    await ctx.close();
  }
}

function mixToMono(buffer: AudioBuffer, frameCount: number): Float32Array {
  const channels = buffer.numberOfChannels;
  const mono = new Float32Array(frameCount);
  if (channels === 1) {
    mono.set(buffer.getChannelData(0).subarray(0, frameCount));
    return mono;
  }
  for (let channel = 0; channel < channels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      mono[i] += data[i]! / channels;
    }
  }
  return mono;
}

function resampleToMonoPcm16(buffer: AudioBuffer, frameCount: number, targetRate: number): Int16Array {
  const mono = mixToMono(buffer, frameCount);
  const sourceRate = buffer.sampleRate;
  if (sourceRate === targetRate) {
    return floatToPcm16(mono);
  }

  const outLength = Math.max(1, Math.floor((frameCount * targetRate) / sourceRate));
  const out = new Int16Array(outLength);
  const ratio = sourceRate / targetRate;
  for (let i = 0; i < outLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const frac = position - index;
    const a = mono[Math.min(index, frameCount - 1)] ?? 0;
    const b = mono[Math.min(index + 1, frameCount - 1)] ?? a;
    out[i] = floatSampleToPcm16(a + (b - a) * frac);
  }
  return out;
}

function floatToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = floatSampleToPcm16(samples[i] ?? 0);
  }
  return out;
}

function floatSampleToPcm16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
}

function estimateWavBytes(pcmBytes: number) {
  return 44 + pcmBytes;
}

function encodeWavMono16(pcm: Int16Array, sampleRate: number): ArrayBuffer {
  const bytes = estimateWavBytes(pcm.byteLength);
  const buffer = new ArrayBuffer(bytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, pcm.byteLength, true);
  new Int16Array(buffer, 44).set(pcm);
  return buffer;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}
