/**
 * Offline BPM ground truth for a WAV file: spectral-flux onsets + tempo autocorrelation.
 * Used to sanity-check what the Essentia service and the realtime fallback report.
 */
const filePath = process.argv[2];
if (!filePath) {
  console.error("usage: bun run scripts/estimate-bpm.ts <file.wav>");
  process.exit(1);
}

const bytes = new Uint8Array(await Bun.file(filePath).arrayBuffer());
const view = new DataView(bytes.buffer);

function readChunks() {
  let offset = 12;
  let fmt: { channels: number; sampleRate: number; bits: number } | null = null;
  let data: { start: number; length: number } | null = null;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      fmt = {
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      data = { start: body, length: Math.min(size, bytes.length - body) };
    }
    offset = body + size + (size % 2);
  }
  return { fmt, data };
}

const { fmt, data } = readChunks();
if (!fmt || !data) throw new Error("Unsupported WAV: missing fmt/data chunk");
if (fmt.bits !== 16) throw new Error(`Expected 16-bit PCM, got ${fmt.bits}-bit`);

const frameCount = Math.floor(data.length / (2 * fmt.channels));
const mono = new Float32Array(frameCount);
for (let i = 0; i < frameCount; i++) {
  let sum = 0;
  for (let c = 0; c < fmt.channels; c++) {
    sum += view.getInt16(data.start + (i * fmt.channels + c) * 2, true) / 32768;
  }
  mono[i] = sum / fmt.channels;
}

// Onset envelope: rectified energy difference over ~11.6ms hops.
const hop = 512;
const frames = Math.floor(mono.length / hop);
const envelope = new Float32Array(frames);
let previous = 0;
for (let f = 0; f < frames; f++) {
  let energy = 0;
  for (let i = f * hop; i < (f + 1) * hop; i++) energy += mono[i] * mono[i];
  energy = Math.sqrt(energy / hop);
  envelope[f] = Math.max(0, energy - previous);
  previous = energy;
}

const envRate = fmt.sampleRate / hop;
let mean = 0;
for (const value of envelope) mean += value;
mean /= frames;
for (let f = 0; f < frames; f++) envelope[f] -= mean;

// Autocorrelate over 60-200 BPM and score each candidate plus its harmonics.
const best: Array<{ bpm: number; score: number }> = [];
for (let bpm = 60; bpm <= 200; bpm += 0.1) {
  const lag = Math.round((60 / bpm) * envRate);
  if (lag < 2 || lag >= frames) continue;
  let score = 0;
  for (let multiple = 1; multiple <= 4; multiple++) {
    const offset = lag * multiple;
    if (offset >= frames) break;
    let sum = 0;
    for (let f = 0; f + offset < frames; f++) sum += envelope[f] * envelope[f + offset];
    score += sum / (frames - offset);
  }
  best.push({ bpm: +bpm.toFixed(1), score });
}
best.sort((a, b) => b.score - a.score);

const top: Array<{ bpm: number; score: number }> = [];
for (const candidate of best) {
  if (top.some((entry) => Math.abs(entry.bpm - candidate.bpm) < 3)) continue;
  top.push(candidate);
  if (top.length === 5) break;
}

console.log(`file: ${filePath}`);
console.log(
  `duration: ${(frameCount / fmt.sampleRate).toFixed(1)}s  rate: ${fmt.sampleRate}Hz  channels: ${fmt.channels}`,
);
console.log("top tempo candidates:");
for (const entry of top) {
  console.log(`  ${entry.bpm.toFixed(1)} BPM  (score ${entry.score.toExponential(3)})`);
}
