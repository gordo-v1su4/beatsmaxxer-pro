import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  readHostedAnalysisPreference,
  setHostedAnalysisPreference
} from '../../../src/lib/audio/hostedAnalysisPreference';

const source = (path: string) => readFileSync(resolve('src/lib', path), 'utf8');

/** Minimal in-memory Storage — the unit suite runs on node, which has none. */
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear()
  };
}

describe('hosted analysis preference', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', memoryStorage());
  });

  test('defaults to asking when nothing is stored', () => {
    expect(readHostedAnalysisPreference()).toBe('ask');
  });

  test('round-trips an explicit remembered choice', () => {
    setHostedAnalysisPreference('analyze');
    expect(readHostedAnalysisPreference()).toBe('analyze');
    setHostedAnalysisPreference('local');
    expect(readHostedAnalysisPreference()).toBe('local');
  });

  test('clearing restores the prompt', () => {
    setHostedAnalysisPreference('analyze');
    setHostedAnalysisPreference('ask');
    expect(readHostedAnalysisPreference()).toBe('ask');
    expect(globalThis.localStorage.getItem('bmx.hostedAnalysis.consent')).toBeNull();
  });

  test('a corrupted stored value falls back to asking, never to uploading', () => {
    globalThis.localStorage.setItem('bmx.hostedAnalysis.consent', 'yes-always-upload');
    expect(readHostedAnalysisPreference()).toBe('ask');
  });

  test('an absent storage API fails closed to asking', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readHostedAnalysisPreference()).toBe('ask');
    expect(() => setHostedAnalysisPreference('analyze')).not.toThrow();
  });

  test('unavailable storage fails closed to asking', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('storage disabled');
      },
      setItem() {
        throw new Error('storage disabled');
      },
      removeItem() {
        throw new Error('storage disabled');
      }
    });
    expect(readHostedAnalysisPreference()).toBe('ask');
    expect(() => setHostedAnalysisPreference('analyze')).not.toThrow();
  });
});

describe('TopBar consent boundary with remembered choices', () => {
  const topBar = source('components/TopBar.svelte');

  test('the prompt is only skipped forward from an explicit remembered choice', () => {
    // The branching this used to match verbatim now lives in planAudioUpload,
    // shared with the phone drawer and covered directly in
    // hosted-analysis-decision.test.ts -- which is a stronger guarantee than
    // string-matching one shell's source. What still has to hold here is that
    // TopBar asks that function and honours an 'ask' by opening the modal.
    expect(topBar).toContain('readHostedAnalysisPreference()');
    expect(topBar).toContain('planAudioUpload(');
    expect(topBar).toContain("if (plan.action === 'load') {");
    // No remembered value must still route through the modal.
    expect(topBar).toContain('pendingAudioFile = file;');
  });

  test('a choice is only persisted when the operator ticks remember', () => {
    expect(topBar).toContain('if (rememberChoice) {');
    expect(topBar).toContain('setHostedAnalysisPreference(choice);');
  });

  test('a remembered choice stays visible and revocable', () => {
    expect(topBar).toContain("analysisPreference !== 'ask'");
    expect(topBar).toContain('onclick={resetAnalysisPreference}');
    expect(topBar).toContain("setHostedAnalysisPreference('ask');");
  });

  test('remembered analyze is ignored when the build has no upload path', () => {
    expect(topBar).toContain('const hostedAnalysisAvailable = isHostedAnalysisEnabled();');
  });
});
