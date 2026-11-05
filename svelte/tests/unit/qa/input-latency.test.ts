import { describe, expect, test } from 'vitest';
import { evaluateInputLatency, type InputLatencySample } from '../../../scripts/qa/inputLatency';

const limits = { p95Ms: 100, maxMs: 150 };
function samples(): InputLatencySample[] {
  return Array.from({ length: 20 }, (_, index) => ({ trusted: true, expected: index,
    eventAt: 100, capturedAt: 101, previousFrame: index, domAt: 102,
    renderAt: 100 + index + 3, renderedFrame: index + 1, gpuCompleteAt: 130 }));
}
describe('input-to-render acceptance evidence', () => {
  test('reports nearest-rank percentiles without mutating evidence', () => {
    const evidence = samples(), result = evaluateInputLatency(evidence, 20, limits);
    expect(result.pass).toBe(true);
    expect(result.encoded).toEqual({ count: 20, p50Ms: 12, p95Ms: 21, maxMs: 22 });
    expect(evidence[0].expected).toBe(0);
  });
  test('fails empty and partially observed drags', () => {
    expect(evaluateInputLatency([], 20, limits).pass).toBe(false);
    const evidence = samples(); evidence[2].renderAt = null;
    expect(evaluateInputLatency(evidence, 20, limits).errors).toContain('Sample 2: missing matching new rendered frame');
    expect(evaluateInputLatency(evidence.slice(1), 20, limits).pass).toBe(false);
  });
  test('rejects synthetic input and stale matching mix from before the event', () => {
    const evidence = samples(); evidence[0].trusted = false; evidence[1].renderedFrame = evidence[1].previousFrame;
    expect(evaluateInputLatency(evidence, 20, limits).pass).toBe(false);
  });
  test('rejects missing DOM or GPU completion and invalid timestamps', () => {
    for (const override of [{ domAt: null }, { gpuCompleteAt: null }, { eventAt: NaN }, { capturedAt: 99 }]) {
      const evidence = samples(); Object.assign(evidence[0], override);
      expect(evaluateInputLatency(evidence, 20, limits).pass).toBe(false);
    }
  });
  test('fails an isolated maximum breach even when p95 is acceptable', () => {
    const evidence = samples(); evidence[19].renderAt = 300; evidence[19].gpuCompleteAt = 301;
    const result = evaluateInputLatency(evidence, 20, limits);
    expect(result.encoded.p95Ms).toBe(21);
    expect(result.errors).toContain('encoded maximum exceeded 150ms');
  });
});
