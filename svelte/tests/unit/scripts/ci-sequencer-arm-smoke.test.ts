import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const script = readFileSync(
  new URL('../../../scripts/ci-sequencer-arm-smoke.sh', import.meta.url),
  'utf8',
);

describe('ci-sequencer-arm-smoke.sh (#25 CDP bundle)', () => {
  test('runs issue #25 QA autoload gates in order', () => {
    const cloudSmoke = script.indexOf('verify-cloud-smoke-runner.ts');
    const cut = script.indexOf('verify-sequencer-cut-runner.ts');
    const loop = script.indexOf('verify-sequencer-loop-runner.ts');
    const trigger = script.indexOf('verify-trigger-commit-runner.ts');
    const rec = script.indexOf('verify-arrangement-rec-runner.ts');
    const passed = script.indexOf('ci-sequencer-arm-smoke PASSED');

    for (const idx of [cloudSmoke, cut, loop, trigger, rec, passed]) {
      expect(idx).toBeGreaterThan(-1);
    }
    expect(cloudSmoke).toBeLessThan(cut);
    expect(cut).toBeLessThan(loop);
    expect(loop).toBeLessThan(trigger);
    expect(trigger).toBeLessThan(rec);
    expect(rec).toBeLessThan(passed);
  });

  test('uses ARM and loop-region QA URL params', () => {
    expect(script).toContain('qaSequencerArm=1');
    expect(script).toContain('qaLoopRegion=1');
    expect(script).toContain('qaAutoplay=1');
  });

  test('runs headless with dev server bootstrap', () => {
    expect(script).toContain('HEADLESS=1');
    expect(script).toContain('ensure_dev_server');
    expect(script).toContain('ensure-cloud-qa-media.sh');
  });
});
