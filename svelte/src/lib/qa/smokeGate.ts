import { REDLINE_EXPECTED_BPM } from '$lib/qa/artifactProvenance';

export interface SmokeSnapshot {
  webgpu?: boolean;
  bpm?: number;
  clipsLoaded?: number;
  usingUploadedTrack?: boolean;
  trackName?: string;
  analysisStatus?: string;
  modules?: Record<string, { hasReadyFrame?: boolean; currentTime?: number; clipName?: string }>;
  render?: Record<string, { samplePath?: string; hasVideo?: number; source?: string | null }>;
}

export interface SmokeGateInput {
  snapshot: SmokeSnapshot;
  videoDelta?: number;
  requireAnalysisReady?: boolean;
}

export interface SmokeGateResult {
  passed: boolean;
  blockers: string[];
}

/** Shared M0 truthfulness gate for headed smoke runners. */
export function evaluateSmokeGate(input: SmokeGateInput): SmokeGateResult {
  const { snapshot, videoDelta = 0, requireAnalysisReady = false } = input;
  const blockers: string[] = [];
  const fail = (condition: unknown, message: string) => {
    if (condition) blockers.push(message);
  };

  const playbackObserved = videoDelta > 0.15;

  fail(snapshot.webgpu !== true, 'WebGPU is false or unavailable in smoke snapshot');
  if (!playbackObserved) {
    fail((snapshot.clipsLoaded ?? 0) < 8, 'fewer than 8 clips loaded in smoke snapshot');
  }
  fail(snapshot.usingUploadedTrack !== true && !snapshot.trackName?.includes('Redline'),
    'Redline uploaded track is not loaded');
  if (requireAnalysisReady) {
    fail(snapshot.analysisStatus !== 'ready', 'Redline analysis is not ready');
  }
  const bpm = snapshot.bpm ?? 0;
  fail(Math.abs(bpm - REDLINE_EXPECTED_BPM) > 0.5,
    `Redline BPM mismatch: expected ${REDLINE_EXPECTED_BPM}`);
  if (videoDelta > 0) {
    fail(videoDelta <= 0.05, 'video did not advance during smoke observation');
  }
  const readyCount = Object.values(snapshot.modules ?? {}).filter((module) => module.hasReadyFrame).length;
  if (!playbackObserved) {
    fail(readyCount < 8, 'fewer than 8 rack modules have ready video frames');
  }

  for (const [bindingId, diag] of Object.entries(snapshot.render ?? {})) {
    fail(
      Boolean(diag.hasVideo) &&
        (diag.samplePath === 'test-card' || diag.samplePath === 'unsupported'),
      `synthetic or missing video sample on loaded slot: ${bindingId}`
    );
  }

  return { passed: blockers.length === 0, blockers };
}
