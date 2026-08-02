import { describe, expect, test } from 'vitest';
import {
  DESKTOP_NATIVE_BACKEND,
  DESKTOP_NATIVE_PROOF_RUNTIME,
  DESKTOP_NATIVE_PROOF_SCHEMA_VERSION,
  evaluateDesktopNativeProof
} from '$lib/qa/desktopNativeProofContract';

function validReport() {
  const cuts = Array.from({ length: 48 }, (_, index) => ({
    sourceId: `slot-${index % 8}`,
    observedAtMs: index * 625,
    renderedAtMs: index * 625 + 8,
    latencyMs: 8,
    blackFrames: 0
  }));
  return {
    schemaVersion: DESKTOP_NATIVE_PROOF_SCHEMA_VERSION,
    runtime: DESKTOP_NATIVE_PROOF_RUNTIME,
    startedAt: '2026-08-02T20:00:00.000Z',
    completedAt: '2026-08-02T20:00:35.000Z',
    native: {
      backend: DESKTOP_NATIVE_BACKEND,
      previewDecoderCount: 8,
      programDecoderActive: true,
      decodedCpuBytes: 0,
      frameIpcBytes: 0,
      frameIpcBatches: 0,
      zeroCopyFrames: 4_320,
      cpuFallbackFrames: 0,
      iosurfaceImports: 4_320,
      iosurfaceImportFailures: 0,
      gpuSubmissions: 1_800,
      memoryHighWaterBytes: 512 * 1024 * 1024,
      lastError: null
    },
    surfaces: {
      previews: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
        `slot-${index}`,
        { width: 256, height: 144, sequence: 720 }
      ])),
      program: { width: 1280, height: 720, sequence: 720 }
    },
    cadence: {
      durationMs: 30_010,
      samples: 1_798,
      displayPeriodMs: 16.67,
      expectedPresentations: 1_800,
      droppedPresentations: 2,
      estimatedDropRate: 2 / 1_800,
      p99IntervalMs: 17.2,
      maxIntervalMs: 31,
      pgmBlackFrames: 0,
      cuts,
      completedCuts: cuts.length,
      unresolvedCuts: 0,
      p95CutLatencyMs: 8,
      maxCutLatencyMs: 12,
      sourceCadence: {
        previews: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
          `slot-${index}`,
          { producedFrames: 720, framesPerSecond: 24 }
        ])),
        program: { producedFrames: 720, framesPerSecond: 24, sourceCount: 8 }
      }
    },
    swap: {
      nativeEffectApplied: true,
      replacementModuleId: 'replacement',
      clipNameBefore: 'clip.mp4',
      clipNameAfter: 'clip.mp4',
      sourceBefore: 'top-0',
      sourceAfter: 'top-0',
      effectBefore: 'transition',
      effectAfter: 'replacement',
      timelineFrameDelta: 1,
      previewOpenCountsBefore: { 'top-0': 1 },
      previewOpenCountsAfter: { 'top-0': 1 }
    }
  };
}

describe('desktop native proof release contract', () => {
  test('accepts complete headed zero-copy evidence', () => {
    expect(evaluateDesktopNativeProof(validReport())).toEqual({ passed: true, blockers: [] });
  });

  test('rejects the current CPU and Tauri frame-transfer path', () => {
    const report = validReport();
    report.native.backend = 'videotoolbox';
    report.native.decodedCpuBytes = 100_000_000;
    report.native.frameIpcBytes = 100_000_000;
    report.native.frameIpcBatches = 720;
    report.native.zeroCopyFrames = 0;
    report.native.iosurfaceImports = 0;
    const blockers = evaluateDesktopNativeProof(report).blockers;
    expect(blockers).toContain(`native backend must be ${DESKTOP_NATIVE_BACKEND}`);
    expect(blockers).toContain('normal playback decoded video bytes into CPU memory');
    expect(blockers).toContain('normal playback transported video frames through Tauri IPC');
    expect(blockers).toContain('no zero-copy native frames were presented');
    expect(blockers).toContain('no IOSurface textures were imported');
  });

  test('derives the verdict from measurements instead of trusting serialized assertions', () => {
    const report = { ...validReport(), assertions: { everythingPassed: true } };
    report.cadence.maxIntervalMs = 250;
    report.cadence.pgmBlackFrames = 3;
    const result = evaluateDesktopNativeProof(report);
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('presentation stalled for more than 50ms');
    expect(result.blockers).toContain('PGM presented black frames during RAND');
  });

  test('rejects unheaded, failed, or stale-schema reports', () => {
    const report = validReport();
    report.schemaVersion = 1;
    report.runtime = 'tauri-native';
    delete (report as { completedAt?: string }).completedAt;
    const blockers = evaluateDesktopNativeProof(report).blockers;
    expect(blockers).toContain(`schemaVersion must be ${DESKTOP_NATIVE_PROOF_SCHEMA_VERSION}`);
    expect(blockers).toContain(`runtime must be ${DESKTOP_NATIVE_PROOF_RUNTIME}`);
    expect(blockers).toContain('headed proof did not complete successfully');
  });
});
