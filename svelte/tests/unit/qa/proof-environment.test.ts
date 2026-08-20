import { describe, expect, test } from 'vitest';
import { detectRuntime } from '$lib/platform/runtime';
import { isReleaseProofSurface, resolveProofEnvironment, resolveVideoSamplePath } from '$lib/qa/proofEnvironment';

describe('resolveProofEnvironment', () => {
  test('defaults to browser html-video in web runtime', () => {
    expect(detectRuntime()).toBe('web');
    expect(resolveProofEnvironment()).toEqual({
      shellKind: 'browser',
      sourceBackend: 'html-video',
      frameProducer: 'HTMLVideoElement.copyExternalImageToTexture',
      releaseEvidence: true,
      videoSourceKind: 'html-video'
    });
  });

  test('maps missing clip textures to unsupported in release surfaces', () => {
    expect(resolveVideoSamplePath(false, false, true)).toBe(
      isReleaseProofSurface() ? 'unsupported' : 'test-card'
    );
  });
});
