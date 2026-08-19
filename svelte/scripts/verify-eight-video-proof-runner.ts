import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateEightVideoProof, type EightVideoProofReport } from '../src/lib/qa/eightVideoProof.ts';
import {
  computeVisualProofBuildDigest,
  computeVisualProofSourceDigest,
  parsePngMetrics,
  pixelDifferenceRatio,
  realMediaFileMetadata
} from './visual-proof-verification.ts';

const REPORT_PATH = '.artifacts/eight-video-proof/report.json';

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function gitCommit(root: string) {
  const child = Bun.spawn(['git', 'rev-parse', 'HEAD'], {
    cwd: resolve(root, '..'), stdout: 'pipe', stderr: 'pipe'
  });
  const [text, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  if (exitCode !== 0) throw new Error('git rev-parse HEAD failed');
  return text.trim();
}

export async function verifyHotSwapScreenshotEvidence(report: EightVideoProofReport) {
  const blockers: string[] = [];
  for (const step of report.hotSwap?.steps ?? []) {
    try {
      const bytes = await readFile(resolve(step.screenshot.path));
      const png = parsePngMetrics(bytes);
      if (sha256(bytes) !== step.screenshot.sha256 || png.nonBlackPixelRatio !== step.screenshot.nonBlackPixelRatio) {
        blockers.push(`hot-swap screenshot metrics mismatch: ${step.moduleId}`);
      }
    } catch {
      blockers.push(`hot-swap screenshot is missing or unreadable: ${step.moduleId}`);
    }
  }
  return blockers;
}

export async function verifyEightVideoProof(path = REPORT_PATH) {
  const report = JSON.parse(await readFile(path, 'utf8')) as EightVideoProofReport;
  const blockers = [...evaluateEightVideoProof(report).blockers];
  if (!report.provenance?.source || !report.provenance.build || !report.provenance.dependencyLock ||
      !report.provenance.contentIntegrity) {
    throw new Error(`Eight-video proof failed:\n- ${[...new Set(blockers.length ? blockers : ['artifact provenance is missing or invalid'])].join('\n- ')}`);
  }
  const [sourceDigest, buildDigest] = await Promise.all([
    computeVisualProofSourceDigest(), computeVisualProofBuildDigest()
  ]);
  if (report.provenance.source.digest !== sourceDigest) blockers.push('source digest does not match captured source');
  if (report.provenance.build.digest !== buildDigest || report.provenance.build.id !== buildDigest) {
    blockers.push('build digest does not match captured build');
  }
  if (report.provenance.source.commit !== await gitCommit(process.cwd())) {
    blockers.push('source commit does not match captured source');
  }
  if (report.provenance.dependencyLock.sha256 !== sha256(await readFile('bun.lock'))) {
    blockers.push('dependency lock does not match captured source');
  }

  const actualFixtures = await realMediaFileMetadata(report.fixtures.map((fixture) => fixture.relativePath));
  for (const fixture of report.fixtures) {
    const actual = actualFixtures.find((item) => item.relativePath === fixture.relativePath);
    if (!actual || actual.sha256 !== fixture.sha256 || actual.size !== fixture.size ||
      actual.durationSeconds !== fixture.durationSeconds || actual.width !== fixture.width || actual.height !== fixture.height ||
      JSON.stringify(actual.codecs) !== JSON.stringify(fixture.codecs)) {
      blockers.push(`fixture metadata mismatch: ${fixture.name}`);
    }
  }
  for (const screenshot of report.screenshots) {
    const [firstBytes, secondBytes] = await Promise.all([
      readFile(resolve(screenshot.firstPath)), readFile(resolve(screenshot.secondPath))
    ]);
    const first = parsePngMetrics(firstBytes);
    const second = parsePngMetrics(secondBytes);
    if (sha256(firstBytes) !== screenshot.firstSha256 || sha256(secondBytes) !== screenshot.secondSha256 ||
      first.nonBlackPixelRatio !== screenshot.firstNonBlackPixelRatio ||
      second.nonBlackPixelRatio !== screenshot.secondNonBlackPixelRatio ||
      pixelDifferenceRatio(first, second) !== screenshot.pixelMotionRatio) {
      blockers.push(`screenshot metrics mismatch: ${screenshot.moduleId}`);
    }
    const slot = report.samples.at(-1)?.slots.find((entry) => entry.moduleId === screenshot.moduleId);
    const integritySample = slot
      ? report.provenance.contentIntegrity.primarySamples.find((sample) => sample.assetName === slot.fileName)
      : undefined;
    if (!integritySample || integritySample.outputFrameSha256 !== sha256(secondBytes)) {
      blockers.push(`content-integrity output frame hash mismatch: ${screenshot.moduleId}`);
    }
  }
  blockers.push(...await verifyHotSwapScreenshotEvidence(report));
  if (blockers.length) throw new Error(`Eight-video proof failed:\n- ${[...new Set(blockers)].join('\n- ')}`);
  return { passed: true, slots: 8, observationMs: report.observationMs };
}

if (import.meta.main) {
  console.log(JSON.stringify(await verifyEightVideoProof(process.argv[2] ?? REPORT_PATH), null, 2));
}
