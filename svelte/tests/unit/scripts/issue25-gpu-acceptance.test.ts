import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const script = readFileSync(
  new URL('../../../scripts/run-issue25-gpu-acceptance.sh', import.meta.url),
  'utf8',
);

describe('run-issue25-gpu-acceptance.sh', () => {
  test('requires headed visual proof for full GPU acceptance (exit 1, not silent pass)', () => {
    expect(script).toContain('Headed visual proof is required for issue #25 GPU acceptance.');
    expect(script).toMatch(/PHYSICAL_BROWSER_OBSERVED[\s\S]*?exit 1/);
  });

  test('documents cloud-only path via SKIP_VISUAL_PROOF', () => {
    expect(script).toContain('SKIP_VISUAL_PROOF=1');
    expect(script).toContain('verify:issue25-cloud');
  });

  test('fails fast before unit tests when full GPU acceptance env is missing', () => {
    const proofIdx = script.indexOf('Headed visual proof is required for issue #25 GPU acceptance.');
    const unitIdx = script.indexOf('▶ issue #25 — unit tests');
    expect(proofIdx).toBeGreaterThan(-1);
    expect(unitIdx).toBeGreaterThan(proofIdx);
  });
});
