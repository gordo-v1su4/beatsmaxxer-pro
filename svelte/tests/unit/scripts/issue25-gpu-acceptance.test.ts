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

  test('fails fast before unit tests when Redline test_media is missing', () => {
    expect(script).toContain('Redline test_media is required for issue #25 GPU acceptance.');
    expect(script).toContain('TEST_MEDIA_ROOT');
    const mediaIdx = script.indexOf('Redline test_media is required for issue #25 GPU acceptance.');
    const unitIdx = script.indexOf('▶ issue #25 — unit tests');
    expect(mediaIdx).toBeGreaterThan(-1);
    expect(unitIdx).toBeGreaterThan(mediaIdx);
  });

  test('clears HEADLESS and dev server before headed capture:visual-proof', () => {
    const captureIdx = script.indexOf('bun run capture:visual-proof');
    const headlessIdx = script.lastIndexOf('export HEADLESS=0', captureIdx);
    const cleanupIdx = script.lastIndexOf('cleanup_dev_server', captureIdx);
    expect(captureIdx).toBeGreaterThan(-1);
    expect(headlessIdx).toBeGreaterThan(-1);
    expect(cleanupIdx).toBeGreaterThan(-1);
    expect(headlessIdx).toBeLessThan(captureIdx);
    expect(cleanupIdx).toBeLessThan(captureIdx);
  });
});
