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

/** Wall-clock reads stay in this QA module: the render engine must never touch
 * performance.now directly (shared-timeline-authority contract). */
export function latencyMarkNow(): number {
  return performance.now();
}

export function recordLatencySince(label: string, startMark: number) {
  recordLatency(label, performance.now() - startMark);
}

export function getLatencySamples() {
  return [...samples];
}

export function meanCutLatency() {
  const cuts = samples.filter((s) => s.label === 'pgm-cut');
  if (!cuts.length) return 0;
  return cuts.reduce((a, s) => a + s.ms, 0) / cuts.length;
}
