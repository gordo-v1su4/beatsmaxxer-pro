import { describe, expect, test } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  M0_BROKEN_FIXTURE_MATRIX,
  buildBrokenProvenance,
  buildValidProvenance,
  evaluateBrokenFixtureBlockers,
  fixtureMatchesExpectedBlocker
} from '$lib/qa/brokenFixtureMatrix';
import { validateArtifactProvenance } from '$lib/qa/artifactProvenance';
import { evaluateEightVideoProof, type EightVideoProofReport } from '$lib/qa/eightVideoProof';
import { evaluateVisualProofReport, type VisualProofReport } from '$lib/qa/visualProof';
import { REDLINE_VIDEO_NAMES } from '$lib/qa/redlineProofMedia';
import { buildEightVideoMatrixReport, buildVisualProofMatrixReport } from '../../fixtures/qa-fixtures/matrixReports';

const FIXTURE_DIR = join(process.cwd(), 'tests/fixtures/qa-fixtures');

describe('M0 broken-fixture matrix', () => {
  test('healthy provenance passes validation', () => {
    expect(validateArtifactProvenance(buildValidProvenance())).toEqual([]);
  });

  for (const fixtureCase of M0_BROKEN_FIXTURE_MATRIX.filter((entry) => entry.kind === 'provenance-only')) {
    test(`provenance fixture ${fixtureCase.id} fails for ${fixtureCase.expectedBlocker}`, () => {
      const provenance = buildBrokenProvenance(fixtureCase.id);
      const blockers = validateArtifactProvenance(provenance);
      expect(fixtureMatchesExpectedBlocker(blockers, fixtureCase.expectedBlocker)).toBe(true);
    });
  }

  test('visual-proof stale provenance fails every aggregate evaluator', () => {
    const report = buildVisualProofMatrixReport();
    report.provenance.capturedAt = '2020-01-01T00:00:00.000Z';
    report.provenance.freshness.expiresAt = '2020-01-02T00:00:00.000Z';
    const blockers = evaluateBrokenFixtureBlockers(
      { id: 'stale-provenance', kind: 'visual-proof', expectedBlocker: 'artifact provenance is stale' },
      report
    );
    expect(blockers).toContain('artifact provenance is stale');
  });

  test('visual-proof missing evidence fails with missing visual proof blocker', () => {
    const report = buildVisualProofMatrixReport();
    report.evidence = report.evidence.slice(1);
    const blockers = evaluateVisualProofReport(report).blockers;
    expect(fixtureMatchesExpectedBlocker(blockers, 'missing visual proof:')).toBe(true);
  });

  test('visual-proof zero media advance fails with the correct blocker', () => {
    const report = buildVisualProofMatrixReport();
    report.realMedia!.videoExercise[0]!.secondMediaTimeSeconds =
      report.realMedia!.videoExercise[0]!.firstMediaTimeSeconds;
    const blockers = evaluateVisualProofReport(report).blockers;
    expect(blockers).toContain(`real MP4 was not visibly decoded and moving: ${REDLINE_VIDEO_NAMES[0]}`);
  });

  test('visual-proof BPM mismatch fails with the correct blocker', () => {
    const report = buildVisualProofMatrixReport();
    report.realMedia!.audioExercise.detectedBpm = 128;
    const blockers = evaluateVisualProofReport(report).blockers;
    expect(blockers).toContain('Redline BPM mismatch: expected 125');
  });

  test('eight-video stale provenance fails every aggregate evaluator', () => {
    const report = buildEightVideoMatrixReport();
    report.provenance.capturedAt = '2020-01-01T00:00:00.000Z';
    report.provenance.freshness.expiresAt = '2020-01-02T00:00:00.000Z';
    const blockers = evaluateEightVideoProof(report).blockers;
    expect(blockers).toContain('artifact provenance is stale');
  });

  test('eight-video zero media advance fails with the correct blocker', () => {
    const report = buildEightVideoMatrixReport();
    for (const sample of report.samples) sample.slots[0]!.currentTime = 1;
    report.samples.at(-1)!.slots[0]!.totalVideoFrames = report.samples[0]!.slots[0]!.totalVideoFrames;
    const blockers = evaluateEightVideoProof(report).blockers;
    expect(blockers).toContain('slot did not play concurrently: module-0');
  });

  test('eight-video BPM mismatch fails with the correct blocker', () => {
    const report = buildEightVideoMatrixReport();
    report.audio.bpm = 128;
    const blockers = evaluateEightVideoProof(report).blockers;
    expect(blockers).toContain('Redline BPM mismatch: expected 125');
  });

  test('eight-video webgpu false fails with the correct blocker', () => {
    const report = buildEightVideoMatrixReport();
    report.provenance.environment.webgpuAvailable = false;
    report.provenance.capabilities.webgpu = 'failed';
    const blockers = evaluateEightVideoProof(report).blockers;
    expect(blockers).toContain('WebGPU is false or unavailable in captured provenance');
  });

  test('writes checked-in broken provenance fixtures for verify runner', async () => {
    await mkdir(FIXTURE_DIR, { recursive: true });
    for (const fixtureCase of M0_BROKEN_FIXTURE_MATRIX.filter((entry) => entry.kind === 'provenance-only')) {
      const provenance = buildBrokenProvenance(fixtureCase.id);
      await writeFile(
        join(FIXTURE_DIR, `broken-${fixtureCase.id}.json`),
        `${JSON.stringify({ id: fixtureCase.id, expectedBlocker: fixtureCase.expectedBlocker, provenance }, null, 2)}\n`
      );
    }
  });
});
