import { describe, expect, test } from 'vitest';
import { verifyHotSwapScreenshotEvidence } from '../../../scripts/verify-eight-video-proof-runner';
import type { EightVideoProofReport } from '$lib/qa/eightVideoProof';

describe('eight-video hot-swap artifact verifier', () => {
  test('rejects a missing hot-swap screenshot artifact', async () => {
    const report = {
      hotSwap: {
        steps: [{
          moduleId: 'transition',
          screenshot: {
            path: '.artifacts/eight-video-proof/hot-swap/does-not-exist.png',
            sha256: 'missing',
            nonBlackPixelRatio: 1
          }
        }]
      }
    } as unknown as EightVideoProofReport;

    await expect(verifyHotSwapScreenshotEvidence(report)).resolves.toEqual([
      'hot-swap screenshot is missing or unreadable: transition'
    ]);
  });
});
