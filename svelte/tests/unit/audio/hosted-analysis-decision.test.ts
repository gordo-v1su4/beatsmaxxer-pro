import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { planAudioUpload } from '$lib/audio/hostedAnalysisDecision';

const source = (path: string) => readFileSync(resolve('src/lib', path), 'utf8');

describe('hosted analysis upload decision', () => {
  test('no stored answer asks before anything leaves the device', () => {
    expect(planAudioUpload('ask', true)).toEqual({ action: 'ask' });
  });

  test('a remembered answer is honoured without asking again', () => {
    expect(planAudioUpload('analyze', true)).toEqual({ action: 'load', hostedAnalysis: true });
    expect(planAudioUpload('local', true)).toEqual({ action: 'load', hostedAnalysis: false });
  });

  test('absence of an answer is never read as consent', () => {
    // The only way to reach hostedAnalysis true is an explicit stored 'analyze'.
    const plans = (['ask', 'local'] as const).map((p) => planAudioUpload(p, true));
    expect(plans.every((plan) => plan.action === 'ask' || plan.hostedAnalysis === false)).toBe(true);
  });

  test('a build without hosted analysis loads locally and never prompts', () => {
    // Prompting offers a choice that cannot be honoured, and answering ANALYZE
    // would start an upload with nowhere to go.
    for (const preference of ['ask', 'analyze', 'local'] as const) {
      expect(planAudioUpload(preference, false)).toEqual({
        action: 'load',
        hostedAnalysis: false
      });
    }
  });
});

describe('both shells route uploads through the shared decision', () => {
  test('the phone drawer asks before taking the hosted path', () => {
    // Mobile used to call loadAudioFile with no options at all, which reads as
    // hostedAnalysis undefined -- so Essentia was never called from a phone and
    // every song load quietly took the weaker realtime beat grid.
    const drawer = source('mobile/MobileDrawer.svelte');

    expect(drawer).toContain('planAudioUpload(');
    expect(drawer).toContain('MobileAnalysisConsent');
    // The bare call is what regressed before; it must not come back.
    expect(drawer).not.toMatch(/loadAudioFile\(\s*file\s*\)/);
    expect(drawer).toContain('hostedAnalysis');
  });

  test('the desktop bar uses the same rule rather than its own copy', () => {
    const topBar = source('components/TopBar.svelte');

    expect(topBar).toContain('planAudioUpload(');
    expect(topBar).not.toContain("remembered === 'analyze'");
  });

  test('cancelling on the phone loads nothing', () => {
    const drawer = source('mobile/MobileDrawer.svelte');
    const resolver = drawer.slice(
      drawer.indexOf('async function resolveConsent'),
      drawer.indexOf('function close()')
    );
    expect(resolver).toContain("choice === 'cancel'");
    expect(resolver.indexOf("choice === 'cancel'")).toBeLessThan(
      resolver.indexOf('loadTrack(')
    );
  });
});
