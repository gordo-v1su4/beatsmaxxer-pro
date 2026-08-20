import { detectRuntime } from '$lib/platform/runtime';
import { getVideoSourcePort } from '$lib/platform/videoSource';
import type { ProofFrameProducer, ProofShellKind, ProofSourceBackend } from '$lib/qa/artifactProvenance';

export interface ResolvedProofEnvironment {
  shellKind: ProofShellKind;
  sourceBackend: ProofSourceBackend;
  frameProducer: ProofFrameProducer;
  releaseEvidence: boolean;
  videoSourceKind: string;
}

/** Derive shell/backend provenance from runtime + the active video source port. */
export function resolveProofEnvironment(options?: { releaseEvidence?: boolean }): ResolvedProofEnvironment {
  const runtime = detectRuntime();
  const shellKind: ProofShellKind = runtime === 'tauri' ? 'tauri-desktop' : 'browser';
  const port = getVideoSourcePort();
  return {
    shellKind,
    sourceBackend: 'html-video',
    frameProducer: 'HTMLVideoElement.copyExternalImageToTexture',
    releaseEvidence: options?.releaseEvidence ?? true,
    videoSourceKind: port.kind
  };
}

/** Production/release surfaces must not treat the idle test-card as valid clip evidence. */
export function isReleaseProofSurface(): boolean {
  return import.meta.env.PROD;
}

export function resolveVideoSamplePath(
  externalTextureBound: boolean,
  cachedTextureBound: boolean,
  expectsVideo: boolean
): 'external-texture' | 'cached-video-texture' | 'test-card' | 'unsupported' {
  if (externalTextureBound) return 'external-texture';
  if (cachedTextureBound) return 'cached-video-texture';
  if (expectsVideo && isReleaseProofSurface()) return 'unsupported';
  return 'test-card';
}
