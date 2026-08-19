export const ARTIFACT_PROVENANCE_SCHEMA_VERSION = 2 as const;
export const PROOF_REPORT_SCHEMA_VERSION = 2 as const;
export const PROOF_FRESHNESS_POLICY_ID = 'release-proof-24h.v1' as const;
export const PROOF_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
export const PROOF_MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
export const REDLINE_EXPECTED_BPM = 125;

export type ProofShellKind = 'browser' | 'pwa' | 'tauri-desktop' | 'tauri-mobile';
export type ProofSourceBackend = 'html-video' | 'test-synthetic' | 'unsupported';
export type ProofCapabilityStatus = 'not-tested' | 'unsupported' | 'failed' | 'passed';
export type ProofFrameProducer =
  | 'HTMLVideoElement.copyExternalImageToTexture'
  | 'test-synthetic'
  | 'unsupported';

export interface ProofCapabilityStatuses {
  webgpu: ProofCapabilityStatus;
  mediaAdvance: ProofCapabilityStatus;
  bpmMatch: ProofCapabilityStatus;
  primarySamples: ProofCapabilityStatus;
  contentIntegrity: ProofCapabilityStatus;
}

export interface ProofContentAsset {
  name: string;
  sha256: string;
  size: number;
}

export interface ProofPrimarySample {
  assetName: string;
  assetSha256: string;
  observedSource: string;
  rendererSource: string;
  sourceBackend: ProofSourceBackend;
  frameProducer: ProofFrameProducer;
  sourceFrameId: number;
  sourceTimestampSeconds: number;
  outputFrameSha256: string;
  width: number;
  height: number;
}

export interface ArtifactProvenance {
  schemaVersion: typeof ARTIFACT_PROVENANCE_SCHEMA_VERSION;
  captureId: string;
  capturedAt: string;
  source: {
    commit: string;
    digest: string;
    workingTreeDirty: boolean;
  };
  build: {
    id: string;
    digest: string;
    profile: 'production' | 'release-equivalent-diagnostic';
  };
  server: {
    kind: 'vite-production-preview' | 'tauri-bundled-static';
    origin: string;
    buildDigest: string;
  };
  dependencyLock: {
    path: 'bun.lock';
    sha256: string;
  };
  environment: {
    shellKind: ProofShellKind;
    sourceBackend: ProofSourceBackend;
    frameProducer: ProofFrameProducer;
    releaseEvidence: boolean;
    webgpuAvailable: boolean;
    runtime: {
      name: string;
      version: string;
      userAgent: string;
    };
    device: {
      operatingSystem: string;
      architecture: string;
      model: string;
      gpuIdentity: string;
    };
  };
  capabilities: ProofCapabilityStatuses;
  freshness: {
    policy: typeof PROOF_FRESHNESS_POLICY_ID;
    maxAgeMs: typeof PROOF_MAX_AGE_MS;
    expiresAt: string;
  };
  contentIntegrity: {
    algorithm: 'sha256';
    requiredPrimarySampleCount: number;
    assets: ProofContentAsset[];
    primarySamples: ProofPrimarySample[];
  };
}

export interface ArtifactProvenanceInput extends Omit<ArtifactProvenance, 'schemaVersion' | 'freshness'> {
  capturedAt: string;
}

export function createArtifactProvenance(input: ArtifactProvenanceInput): ArtifactProvenance {
  const capturedAtMs = Date.parse(input.capturedAt);
  return {
    schemaVersion: ARTIFACT_PROVENANCE_SCHEMA_VERSION,
    ...input,
    freshness: {
      policy: PROOF_FRESHNESS_POLICY_ID,
      maxAgeMs: PROOF_MAX_AGE_MS,
      expiresAt: new Date(capturedAtMs + PROOF_MAX_AGE_MS).toISOString()
    }
  };
}

