/** Shared analyser maths for headed visual proof and live UI ticks. */

export function rmsFromFloatTimeDomain(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

function normalizedByteSampleSumSquares(td: Uint8Array): number {
  if (td.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < td.length; i++) {
    const s = (td[i]! - 128) / 128;
    sum += s * s;
  }
  return sum;
}

export function rmsFromByteTimeDomain(td: Uint8Array): number {
  if (td.length === 0) return 0;
  return Math.sqrt(normalizedByteSampleSumSquares(td) / td.length);
}

export function amplitudePeakFromByteTimeDomain(td: Uint8Array): number {
  if (td.length === 0) return 0;
  return Math.min(1, Math.sqrt(normalizedByteSampleSumSquares(td) / td.length) * 1.8);
}
