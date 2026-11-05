export interface InputLatencySample {
  trusted: boolean; expected: number; eventAt: number; capturedAt: number;
  previousFrame: number; domAt: number | null; renderAt: number | null;
  renderedFrame: number | null; gpuCompleteAt: number | null;
}

export function evaluateInputLatency(samples: InputLatencySample[], expectedCount: number, limits: { p95Ms: number; maxMs: number }) {
  const errors: string[] = [];
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 10) errors.push('At least ten intended samples required');
  if (![limits.p95Ms, limits.maxMs].every(value => Number.isFinite(value) && value > 0)) errors.push('Invalid latency limits');
  if (samples.length !== expectedCount) errors.push(`Coverage ${samples.length}/${expectedCount}`);
  const dom: number[] = [], encoded: number[] = [], gpu: number[] = [], queue: number[] = [];
  for (const [index, sample] of samples.entries()) {
    if (!sample.trusted || !Number.isFinite(sample.expected) ||
        !Number.isFinite(sample.eventAt) || !Number.isFinite(sample.capturedAt) ||
        sample.eventAt > sample.capturedAt || !Number.isFinite(sample.previousFrame)) {
      errors.push(`Sample ${index}: untrusted or invalid event`); continue;
    }
    queue.push(sample.capturedAt - sample.eventAt);
    if (sample.domAt === null || !Number.isFinite(sample.domAt) || sample.domAt < sample.capturedAt)
      errors.push(`Sample ${index}: missing DOM update`);
    else dom.push(sample.domAt - sample.eventAt);
    if (sample.renderAt === null || !Number.isFinite(sample.renderAt) || sample.renderAt < sample.capturedAt ||
        sample.renderedFrame === null || !Number.isFinite(sample.renderedFrame) || sample.renderedFrame <= sample.previousFrame)
      errors.push(`Sample ${index}: missing matching new rendered frame`);
    else encoded.push(sample.renderAt - sample.eventAt);
    if (sample.gpuCompleteAt === null || !Number.isFinite(sample.gpuCompleteAt) ||
        sample.renderAt === null || sample.gpuCompleteAt < sample.renderAt)
      errors.push(`Sample ${index}: missing GPU completion`);
    else gpu.push(sample.gpuCompleteAt - sample.eventAt);
  }
  const summary = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const percentile = (p: number) => sorted.length ? sorted[Math.ceil(p * sorted.length) - 1] : null;
    return { count: sorted.length, p50Ms: percentile(.5), p95Ms: percentile(.95), maxMs: sorted.at(-1) ?? null };
  };
  const result = { eventQueue: summary(queue), dom: summary(dom), encoded: summary(encoded), gpuCompletion: summary(gpu) };
  for (const metric of ['dom', 'encoded'] as const) {
    if ((result[metric].p95Ms ?? Infinity) > limits.p95Ms) errors.push(`${metric} p95 exceeded ${limits.p95Ms}ms`);
    if ((result[metric].maxMs ?? Infinity) > limits.maxMs) errors.push(`${metric} maximum exceeded ${limits.maxMs}ms`);
  }
  return { pass: errors.length === 0, errors, expectedCount, ...result };
}
