import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const script = readFileSync(
  new URL('../../../scripts/run-issue25-gpu-acceptance.sh', import.meta.url),
  'utf8',
);

describe('run-issue25-gpu-acceptance.sh', () => {
  test('requires headed visual proof for full GPU acceptance (no silent exit 0)', () => {
    expect(script).toContain('Headed visual proof is required for issue #25 GPU acceptance.');
    expect(script).toMatch(/PHYSICAL_BROWSER_OBSERVED.*exit 1/s);
    expect(script).not.toMatch(
      /PHYSICAL_BROWSER_OBSERVED[\s\S]*?exit 0\s*\nfi\s*\n\s*if \[\[ -d "\$ROOT\/\.\.\/test_media"/,
    );
  });

  test('documents cloud-only path via SKIP_VISUAL_PROOF', () => {
    expect(script).toContain('SKIP_VISUAL_PROOF=1');
    expect(script).toContain('verify:issue25-cloud');
  });
});
