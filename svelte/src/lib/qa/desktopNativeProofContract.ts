export const DESKTOP_NATIVE_PROOF_SCHEMA_VERSION = 2;
export const DESKTOP_NATIVE_PROOF_RUNTIME = 'tauri-macos-native';
export const DESKTOP_NATIVE_BACKEND = 'videotoolbox-iosurface-wgpu-metal';
export const DESKTOP_NATIVE_REQUIRED_PREVIEWS = 8;
export const DESKTOP_NATIVE_MAX_PREVIEW_WIDTH = 256;
export const DESKTOP_NATIVE_MAX_PREVIEW_HEIGHT = 144;
export const DESKTOP_NATIVE_MIN_OBSERVATION_MS = 29_500;
export const DESKTOP_NATIVE_MAX_DROP_RATE = 0.01;
export const DESKTOP_NATIVE_MAX_STALL_MS = 50;
export const DESKTOP_NATIVE_MIN_RAND_CUTS = 40;
export const DESKTOP_NATIVE_MIN_SOURCE_FPS = 20;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' ? value as UnknownRecord : {};
}

function number(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function boolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function string(value: unknown) {
  return typeof value === 'string' ? value : null;
}

export interface DesktopNativeProofEvaluation {
  passed: boolean;
  blockers: string[];
}

/**
 * Release contract for the headed native desktop proof.
 *
 * This evaluator intentionally derives its verdict from raw measurements. The
 * report cannot make itself pass by serializing a precomputed `assertions` map.
 */
export function evaluateDesktopNativeProof(input: unknown): DesktopNativeProofEvaluation {
  const report = record(input);
  const native = record(report.native);
  const cadence = record(report.cadence);
  const sourceCadence = record(cadence.sourceCadence);
  const previewCadence = record(sourceCadence.previews);
  const programCadence = record(sourceCadence.program);
  const surfaces = record(report.surfaces);
  const previews = record(surfaces.previews);
  const program = record(surfaces.program);
  const swap = record(report.swap);
  const blockers: string[] = [];

  if (number(report.schemaVersion) !== DESKTOP_NATIVE_PROOF_SCHEMA_VERSION) {
    blockers.push(`schemaVersion must be ${DESKTOP_NATIVE_PROOF_SCHEMA_VERSION}`);
  }
  if (string(report.runtime) !== DESKTOP_NATIVE_PROOF_RUNTIME) {
    blockers.push(`runtime must be ${DESKTOP_NATIVE_PROOF_RUNTIME}`);
  }
  if (!string(report.completedAt) || string(report.failedAt) || string(report.errorMessage)) {
    blockers.push('headed proof did not complete successfully');
  }
  if (string(native.backend) !== DESKTOP_NATIVE_BACKEND) {
    blockers.push(`native backend must be ${DESKTOP_NATIVE_BACKEND}`);
  }
  if (number(native.previewDecoderCount) !== DESKTOP_NATIVE_REQUIRED_PREVIEWS) {
    blockers.push(`exactly ${DESKTOP_NATIVE_REQUIRED_PREVIEWS} preview decoders must be active`);
  }
  if (boolean(native.programDecoderActive) !== true) {
    blockers.push('full-resolution PGM decoder must be active');
  }
  if (string(native.lastError)) blockers.push(`native decoder reported an error: ${string(native.lastError)}`);
  if (number(native.decodedCpuBytes) !== 0) blockers.push('normal playback decoded video bytes into CPU memory');
  if (number(native.frameIpcBytes) !== 0 || number(native.frameIpcBatches) !== 0) {
    blockers.push('normal playback transported video frames through Tauri IPC');
  }
  if ((number(native.zeroCopyFrames) ?? 0) <= 0) blockers.push('no zero-copy native frames were presented');
  if (number(native.cpuFallbackFrames) !== 0) blockers.push('CPU fallback frames were used');
  if ((number(native.iosurfaceImports) ?? 0) <= 0) blockers.push('no IOSurface textures were imported');
  if (number(native.iosurfaceImportFailures) !== 0) blockers.push('IOSurface texture import failed');
  if ((number(native.gpuSubmissions) ?? 0) <= 0) blockers.push('native compositor submitted no GPU work');
  if ((number(native.memoryHighWaterBytes) ?? 0) <= 0) blockers.push('process memory high-water evidence is missing');

  const previewEntries = Object.values(previews).map(record);
  if (previewEntries.length !== DESKTOP_NATIVE_REQUIRED_PREVIEWS) {
    blockers.push(`exactly ${DESKTOP_NATIVE_REQUIRED_PREVIEWS} preview surfaces must be present`);
  }
  if (previewEntries.some((surface) =>
    (number(surface.width) ?? Number.POSITIVE_INFINITY) > DESKTOP_NATIVE_MAX_PREVIEW_WIDTH ||
    (number(surface.height) ?? Number.POSITIVE_INFINITY) > DESKTOP_NATIVE_MAX_PREVIEW_HEIGHT
  )) {
    blockers.push('preview surface exceeded the 256x144 decode budget');
  }
  if ((number(program.width) ?? 0) <= DESKTOP_NATIVE_MAX_PREVIEW_WIDTH &&
      (number(program.height) ?? 0) <= DESKTOP_NATIVE_MAX_PREVIEW_HEIGHT) {
    blockers.push('PGM did not retain source-quality dimensions');
  }

  const durationMs = number(cadence.durationMs) ?? 0;
  const displayPeriodMs = number(cadence.displayPeriodMs) ?? 0;
  if (durationMs < DESKTOP_NATIVE_MIN_OBSERVATION_MS) blockers.push('headed observation was shorter than 30 seconds');
  if (displayPeriodMs <= 0) blockers.push('display refresh period was not measured');
  if ((number(cadence.estimatedDropRate) ?? Number.POSITIVE_INFINITY) > DESKTOP_NATIVE_MAX_DROP_RATE) {
    blockers.push('presentation drop rate exceeded 1 percent');
  }
  if ((number(cadence.maxIntervalMs) ?? Number.POSITIVE_INFINITY) > DESKTOP_NATIVE_MAX_STALL_MS) {
    blockers.push('presentation stalled for more than 50ms');
  }
  if (displayPeriodMs > 0 &&
      (number(cadence.p99IntervalMs) ?? Number.POSITIVE_INFINITY) > displayPeriodMs * 2 + 1) {
    blockers.push('p99 compositor interval exceeded two display refreshes');
  }
  if (number(cadence.pgmBlackFrames) !== 0) blockers.push('PGM presented black frames during RAND');
  const cuts = Array.isArray(cadence.cuts) ? cadence.cuts : [];
  if (cuts.length < DESKTOP_NATIVE_MIN_RAND_CUTS) blockers.push('RAND did not exercise enough 1BT cuts');
  if (number(cadence.completedCuts) !== cuts.length || number(cadence.unresolvedCuts) !== 0) {
    blockers.push('not every RAND cut reached the native compositor');
  }
  if (displayPeriodMs > 0 &&
      (number(cadence.p95CutLatencyMs) ?? Number.POSITIVE_INFINITY) > displayPeriodMs + 1) {
    blockers.push('p95 RAND cut latency exceeded one display refresh');
  }
  if (displayPeriodMs > 0 &&
      (number(cadence.maxCutLatencyMs) ?? Number.POSITIVE_INFINITY) > displayPeriodMs * 2 + 1) {
    blockers.push('maximum RAND cut latency exceeded two display refreshes');
  }
  const previewFrameRates = Object.values(previewCadence)
    .map((entry) => number(record(entry).framesPerSecond));
  if (previewFrameRates.length !== DESKTOP_NATIVE_REQUIRED_PREVIEWS ||
      previewFrameRates.some((rate) => (rate ?? 0) < DESKTOP_NATIVE_MIN_SOURCE_FPS)) {
    blockers.push(`every preview source must deliver at least ${DESKTOP_NATIVE_MIN_SOURCE_FPS} fresh frames per second`);
  }
  if ((number(programCadence.framesPerSecond) ?? 0) < DESKTOP_NATIVE_MIN_SOURCE_FPS) {
    blockers.push(`PGM must deliver at least ${DESKTOP_NATIVE_MIN_SOURCE_FPS} fresh frames per second`);
  }

  if (!string(swap.replacementModuleId) || string(swap.effectBefore) === string(swap.effectAfter)) {
    blockers.push('effect replacement was not observed');
  }
  if (boolean(swap.nativeEffectApplied) !== true) {
    blockers.push('effect replacement was not applied by the native compositor');
  }
  if (string(swap.clipNameBefore) !== string(swap.clipNameAfter) ||
      string(swap.sourceBefore) !== string(swap.sourceAfter)) {
    blockers.push('effect replacement changed stable slot media ownership');
  }
  if (JSON.stringify(record(swap.previewOpenCountsBefore)) !== JSON.stringify(record(swap.previewOpenCountsAfter))) {
    blockers.push('effect replacement reopened preview decoders');
  }
  if ((number(swap.timelineFrameDelta) ?? Number.POSITIVE_INFINITY) > 1) {
    blockers.push('effect replacement took more than one presented frame');
  }

  return { passed: blockers.length === 0, blockers };
}