export function validateArtifactProvenance(
  provenance: ArtifactProvenance | undefined,
  nowMs = Date.now()
): string[] {
  const blockers: string[] = [];
  const fail = (condition: unknown, message: string) => { if (condition) blockers.push(message); };
  if (!provenance || provenance.schemaVersion !== ARTIFACT_PROVENANCE_SCHEMA_VERSION) {
    return ['artifact provenance is missing or has an unsupported schema'];
  }

  const capturedAtMs = Date.parse(provenance.capturedAt);
  const expiresAtMs = Date.parse(provenance.freshness?.expiresAt ?? '');
  fail(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(provenance.captureId ?? ''),
    'capture identity is missing or invalid');
  fail(!/^[0-9a-f]{40}$/i.test(provenance.source?.commit ?? ''), 'source commit identity is missing or invalid');
  fail(!isSha256(provenance.source?.digest), 'source digest identity is missing or invalid');
  fail(!isSha256(provenance.build?.id) || provenance.build.id !== provenance.build.digest,
    'build identity is missing or does not match the captured build digest');
  fail(!isSha256(provenance.build?.digest), 'build digest identity is missing or invalid');
  fail(!provenance.server || !['vite-production-preview', 'tauri-bundled-static'].includes(provenance.server.kind) ||
    !isHttpOrigin(provenance.server.origin) || provenance.server.buildDigest !== provenance.build?.digest,
  'release server identity is missing or does not match the captured build');
  fail(provenance.environment?.shellKind === 'browser' &&
    (provenance.build?.profile !== 'production' || provenance.server?.kind !== 'vite-production-preview'),
  'browser release evidence was not served from the captured production preview');
  fail(provenance.environment?.shellKind === 'tauri-desktop' && provenance.server?.kind !== 'tauri-bundled-static',
    'desktop release evidence was not served from its bundled static build');
  fail(provenance.dependencyLock?.path !== 'bun.lock' || !isSha256(provenance.dependencyLock?.sha256),
    'dependency lock identity is missing or invalid');
  fail(!Number.isFinite(capturedAtMs), 'artifact capture time is missing or invalid');
  fail(provenance.freshness?.policy !== PROOF_FRESHNESS_POLICY_ID ||
    provenance.freshness?.maxAgeMs !== PROOF_MAX_AGE_MS || !Number.isFinite(expiresAtMs) ||
    expiresAtMs !== capturedAtMs + PROOF_MAX_AGE_MS,
  'artifact freshness policy is missing or invalid');
  fail(Number.isFinite(capturedAtMs) && capturedAtMs > nowMs + PROOF_MAX_FUTURE_SKEW_MS,
    'artifact capture time is implausibly in the future');
  fail(Number.isFinite(expiresAtMs) && nowMs > expiresAtMs, 'artifact provenance is stale');

  const environment = provenance.environment;
  fail(!environment || !['browser', 'pwa', 'tauri-desktop', 'tauri-mobile'].includes(environment.shellKind),
    'shell provenance is missing or invalid');
  fail(!environment || !['html-video', 'test-synthetic', 'unsupported'].includes(environment.sourceBackend),
    'source-backend provenance is missing or invalid');
  fail(!environment?.releaseEvidence, 'artifact is not marked as release evidence');
  const placeholderIdentity = /^(?:unknown|unavailable|none|null|n\/a)$/i;
  fail(!environment?.runtime?.name.trim() || !environment.runtime.version.trim() || !environment.runtime.userAgent.trim() ||
    placeholderIdentity.test(environment.runtime.name.trim()) || placeholderIdentity.test(environment.runtime.version.trim()),
    'runtime identity is missing');
  fail(!environment?.device?.operatingSystem.trim() || !environment.device.architecture.trim() ||
    !environment.device.model.trim() || !environment.device.gpuIdentity.trim() ||
    placeholderIdentity.test(environment.device.model.trim()) || placeholderIdentity.test(environment.device.gpuIdentity.trim()),
  'device identity is missing');
  fail(environment?.sourceBackend === 'test-synthetic', 'test-synthetic backend cannot be release evidence');
  fail(environment?.sourceBackend === 'unsupported', 'unsupported source backend cannot pass a release gate');
  fail(environment?.sourceBackend === 'html-video' &&
    environment.frameProducer !== 'HTMLVideoElement.copyExternalImageToTexture',
  'shell/source-backend frame producer mismatch');
  fail(environment?.sourceBackend !== 'html-video' &&
    environment?.frameProducer === 'HTMLVideoElement.copyExternalImageToTexture',
  'shell/source-backend frame producer mismatch');
  fail(environment?.webgpuAvailable !== true, 'WebGPU is false or unavailable in captured provenance');

  for (const [name, status] of Object.entries(provenance.capabilities ?? {})) {
    fail(!['not-tested', 'unsupported', 'failed', 'passed'].includes(status),
      `capability status is invalid: ${name}`);
  }
  const requiredCapabilities: Array<keyof ProofCapabilityStatuses> = [
    'webgpu', 'mediaAdvance', 'bpmMatch', 'primarySamples', 'contentIntegrity'
  ];
  for (const capability of requiredCapabilities) {
    fail(provenance.capabilities?.[capability] !== 'passed', `required capability did not pass: ${capability}`);
  }

  const integrity = provenance.contentIntegrity;
  fail(integrity?.algorithm !== 'sha256', 'content-integrity algorithm is missing or invalid');
  fail(!Number.isInteger(integrity?.requiredPrimarySampleCount) || integrity.requiredPrimarySampleCount < 1,
    'required primary sample count is missing or invalid');
  const assets = new Map((integrity?.assets ?? []).map((asset) => [asset.name, asset]));
  fail(assets.size < 1 || [...assets.values()].some((asset) => !asset.name || !isSha256(asset.sha256) || asset.size < 1),
    'content-integrity asset inventory is missing or invalid');
  const samples = integrity?.primarySamples ?? [];
  fail(samples.length < (integrity?.requiredPrimarySampleCount ?? 1), 'primary content-integrity samples are missing');
  fail(new Set(samples.map((sample) => sample.assetName)).size < (integrity?.requiredPrimarySampleCount ?? 1),
    'primary content-integrity samples do not cover the required assets');
  for (const sample of samples) {
    const asset = assets.get(sample.assetName);
    fail(!asset || asset.sha256 !== sample.assetSha256, `content-integrity asset hash mismatch: ${sample.assetName}`);
    fail(!sample.observedSource || sample.rendererSource !== sample.observedSource,
      `content-integrity source diagnostics mismatch: ${sample.assetName}`);
    fail(sample.sourceBackend !== environment?.sourceBackend || sample.frameProducer !== environment?.frameProducer,
      `content-integrity backend diagnostics mismatch: ${sample.assetName}`);
    fail(!Number.isFinite(sample.sourceFrameId) || sample.sourceFrameId < 1 ||
      !Number.isFinite(sample.sourceTimestampSeconds) || sample.sourceTimestampSeconds < 0 ||
      sample.width < 1 || sample.height < 1 || !isSha256(sample.outputFrameSha256),
    `content-integrity frame evidence is missing or invalid: ${sample.assetName}`);
  }

  return blockers;
}

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

function isHttpOrigin(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'tauri:'].includes(url.protocol) && url.origin === value;
  } catch {
    return false;
  }
}
