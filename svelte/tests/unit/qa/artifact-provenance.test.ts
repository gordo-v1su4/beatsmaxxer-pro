import { describe, expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  PROOF_MAX_AGE_MS,
  createArtifactProvenance,
  validateArtifactProvenance,
  type ArtifactProvenance
} from '$lib/qa/artifactProvenance';

function validProvenance(): ArtifactProvenance {
  return createArtifactProvenance({
    captureId: '12345678-1234-4234-8234-123456789abc',
    capturedAt: new Date().toISOString(),
    source: { commit: 'a'.repeat(40), digest: 'b'.repeat(64), workingTreeDirty: false },
    build: { id: 'c'.repeat(64), digest: 'c'.repeat(64), profile: 'production' },
    server: { kind: 'vite-production-preview', origin: 'http://127.0.0.1:5194', buildDigest: 'c'.repeat(64) },
    dependencyLock: { path: 'bun.lock', sha256: 'd'.repeat(64) },
    environment: {
      shellKind: 'browser', sourceBackend: 'html-video',
      frameProducer: 'HTMLVideoElement.copyExternalImageToTexture', releaseEvidence: true,
      webgpuAvailable: true,
      runtime: { name: 'Chrome', version: '128.0', userAgent: 'Chrome/128.0' },
      device: { operatingSystem: 'darwin', architecture: 'arm64', model: 'Mac', gpuIdentity: 'Apple M3' }
    },
    capabilities: {
      webgpu: 'passed', mediaAdvance: 'passed', bpmMatch: 'passed',
      primarySamples: 'passed', contentIntegrity: 'passed'
    },
    contentIntegrity: {
      algorithm: 'sha256', requiredPrimarySampleCount: 1,
      assets: [{ name: 'clip.mp4', sha256: 'e'.repeat(64), size: 1000 }],
      primarySamples: [{
        assetName: 'clip.mp4', assetSha256: 'e'.repeat(64),
        observedSource: 'blob:clip', rendererSource: 'blob:clip', sourceBackend: 'html-video',
        frameProducer: 'HTMLVideoElement.copyExternalImageToTexture', sourceFrameId: 42,
        sourceTimestampSeconds: 1.25, outputFrameSha256: 'f'.repeat(64), width: 1920, height: 1080
      }]
    }
  });
}

describe('shared release-proof artifact provenance', () => {
  test('accepts a current production browser HTML-video proof', () => {
    expect(validateArtifactProvenance(validProvenance())).toEqual([]);
  });

  test('fails closed on missing or invalid provenance', () => {
    expect(validateArtifactProvenance(undefined)).toContain('artifact provenance is missing or has an unsupported schema');
    const value = validProvenance();
    value.source.commit = 'not-a-commit';
    expect(validateArtifactProvenance(value)).toContain('source commit identity is missing or invalid');
  });

  test('fails closed on stale provenance under the concrete 24-hour policy', () => {
    const capturedAt = Date.now() - PROOF_MAX_AGE_MS - 1;
    const value = validProvenance();
    value.capturedAt = new Date(capturedAt).toISOString();
    value.freshness.expiresAt = new Date(capturedAt + PROOF_MAX_AGE_MS).toISOString();
    expect(validateArtifactProvenance(value)).toContain('artifact provenance is stale');
  });

  test.each([
    ['webgpu', 'WebGPU is false or unavailable in captured provenance'],
    ['mediaAdvance', 'required capability did not pass: mediaAdvance'],
    ['bpmMatch', 'required capability did not pass: bpmMatch'],
    ['primarySamples', 'required capability did not pass: primarySamples'],
    ['contentIntegrity', 'required capability did not pass: contentIntegrity']
  ] as const)('fails closed when %s did not pass', (capability, expected) => {
    const value = validProvenance();
    value.capabilities[capability] = 'failed';
    if (capability === 'webgpu') value.environment.webgpuAvailable = false;
    expect(validateArtifactProvenance(value)).toContain(expected);
  });

  test('rejects shell/backend producer mismatches and synthetic release evidence', () => {
    const mismatch = validProvenance();
    mismatch.environment.frameProducer = 'test-synthetic';
    expect(validateArtifactProvenance(mismatch)).toContain('shell/source-backend frame producer mismatch');

    const synthetic = validProvenance();
    synthetic.environment.sourceBackend = 'test-synthetic';
    synthetic.environment.frameProducer = 'test-synthetic';
    synthetic.contentIntegrity.primarySamples[0]!.sourceBackend = 'test-synthetic';
    synthetic.contentIntegrity.primarySamples[0]!.frameProducer = 'test-synthetic';
    expect(validateArtifactProvenance(synthetic)).toContain('test-synthetic backend cannot be release evidence');
  });

  test('rejects missing primary samples and content that is not tied to the supplied asset', () => {
    const missing = validProvenance();
    missing.contentIntegrity.primarySamples = [];
    expect(validateArtifactProvenance(missing)).toContain('primary content-integrity samples are missing');

    const mismatched = validProvenance();
    mismatched.contentIntegrity.primarySamples[0]!.assetSha256 = '0'.repeat(64);
    mismatched.contentIntegrity.primarySamples[0]!.rendererSource = 'blob:other';
    const blockers = validateArtifactProvenance(mismatched);
    expect(blockers).toContain('content-integrity asset hash mismatch: clip.mp4');
    expect(blockers).toContain('content-integrity source diagnostics mismatch: clip.mp4');
  });

  test('rejects dev or mismatched server identity presented as production release evidence', () => {
    const dev = validProvenance();
    dev.build.profile = 'release-equivalent-diagnostic';
    expect(validateArtifactProvenance(dev)).toContain('browser release evidence was not served from the captured production preview');

    const mismatched = validProvenance();
    mismatched.server.buildDigest = '0'.repeat(64);
    expect(validateArtifactProvenance(mismatched)).toContain('release server identity is missing or does not match the captured build');
  });

  test('records tauri-desktop truth as HTMLVideoElement to copyExternalImageToTexture', () => {
    const value = validProvenance();
    value.environment.shellKind = 'tauri-desktop';
    value.server = { kind: 'tauri-bundled-static', origin: 'http://tauri.localhost', buildDigest: value.build.digest };
    value.environment.runtime = { name: 'Tauri WebView', version: '2.0', userAgent: 'WebView2' };
    expect(validateArtifactProvenance(value)).toEqual([]);
  });

  test('aggregate local verification requires both current proof reports before claiming completion', async () => {
    const script = await readFile('scripts/verify-local.sh', 'utf8');
    expect(script).toContain('bun scripts/verify-visual-proof-runner.ts');
    expect(script).toContain('bun scripts/verify-eight-video-proof-runner.ts');
    expect(script.indexOf('verify-eight-video-proof-runner.ts')).toBeLessThan(script.indexOf('All local and required current physical-browser proof gates passed'));
  });

  test('capture shells own a strict production preview and never attach to dev or qaAutoplay', async () => {
    for (const path of ['scripts/capture-visual-proof.sh', 'scripts/capture-eight-video-proof.sh']) {
      const script = await readFile(path, 'utf8');
      expect(script).toContain('bun run build');
      expect(script).toContain('ensure_production_preview');
      expect(script).not.toContain('ensure_dev_server');
      expect(script).not.toContain('qaAutoplay');
      expect(script.indexOf('bun run build')).toBeLessThan(script.indexOf('ensure_production_preview'));
    }
    const common = await readFile('scripts/lib/common.sh', 'utf8');
    expect(common).toContain('bun run preview --host 127.0.0.1');
    expect(common).toContain('--strictPort');
    expect(common).toContain('already serving an unowned process');
  });
});
