export interface LatencySample {
  label: string;
  ms: number;
  at: number;
}

const samples: LatencySample[] = [];

export function recordLatency(label: string, ms: number) {
  samples.push({ label, ms, at: performance.now() });
  if (samples.length > 200) samples.shift();
}

export function getLatencySamples() {
  return [...samples];
}

export function meanCutLatency() {
  const cuts = samples.filter((s) => s.label === 'pgm-cut');
  if (!cuts.length) return 0;
  return cuts.reduce((a, s) => a + s.ms, 0) / cuts.length;
}
