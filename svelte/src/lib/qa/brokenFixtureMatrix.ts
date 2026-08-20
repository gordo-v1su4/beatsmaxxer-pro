import {
  PROOF_MAX_AGE_MS,
  createArtifactProvenance,
  validateArtifactProvenance,
  type ArtifactProvenance,
  type ProofCapabilityStatus
} from '$lib/qa/artifactProvenance';
import { evaluateEightVideoProof, type EightVideoProofReport } from '$lib/qa/eightVideoProof';
import { evaluateVisualProofReport, type VisualProofReport } from '$lib/qa/visualProof';

export type BrokenFixtureKind = 'provenance-only' | 'visual-proof' | 'eight-video-proof';

export interface BrokenFixtureCase {
  id: string;
  kind: BrokenFixtureKind;
  expectedBlocker: string;
}

export const M0_BROKEN_FIXTURE_MATRIX: BrokenFixtureCase[] = [
  { id: 'stale-provenance', kind: 'provenance-only', expectedBlocker: 'artifact provenance is stale' },
  { id: 'webgpu-false', kind: 'provenance-only', expectedBlocker: 'WebGPU is false or unavailable in captured provenance' },
  { id: 'zero-media-advance', kind: 'provenance-only', expectedBlocker: 'required capability did not pass: mediaAdvance' },
  { id: 'bpm-mismatch', kind: 'provenance-only', expectedBlocker: 'required capability did not pass: bpmMatch' },
  { id: 'missing-primary-samples', kind: 'provenance-only', expectedBlocker: 'primary content-integrity samples are missing' },
  { id: 'test-synthetic-backend', kind: 'provenance-only', expectedBlocker: 'test-synthetic backend cannot be release evidence' },
  { id: 'missing-visual-proof', kind: 'visual-proof', expectedBlocker: 'missing visual proof:' },
  { id: 'zero-media-advance-visual', kind: 'visual-proof', expectedBlocker: 'real MP4 was not visibly decoded and moving:' },
  { id: 'bpm-mismatch-visual', kind: 'visual-proof', expectedBlocker: 'Redline BPM mismatch: expected 125' },
  { id: 'zero-media-advance-eight', kind: 'eight-video-proof', expectedBlocker: 'slot did not play concurrently:' },
  { id: 'bpm-mismatch-eight', kind: 'eight-video-proof', expectedBlocker: 'Redline BPM mismatch: expected 125' },
  { id: 'webgpu-false-eight', kind: 'eight-video-proof', expectedBlocker: 'WebGPU is false or unavailable in captured provenance' }
];

export function buildValidProvenance(nowMs = Date.now()): ArtifactProvenance {
  return createArtifactProvenance({
    captureId: '12345678-1234-4234-8234-123456789abc',
    capturedAt: new Date(nowMs).toISOString(),
    source: { commit: 'a'.repeat(40), digest: 'b'.repeat(64), workingTreeDirty: false },
    build: { id: 'c'.repeat(64), digest: 'c'.repeat(64), profile: 'production' },
    server: {
      kind: 'vite-production-preview',
      origin: 'http://127.0.0.1:5194',
      buildDigest: 'c'.repeat(64),
      versionPath: '/_app/version.json',
      version: 'current-build',
      versionSha256: 'e'.repeat(64)
    },
    dependencyLock: { path: 'bun.lock', sha256: 'd'.repeat(64) },
    environment: {
      shellKind: 'browser',
      sourceBackend: 'html-video',
      frameProducer: 'HTMLVideoElement.copyExternalImageToTexture',
      releaseEvidence: true,
      webgpuAvailable: true,
      runtime: { name: 'Chrome', version: '128.0', userAgent: 'Chrome/128.0' },
      device: { operatingSystem: 'darwin', architecture: 'arm64', model: 'Apple M3', gpuIdentity: 'apple metal M3 native' }
    },
    capabilities: {
      webgpu: 'passed',
      mediaAdvance: 'passed',
      bpmMatch: 'passed',
      primarySamples: 'passed',
      contentIntegrity: 'passed'
    },
    contentIntegrity: {
      algorithm: 'sha256',
      requiredPrimarySampleCount: 1,
      assets: [{ name: 'clip.mp4', sha256: 'e'.repeat(64), size: 1000 }],
      primarySamples: [{
        assetName: 'clip.mp4',
        assetSha256: 'e'.repeat(64),
        observedSource: 'blob:clip',
        rendererSource: 'blob:clip',
        sourceBackend: 'html-video',
        frameProducer: 'HTMLVideoElement.copyExternalImageToTexture',
        sourceFrameId: 42,
        sourceTimestampSeconds: 1.25,
        outputFrameSha256: 'f'.repeat(64),
        width: 1920,
        height: 1080
      }]
    }
  });
}

function setCapability(
  provenance: ArtifactProvenance,
  capability: keyof ArtifactProvenance['capabilities'],
  status: ProofCapabilityStatus
) {
  provenance.capabilities[capability] = status;
}

export function buildBrokenProvenance(id: string, nowMs = Date.now()): ArtifactProvenance {
  const provenance = buildValidProvenance(nowMs);
  switch (id) {
    case 'stale-provenance': {
      const capturedAt = nowMs - PROOF_MAX_AGE_MS - 1;
      provenance.capturedAt = new Date(capturedAt).toISOString();
      provenance.freshness.expiresAt = new Date(capturedAt + PROOF_MAX_AGE_MS).toISOString();
      return provenance;
    }
    case 'webgpu-false':
      provenance.environment.webgpuAvailable = false;
      setCapability(provenance, 'webgpu', 'failed');
      return provenance;
    case 'zero-media-advance':
      setCapability(provenance, 'mediaAdvance', 'failed');
      return provenance;
    case 'bpm-mismatch':
      setCapability(provenance, 'bpmMatch', 'failed');
      return provenance;
    case 'missing-primary-samples':
      provenance.contentIntegrity.primarySamples = [];
      setCapability(provenance, 'primarySamples', 'failed');
      return provenance;
    case 'test-synthetic-backend':
      provenance.environment.sourceBackend = 'test-synthetic';
      provenance.environment.frameProducer = 'test-synthetic';
      provenance.contentIntegrity.primarySamples[0]!.sourceBackend = 'test-synthetic';
      provenance.contentIntegrity.primarySamples[0]!.frameProducer = 'test-synthetic';
      return provenance;
    default:
      throw new Error(`unsupported provenance broken fixture: ${id}`);
  }
}

export function evaluateBrokenFixtureBlockers(
  fixtureCase: BrokenFixtureCase,
  report: VisualProofReport | EightVideoProofReport | { provenance: ArtifactProvenance }
): string[] {
  if (fixtureCase.kind === 'provenance-only') {
    return validateArtifactProvenance((report as { provenance: ArtifactProvenance }).provenance);
  }
  if (fixtureCase.kind === 'visual-proof') {
    return evaluateVisualProofReport(report as VisualProofReport).blockers;
  }
  return evaluateEightVideoProof(report as EightVideoProofReport).blockers;
}

export function fixtureMatchesExpectedBlocker(blockers: string[], expectedBlocker: string): boolean {
  return blockers.some((blocker) => blocker.includes(expectedBlocker));
}
