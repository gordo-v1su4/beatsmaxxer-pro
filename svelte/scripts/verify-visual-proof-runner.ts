import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FIXED_VISUAL_PROOF_FIXTURE, evaluateVisualProofReport, type VisualProofReport } from '../src/lib/qa/visualProof.ts';
import { REDLINE_AUDIO_SOURCE_PATH, REDLINE_VIDEO_SOURCE_PATHS } from '../src/lib/qa/redlineProofMedia.ts';
import {
  computeVisualProofSourceDigest,
  computeVisualProofBuildDigest,
  digestJson,
  realMediaFileMetadata,
  parsePngMetrics,
  pixelDifferenceRatio
} from './visual-proof-verification.ts';

const REPORT_PATH = process.env.VISUAL_PROOF_REPORT ?? '.artifacts/visual-proof/report.json';
const MAX_MEDIA_TOLERANCE_SECONDS = 2 / 30;
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function gitCommit(root: string) {
  const child = Bun.spawn(['git', 'rev-parse', 'HEAD'], {
    cwd: resolve(root, '..'), stdout: 'pipe', stderr: 'pipe'
  });
  const [text, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  if (exitCode !== 0) throw new Error('git rev-parse HEAD failed');
  return text.trim();
}

export async function verifyVisualProof(report: VisualProofReport, root = process.cwd()) {
  const blockers = [...evaluateVisualProofReport(report).blockers];
  if (!report.provenance?.source || !report.provenance.build || !report.provenance.dependencyLock ||
      !report.provenance.contentIntegrity || !Array.isArray(report.provenance.fixtureFiles)) {
    return [...new Set(blockers.length ? blockers : ['artifact provenance is missing or invalid'])];
  }
  if (process.env.PHYSICAL_BROWSER_OBSERVED !== '1' || process.env.PHYSICAL_BROWSER_OPERATOR?.trim() !== report.humanObservationAttestation.operator) {
    blockers.push('human observation attestation was not independently supplied to verification');
  }
  const sourceDigest = await computeVisualProofSourceDigest(root);
  if (sourceDigest !== report.provenance.source.digest) blockers.push('source digest changed after capture');
  try {
    if (await gitCommit(root) !== report.provenance.source.commit) blockers.push('source commit changed after capture');
  } catch (error) {
    blockers.push(`source commit unavailable during verification: ${String(error)}`);
  }
  try {
    if (sha256(await readFile(resolve(root, 'bun.lock'))) !== report.provenance.dependencyLock.sha256) {
      blockers.push('dependency lock changed after capture');
    }
  } catch (error) {
    blockers.push(`dependency lock unavailable during verification: ${String(error)}`);
  }
  try {
    const buildDigest = await computeVisualProofBuildDigest(root);
    if (buildDigest !== report.provenance.build.digest || buildDigest !== report.provenance.build.id) {
      blockers.push('production build digest changed after capture');
    }
  } catch (error) {
    blockers.push(`production build unavailable during verification: ${String(error)}`);
  }
  const catalog = report.manifest.items.filter((item) => item.kind !== 'control');
  const controls = report.manifest.items.filter((item) => item.kind === 'control');
  if (digestJson(catalog) !== report.provenance.catalogDigest) blockers.push('catalog inventory digest mismatch');
  if (digestJson(controls) !== report.provenance.controlInventoryDigest) blockers.push('control inventory digest mismatch');
  try {
    const currentFixtureFiles = await realMediaFileMetadata([
      ...REDLINE_VIDEO_SOURCE_PATHS,
      REDLINE_AUDIO_SOURCE_PATH
    ], root);
    if (JSON.stringify(currentFixtureFiles) !== JSON.stringify(report.provenance.fixtureFiles)) blockers.push('fixture hashes, sizes, or metadata changed after capture');
  } catch (error) {
    blockers.push(`fixed fixture files unavailable during verification: ${String(error)}`);
  }

  const metadataByName = new Map(report.provenance.fixtureFiles.map((entry) => [entry.name, entry]));
  const verifiedRealFirstFrames: ReturnType<typeof parsePngMetrics>[] = [];
  for (const clip of report.realMedia?.videoExercise ?? []) {
    const metadata = metadataByName.get(clip.fileName);
    if (!metadata || metadata.kind !== 'video' || metadata.sha256 !== clip.sha256 || metadata.size !== clip.size ||
        metadata.sha256 !== clip.selectedFileSha256 || metadata.size !== clip.selectedFileSize ||
        metadata.width !== clip.videoWidth || metadata.height !== clip.videoHeight ||
        Math.abs(metadata.durationSeconds - clip.durationSeconds) > 0.1) {
      blockers.push(`real MP4 binding does not match verifier metadata: ${clip.fileName}`);
    }
    try {
      const [firstBytes, secondBytes] = await Promise.all([
        readFile(resolve(root, clip.firstScreenshot)), readFile(resolve(root, clip.secondScreenshot))
      ]);
      const [first, second] = [parsePngMetrics(firstBytes), parsePngMetrics(secondBytes)];
      verifiedRealFirstFrames.push(first);
      if (first.contentHash !== clip.firstContentHash || second.contentHash !== clip.secondContentHash ||
          Math.abs(pixelDifferenceRatio(first, second) - clip.pixelMotionRatio) > 1e-9 ||
          pixelDifferenceRatio(first, second) <= 0.01) {
        blockers.push(`real MP4 screenshots do not prove substantive motion: ${clip.fileName}`);
      }
      const integritySample = report.provenance.contentIntegrity.primarySamples
        .find((sample) => sample.assetName === clip.fileName);
      if (!integritySample || integritySample.outputFrameSha256 !== sha256(secondBytes)) {
        blockers.push(`content-integrity output frame hash mismatch: ${clip.fileName}`);
      }
    } catch (error) {
      blockers.push(`invalid real MP4 screenshot evidence: ${clip.fileName}: ${String(error)}`);
    }
  }
  const verifiedAdjacentRatios = verifiedRealFirstFrames.slice(1)
    .map((frame, index) => pixelDifferenceRatio(verifiedRealFirstFrames[index]!, frame));
  if (JSON.stringify(verifiedAdjacentRatios) !== JSON.stringify(report.realMedia?.adjacentCrossFileDifferenceRatios ?? [])) {
    blockers.push('cross-file PGM screenshot difference metrics do not match verifier recomputation');
  }
  const audio = report.realMedia?.audioExercise;
  const audioMetadata = audio ? metadataByName.get(audio.fileName) : undefined;
  if (!audio || !audioMetadata || audioMetadata.kind !== 'audio' || audioMetadata.sha256 !== audio.sha256 || audioMetadata.size !== audio.size) {
    blockers.push('real Redline binding does not match verifier metadata');
  }

  for (const evidence of report.evidence) {
    try {
      const beforePath = resolve(root, evidence.before);
      const afterPath = resolve(root, evidence.after);
      if (!beforePath.startsWith(resolve(root, '.artifacts/visual-proof/')) || !afterPath.startsWith(resolve(root, '.artifacts/visual-proof/'))) {
        throw new Error('artifact escapes the proof directory');
      }
      const [beforeInfo, afterInfo, beforeBytes, afterBytes] = await Promise.all([
        stat(beforePath), stat(afterPath), readFile(beforePath), readFile(afterPath)
      ]);
      if (beforeInfo.size < 64 || afterInfo.size < 64) throw new Error('artifact is too small to be a PNG screenshot');
      const before = parsePngMetrics(beforeBytes);
      const after = parsePngMetrics(afterBytes);
      if (before.contentHash !== evidence.beforeContentHash || after.contentHash !== evidence.afterContentHash) {
        blockers.push(`artifact content hash mismatch: ${evidence.itemId}`);
      }
      if (Math.abs(Math.min(before.nonBlackPixelRatio, after.nonBlackPixelRatio) - evidence.nonBlackPixelRatio) > 1e-9) {
        blockers.push(`artifact black-frame metric mismatch: ${evidence.itemId}`);
      }
      if (before.nonBlackPixelRatio <= 0.01 || after.nonBlackPixelRatio <= 0.01) blockers.push(`verified black frame: ${evidence.itemId}`);
      if (pixelDifferenceRatio(before, after) <= 0.001) blockers.push(`verified screenshot pixels did not materially change: ${evidence.itemId}`);
    } catch (error) {
      blockers.push(`invalid PNG artifact: ${evidence.itemId}: ${String(error)}`);
    }
    if (evidence.timeline.mediaTimeToleranceSeconds !== MAX_MEDIA_TOLERANCE_SECONDS ||
      Math.abs(evidence.timeline.actualMediaTimeSeconds - evidence.timeline.expectedMediaTimeSeconds) > MAX_MEDIA_TOLERANCE_SECONDS) {
      blockers.push(`verified media time exceeds two-frame tolerance: ${evidence.itemId}`);
    }
  }
  return [...new Set(blockers)];
}

async function main() {
  let report: VisualProofReport;
  try {
    report = JSON.parse(await readFile(REPORT_PATH, 'utf8')) as VisualProofReport;
  } catch (error) {
    throw new Error(`Physical-browser visual proof report is required and must be JSON: ${REPORT_PATH}: ${String(error)}`);
  }
  const blockers = await verifyVisualProof(report);
  const summary = { passed: blockers.length === 0, report: REPORT_PATH, requiredItems: report.manifest.items.length, evidenceItems: report.evidence.length, blockers };
  console.log(JSON.stringify(summary, null, 2));
  if (blockers.length) throw new Error(`Physical-browser visual proof gate BLOCKED (${blockers.length} blocker(s))`);
}

if (import.meta.main) await main();
