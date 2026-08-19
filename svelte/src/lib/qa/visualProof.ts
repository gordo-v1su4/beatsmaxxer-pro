import { listCatalog } from '$lib/modules/catalog';
import { MODULE_PRESETS } from '$lib/modules/presets';
import { SHADER_EFFECT_MODE } from '$lib/rendering/webgpu/shaders/moduleFx.wgsl';
import {
  PROOF_REPORT_SCHEMA_VERSION,
  REDLINE_EXPECTED_BPM,
  validateArtifactProvenance,
  type ArtifactProvenance
} from '$lib/qa/artifactProvenance';
import {
  REDLINE_AUDIO_NAME,
  REDLINE_AUDIO_VIRTUAL_PATH,
  REDLINE_MIDI_VIRTUAL_PATHS,
  REDLINE_VIDEO_NAMES,
  REDLINE_VIDEO_VIRTUAL_PATHS
} from '$lib/qa/redlineProofMedia';

export const FIXED_VISUAL_PROOF_FIXTURE = {
  source: 'tests/fixtures/media/manifest.json',
  audio: REDLINE_AUDIO_VIRTUAL_PATH,
  midi: [...REDLINE_MIDI_VIRTUAL_PATHS],
  clips: [...REDLINE_VIDEO_VIRTUAL_PATHS]
};

export const FIXED_VISUAL_PROOF_VIEWPORT = {
  width: 1680,
  height: 1050,
  deviceScaleFactor: 1
};

/** Frozen samples make proof reproducible instead of depending on capture frame rate. */
export const FIXED_VISUAL_PROOF_TIMELINE_POSITIONS = [0, 0.5, 1] as number[];

export function retainSerialVisualProofSelection<T extends { name: string }>(files: Iterable<T>): T[] {
  const selected = [...files];
  if (selected.length !== 1 || !selected[0]?.name.toLowerCase().endsWith('.mp4')) {
    throw new Error(`Serial visual proof requires exactly one selected real MP4; received ${selected.length}`);
  }
  return selected;
}

export interface SerialVisualProofSelectionState<T extends { name: string }> {
  generation: number;
  files: T[];
  error: string;
}

/** Empty follow-up events from a UI handler clearing its input must not erase the captured File. */
export function reduceSerialVisualProofSelection<T extends { name: string }>(
  state: SerialVisualProofSelectionState<T>,
  files: Iterable<T>
): SerialVisualProofSelectionState<T> {
  const selected = [...files];
  if (selected.length === 0) return state;
  try {
    return { generation: state.generation + 1, files: retainSerialVisualProofSelection(selected), error: '' };
  } catch (error) {
    return { generation: state.generation + 1, files: [], error: String(error) };
  }
}

export type VisualProofKind = 'module' | 'preset' | 'shader' | 'control';

export interface AdvertisedControl {
  /** Stable DOM identity, not an array index or rendered position. */
  id: string;
  label: string;
  kind: 'button' | 'slider' | 'input' | 'select' | 'mouse';
  state?: 'base' | 'audio-consent';
}

export interface VisualProofManifestItem {
  id: string;
  kind: VisualProofKind;
  subjectId: string;
  label: string;
  controlKind?: AdvertisedControl['kind'];
  controlState?: AdvertisedControl['state'];
}

export interface VisualProofManifest {
  schemaVersion: 1;
  fixture: typeof FIXED_VISUAL_PROOF_FIXTURE;
  viewport: typeof FIXED_VISUAL_PROOF_VIEWPORT;
  timelinePositionsSeconds: number[];
  controlInventory: {
    selector: string;
    states: Array<'base' | 'audio-consent'>;
    discoveredCount: number;
    includedCount: number;
  };
  items: VisualProofManifestItem[];
}

export interface VisualProofMediaMetadata {
  relativePath: string; name: string; kind: 'audio' | 'video'; size: number; sha256: string;
  durationSeconds: number; width: number | null; height: number | null; codecs: string[]; formatName: string;
}

export interface VisualProofEvidence {
  itemId: string;
  before: string;
  after: string;
  timelinePositionSeconds: number;
  expectedOutcome: string;
  beforeState: unknown;
  afterState: unknown;
  /** True only when the advertised outcome, not merely a click event, was observed. */
  changed: boolean;
  blackFrame: boolean;
  nonBlackPixelRatio: number;
  beforeContentHash: string;
  afterContentHash: string;
  screenshotContentChanged: boolean;
  timeline: {
    source: 'AudioContext.currentTime';
    centralFrameId: number;
    subscriberFrameIds: number[];
    generation: number;
    deterministicSeed: number;
    fixedStepSeconds: number;
    fixedStepIndex: number;
    uniformHash: string;
    expectedMediaTimeSeconds: number;
    actualMediaTimeSeconds: number;
    mediaTimeToleranceSeconds: number;
    fixtureClipName: string;
    currentSrc: string;
    videoWidth: number;
    videoHeight: number;
    durationSeconds: number;
    rendererHasVideo: boolean;
    bindingId: string;
    externalTextureImported: boolean;
    externalTextureBound: boolean;
    samplePath: string;
    rendererSource: string | null;
    rendererDimensions: string | null;
    rendererFrameId: number | null;
  };
  configuration?: {
    moduleId: string;
    fixtureClipName: string;
    beforeBypassed: boolean;
    afterBypassed: boolean;
    beforeParams: Record<string, number>;
    afterParams: Record<string, number>;
    intendedParameterDelta: Record<string, { before: number; after: number }>;
    clipSha256: string;
    currentSrc: string;
  };
}

export interface VisualProofReport {
  schemaVersion: typeof PROOF_REPORT_SCHEMA_VERSION;
  manifest: VisualProofManifest;
  environment: {
    browserName: string;
    browserVersion: string;
    headless: boolean;
    fixture: typeof FIXED_VISUAL_PROOF_FIXTURE;
    viewport: typeof FIXED_VISUAL_PROOF_VIEWPORT;
    timelineSource: string;
    timelinePositionsSeconds: number[];
    cdpProduct: string;
    cdpUserAgent: string;
    browserCommandLine: string[];
    gpu: {
      api: 'WebGPU';
      provenanceSource: 'navigator.gpu.requestAdapter';
      adapterInfoAvailable: boolean;
      vendor: string;
      architecture: string;
      device: string;
      description: string;
      isFallbackAdapter: boolean | null;
      deviceCreated: boolean;
      deviceLabel: string;
      deviceFeatures: string[];
      softwareRenderer: boolean;
    };
  };
  humanObservationAttestation: {
    observed: boolean;
    lagObserved: boolean;
    operator: string;
    statement: string;
  };
  provenance: ArtifactProvenance & {
    catalogDigest: string;
    controlInventoryDigest: string;
    fixtureFiles: VisualProofMediaMetadata[];
  };
  realMedia: {
    selectedVia: 'CLIP';
    assignedVia: 'serial QA target helper from one selected File object';
    videoExercise: Array<{
      fileName: string; relativePath: string; sha256: string; size: number;
      selectedFileSha256: string; selectedFileSize: number;
      currentSrc: string; pgmModule: string; bindingId: string; videoWidth: number; videoHeight: number; durationSeconds: number;
      readyState: number; hasVideo: boolean; externalTextureImported: boolean; externalTextureBound: boolean;
      samplePath: string; rendererSource: string | null; rendererDimensions: string | null; rendererFrameId: number | null; videoSize: string;
      firstTimelineSeconds: number; secondTimelineSeconds: number; firstMediaTimeSeconds: number; secondMediaTimeSeconds: number;
      firstCentralFrameId: number; secondCentralFrameId: number;
      firstScreenshot: string; secondScreenshot: string;
      firstContentHash: string; secondContentHash: string;
      nonBlackPixelRatio: number; pixelMotionRatio: number;
      sampleCount: number; p95IntervalMs: number; maxIntervalMs: number;
      droppedFrames: number; stalledFrames: number; released: boolean; previousSourceUnbound: boolean;
      frameIntervalsMs: number[];
    }>;
    audioExercise: {
      fileName: string; relativePath: string; sha256: string; size: number;
      loadedVia: 'SONG -> LOCAL ONLY'; volume: number; observationDurationMs: number;
      contextStateBefore: string; contextStateAfter: string;
      contextTimeBefore: number; contextTimeAfter: number;
      mediaTimeBefore: number; mediaTimeAfter: number;
      rmsPeak: number; amplitudePeak: number; currentSrc: string; mediaPaused: boolean; mediaMuted: boolean;
      expectedBpm: number; detectedBpm: number;
    };
    assignments: Record<string, { fileName: string; sha256: string }>;
    noNetwork: { requests: string[]; externalRequests: string[] };
    pausedBeforeEffectMatrix: boolean;
    maxSimultaneousDecoded: number;
    adjacentCrossFileDifferenceRatios: number[];
  };
  evidence: VisualProofEvidence[];
  consoleErrors: string[];
  uncaughtErrors: string[];
  networkRequests: string[];
  gpuErrors: string[];
  captureErrors: string[];
}

export interface VisualProofGateResult {
  passed: boolean;
  blockers: string[];
}

type RealVideoExercise = VisualProofReport['realMedia']['videoExercise'][number];

export function realVideoMediaAdvanceSeconds(clip: RealVideoExercise): number {
  const delta = clip.secondMediaTimeSeconds - clip.firstMediaTimeSeconds;
  return delta >= 0 ? delta : delta + clip.durationSeconds;
}

export function validateVisualProofRealVideoExercise(clip: RealVideoExercise): string[] {
  const intervals = [...(clip.frameIntervalsMs ?? [])].sort((a, b) => a - b);
  const recomputedP95 = intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * 0.95))] ?? Infinity;
  const recomputedMax = intervals.length ? Math.max(...intervals) : Infinity;
  const recomputedDropped = intervals.filter((value) => value > 34).length;
  const recomputedStalled = intervals.filter((value) => value > 100).length;
  const invalid = !clip.currentSrc.startsWith('blob:') || clip.videoWidth < 1 || clip.videoHeight < 1 || clip.durationSeconds <= 0 ||
    clip.selectedFileSha256 !== clip.sha256 || clip.selectedFileSize !== clip.size ||
    clip.secondTimelineSeconds <= clip.firstTimelineSeconds || clip.secondCentralFrameId <= clip.firstCentralFrameId ||
    clip.secondTimelineSeconds - clip.firstTimelineSeconds < 0.75 || realVideoMediaAdvanceSeconds(clip) < 0.5 ||
    clip.readyState < 2 || !clip.hasVideo || !clip.externalTextureImported || !clip.externalTextureBound ||
    clip.pgmModule !== 'transition' || clip.bindingId !== 'pgm' || clip.samplePath !== 'external-texture' || clip.rendererSource !== clip.currentSrc || clip.rendererFrameId === null ||
    clip.rendererDimensions !== `${clip.videoWidth}x${clip.videoHeight}` || clip.videoSize !== `${clip.videoWidth}x${clip.videoHeight}` ||
    clip.nonBlackPixelRatio <= 0.01 || clip.pixelMotionRatio <= 0.01 ||
    clip.sampleCount < 45 || clip.p95IntervalMs > 34 || clip.maxIntervalMs > 150 ||
    clip.stalledFrames > 0 || clip.droppedFrames / clip.sampleCount > 0.15 || !clip.released || !clip.previousSourceUnbound ||
    clip.sampleCount !== intervals.length || Math.abs(clip.p95IntervalMs - recomputedP95) > 1e-6 ||
    Math.abs(clip.maxIntervalMs - recomputedMax) > 1e-6 || clip.droppedFrames !== recomputedDropped || clip.stalledFrames !== recomputedStalled ||
    clip.firstContentHash === clip.secondContentHash;
  return invalid ? [`real MP4 was not visibly decoded and moving: ${clip.fileName}`] : [];
}

export function buildVisualProofManifest(controls: AdvertisedControl[]): VisualProofManifest {
  const items: VisualProofManifestItem[] = [];

  for (const module of listCatalog()) {
    items.push({
      id: `module:${module.id}`,
      kind: 'module',
      subjectId: module.id,
      label: module.name
    });

    const shaderKey = module.shaderKey ?? module.id;
    items.push({
      id: `shader:${shaderKey}`,
      kind: 'shader',
      subjectId: shaderKey,
      label: `${module.name} WGSL effect`
    });

    for (const preset of MODULE_PRESETS[module.id] ?? []) {
      items.push({
        id: `preset:${module.id}:${preset.n}`,
        kind: 'preset',
        subjectId: `${module.id}:${preset.n}`,
        label: `${module.name} — ${preset.title}`
      });
    }
  }

  for (const control of controls) {
    items.push({
      id: `control:${control.id}`,
      kind: 'control',
      subjectId: control.id,
      label: control.label,
      controlKind: control.kind,
      controlState: control.state ?? 'base'
    });
  }

  return {
    schemaVersion: 1,
    fixture: clone(FIXED_VISUAL_PROOF_FIXTURE),
    viewport: clone(FIXED_VISUAL_PROOF_VIEWPORT),
    timelinePositionsSeconds: [...FIXED_VISUAL_PROOF_TIMELINE_POSITIONS],
    controlInventory: {
      selector: 'button:not([disabled]),input:not([disabled]),select:not([disabled]),[role="button"]:not([aria-disabled="true"]),[role="slider"]:not([aria-disabled="true"]),[data-bmx-mouse-control]',
      states: ['base', 'audio-consent'],
      discoveredCount: controls.length,
      includedCount: controls.length
    },
    items
  };
}

export function evaluateVisualProofReport(report: VisualProofReport): VisualProofGateResult {
  const blockers: string[] = [];
  const gpu = report.environment?.gpu;
  const gpuIdentity = gpu
    ? [gpu.vendor, gpu.architecture, gpu.device, gpu.description].map((value) => value.trim()).filter(Boolean)
    : [];
  const softwareGpuPattern = /swiftshader|llvmpipe|lavapipe|software(?:\s+renderer)?|microsoft basic render|\bwarp\b/i;
  const softwareLaunchArgumentPattern = /(?:enable-unsafe-swiftshader|use-angle=swiftshader|use-gl=swiftshader|disable-gpu)/i;

  if (
    report.environment.headless ||
    !report.humanObservationAttestation?.observed ||
    report.humanObservationAttestation?.lagObserved !== false ||
    !/^[A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+)+$/.test(report.humanObservationAttestation?.operator?.trim() ?? '') ||
    /^(QA Operator|Test User|Unknown|Fake User)$/i.test(report.humanObservationAttestation.operator) ||
    report.humanObservationAttestation.statement !== 'Human-observed headed browser; this attestation is not machine-verifiable.'
  ) {
    blockers.push('explicit, separately identified human observation attestation is required');
  }
  if (!report.environment.browserName.trim() || !report.environment.browserVersion.trim()) {
    blockers.push('physical browser name and version are required');
  }
  if (!['browser', 'pwa'].includes(report.provenance?.environment?.shellKind ?? '')) {
    blockers.push('report shell identity does not match the headed browser capture');
  }
  if (
    !/^Chrome|Chromium$/.test(report.environment.browserName) ||
    !/^\d+\.\d+/.test(report.environment.browserVersion) ||
    !report.environment.cdpProduct.includes('/') ||
    !/Chrome|Chromium/.test(report.environment.cdpUserAgent) ||
    report.environment.browserCommandLine.some((arg) => arg.includes('--headless'))
  ) {
    blockers.push('browser identity must come from a headed CDP browser session');
  }
  if (
    !gpu ||
    gpu.api !== 'WebGPU' ||
    gpu.provenanceSource !== 'navigator.gpu.requestAdapter' ||
    !gpu.adapterInfoAvailable ||
    !gpu.deviceCreated ||
    !Array.isArray(gpu.deviceFeatures) ||
    gpuIdentity.length === 0 ||
    gpuIdentity.every((value) => /^(?:unknown|unavailable|none|null|n\/a)$/i.test(value))
  ) {
    blockers.push('WebGPU adapter/device provenance is missing or unknown');
  }
  if (
    !gpu ||
    gpu.isFallbackAdapter !== false ||
    gpu.softwareRenderer !== false ||
    softwareGpuPattern.test(gpuIdentity.join(' ')) ||
    report.environment.browserCommandLine.some((arg) => softwareLaunchArgumentPattern.test(arg))
  ) {
    blockers.push('physical proof requires a native hardware WebGPU adapter, not software or fallback rendering');
  }
  if (report.schemaVersion !== PROOF_REPORT_SCHEMA_VERSION) blockers.push('unsupported visual-proof report schema');
  blockers.push(...validateArtifactProvenance(report.provenance));
  if (!/^[a-f0-9]{64}$/.test(report.provenance?.catalogDigest ?? '') ||
      !/^[a-f0-9]{64}$/.test(report.provenance?.controlInventoryDigest ?? '')) {
    blockers.push('visual-proof inventory provenance is missing or invalid');
  }
  if (!same(report.environment.fixture, FIXED_VISUAL_PROOF_FIXTURE)) {
    blockers.push('fixed QA fixture does not match the release manifest');
  }
  if (!same(report.environment.viewport, FIXED_VISUAL_PROOF_VIEWPORT)) {
    blockers.push('fixed viewport does not match the release manifest');
  }
  if (report.environment.timelineSource !== 'AudioContext.currentTime') {
    blockers.push('timeline must be sourced from AudioContext.currentTime');
  }
  if (!same(report.environment.timelinePositionsSeconds, FIXED_VISUAL_PROOF_TIMELINE_POSITIONS)) {
    blockers.push('fixed timeline positions do not match the release manifest');
  }
  if (!same(report.manifest.fixture, FIXED_VISUAL_PROOF_FIXTURE)) {
    blockers.push('proof manifest fixture is not the fixed QA fixture');
  }
  if (report.realMedia?.videoExercise?.length !== REDLINE_VIDEO_NAMES.length ||
      !same(report.realMedia.videoExercise.map((entry) => entry.fileName), [...REDLINE_VIDEO_NAMES])) {
    blockers.push('real-media phase must exercise every staged MP4 in manifest order');
  } else {
    const uniqueSources = new Set(report.realMedia.videoExercise.map((entry) => entry.currentSrc));
    const uniqueFirstFrames = new Set(report.realMedia.videoExercise.map((entry) => entry.firstContentHash));
    const crossFileRatios = report.realMedia.adjacentCrossFileDifferenceRatios ?? [];
    if (uniqueSources.size !== REDLINE_VIDEO_NAMES.length || uniqueFirstFrames.size < 10 ||
        crossFileRatios.length !== REDLINE_VIDEO_NAMES.length - 1 || crossFileRatios.filter((ratio) => ratio > 0.01).length < 8) {
      blockers.push('real-video sequence reused the same PGM source or screenshot content');
    }
    for (const clip of report.realMedia.videoExercise) {
      blockers.push(...validateVisualProofRealVideoExercise(clip));
      const sample = report.provenance?.contentIntegrity?.primarySamples
        .find((entry) => entry.assetName === clip.fileName);
      if (!sample || sample.assetSha256 !== clip.sha256 || sample.observedSource !== clip.currentSrc ||
          sample.rendererSource !== clip.rendererSource || sample.sourceFrameId !== clip.rendererFrameId ||
          Math.abs(sample.sourceTimestampSeconds - clip.secondMediaTimeSeconds) > 1e-6 ||
          sample.width !== clip.videoWidth || sample.height !== clip.videoHeight) {
        blockers.push(`content-integrity sample does not match observed visual diagnostics: ${clip.fileName}`);
      }
    }
  }
  if (report.realMedia?.selectedVia !== 'CLIP' || report.realMedia?.assignedVia !== 'serial QA target helper from one selected File object') {
    blockers.push('real MP4s were not selected serially through the actual CLIP UI path');
  }
  const audio = report.realMedia?.audioExercise;
  if (!audio || audio.fileName !== REDLINE_AUDIO_NAME || audio.loadedVia !== 'SONG -> LOCAL ONLY' ||
      !audio.currentSrc.startsWith('blob:') || audio.volume < 0.25 || audio.observationDurationMs < 2500 ||
      audio.contextStateAfter !== 'running' || audio.contextTimeAfter - audio.contextTimeBefore < 2 ||
      audio.mediaTimeAfter - audio.mediaTimeBefore < 2 || audio.mediaPaused || audio.mediaMuted ||
      audio.rmsPeak <= 0.005 || audio.amplitudePeak <= 0.005) {
    blockers.push('real Redline audio was not audibly played through SONG -> LOCAL ONLY');
  }
  if (!audio || audio.expectedBpm !== REDLINE_EXPECTED_BPM ||
      !Number.isFinite(audio.detectedBpm) || Math.abs(audio.detectedBpm - audio.expectedBpm) > 0.01) {
    blockers.push(`Redline BPM mismatch: expected ${REDLINE_EXPECTED_BPM}`);
  }
  if (!report.realMedia?.pausedBeforeEffectMatrix) blockers.push('transport was not centrally paused before deterministic effect capture');
  if (report.realMedia?.noNetwork?.externalRequests?.length ||
      report.realMedia?.noNetwork?.requests?.some((url) => /\/(?:__api|api)\/analyze\//.test(url))) {
    blockers.push('network analysis/upload traffic occurred during the real-media phase');
  }
  const catalogSize = listCatalog().length;
  if (Object.keys(report.realMedia?.assignments ?? {}).length !== catalogSize) {
    blockers.push(`real clips were not assigned across all ${catalogSize} modules`);
  }
  if (report.realMedia?.maxSimultaneousDecoded !== 1) blockers.push('real-media proof decoded more than one video at a time');
  if (!same(report.manifest.viewport, FIXED_VISUAL_PROOF_VIEWPORT)) {
    blockers.push('proof manifest viewport is not the fixed viewport');
  }
  if (!same(report.manifest.timelinePositionsSeconds, FIXED_VISUAL_PROOF_TIMELINE_POSITIONS)) {
    blockers.push('proof manifest timeline positions are not fixed');
  }
  if (
    report.manifest.controlInventory.discoveredCount < 1 ||
    report.manifest.controlInventory.includedCount !== report.manifest.controlInventory.discoveredCount
  ) {
    blockers.push('manifest must include every enabled advertised UI control');
  }
  const declaredControlCount = report.manifest.items.filter((item) => item.kind === 'control').length;
  if (declaredControlCount !== report.manifest.controlInventory.includedCount) {
    blockers.push('control inventory count does not match manifest controls');
  }
  const consentLabels = report.manifest.items
    .filter((item) => item.kind === 'control' && item.controlState === 'audio-consent')
    .map((item) => item.label.toUpperCase());
  if (!['ANALYZE', 'LOCAL ONLY', 'CANCEL'].every((label) => consentLabels.includes(label))) {
    blockers.push('conditional audio privacy controls are missing from the stable manifest');
  }

  const expectedManifest = buildVisualProofManifest(
    report.manifest.items
      .filter((item) => item.kind === 'control')
      .map((item) => ({ id: item.subjectId, label: item.label, kind: 'button' as const }))
  );
  const expectedCatalogIds = expectedManifest.items
    .filter((item) => item.kind !== 'control')
    .map((item) => item.id)
    .sort();
  const reportCatalogIds = report.manifest.items
    .filter((item) => item.kind !== 'control')
    .map((item) => item.id)
    .sort();
  if (!same(reportCatalogIds, expectedCatalogIds)) {
    blockers.push('manifest does not cover every released module, preset, and WGSL shader effect');
  }
  const missingShaderModes = findMissingShaderModes();
  if (missingShaderModes.length > 0) {
    blockers.push(`released modules missing WGSL shader modes: ${missingShaderModes.join(', ')}`);
  }
  const modules = report.manifest.items.filter((item) => item.kind === 'module');
  const presets = report.manifest.items.filter((item) => item.kind === 'preset');
  const shaders = report.manifest.items.filter((item) => item.kind === 'shader');
  const expectedPresetCount = listCatalog().reduce(
    (sum, mod) => sum + (MODULE_PRESETS[mod.id] ?? []).length,
    0
  );
  if (modules.length !== catalogSize || presets.length !== expectedPresetCount || shaders.length !== catalogSize) {
    blockers.push(
      `proof requires exactly ${catalogSize} modules, ${expectedPresetCount} presets, and ${catalogSize} WGSL entries`
    );
  }
  if (new Set(shaders.map((item) => item.subjectId)).size !== catalogSize) {
    blockers.push(`proof requires ${catalogSize} unique WGSL entries`);
  }

  const evidenceByItem = new Map<string, VisualProofEvidence>();
  for (const evidence of report.evidence) {
    if (evidenceByItem.has(evidence.itemId)) {
      blockers.push(`duplicate visual proof: ${evidence.itemId}`);
      continue;
    }
    evidenceByItem.set(evidence.itemId, evidence);
  }

  for (let itemIndex = 0; itemIndex < report.manifest.items.length; itemIndex++) {
    const item = report.manifest.items[itemIndex]!;
    const evidence = evidenceByItem.get(item.id);
    if (!evidence) {
      blockers.push(`missing visual proof: ${item.id}`);
      continue;
    }
    if (!isScreenshotArtifact(evidence.before) || !isScreenshotArtifact(evidence.after)) {
      blockers.push(`invalid screenshot artifact path: ${item.id}`);
    }
    if (evidence.before === evidence.after) {
      blockers.push(`before/after screenshots must be distinct: ${item.id}`);
    }
    if (
      !evidence.screenshotContentChanged ||
      !evidence.beforeContentHash ||
      !evidence.afterContentHash ||
      evidence.beforeContentHash === evidence.afterContentHash
    ) {
      blockers.push(`before/after screenshot content is unchanged: ${item.id}`);
    }
    const requiredTimelinePosition = FIXED_VISUAL_PROOF_TIMELINE_POSITIONS[itemIndex % FIXED_VISUAL_PROOF_TIMELINE_POSITIONS.length]!;
    if (evidence.timelinePositionSeconds !== requiredTimelinePosition) {
      blockers.push(`non-deterministic timeline position: ${item.id}`);
    }
    if (!evidence.expectedOutcome.trim()) {
      blockers.push(`advertised outcome is not declared: ${item.id}`);
    }
    if (!evidence.changed || same(evidence.beforeState, evidence.afterState)) {
      blockers.push(`no intended before/after change observed: ${item.id}`);
    }
    if (evidence.blackFrame || evidence.nonBlackPixelRatio <= 0.01) {
      blockers.push(`black frame detected: ${item.id}`);
    }
    const timeline = evidence.timeline;
    if (!timeline || timeline.source !== 'AudioContext.currentTime') {
      blockers.push(`authoritative timeline diagnostics missing: ${item.id}`);
    } else {
      if (
        timeline.centralFrameId < 1 ||
        timeline.subscriberFrameIds.length < 2 ||
        timeline.subscriberFrameIds.some((frameId) => frameId !== timeline.centralFrameId)
      ) {
        blockers.push(`subscribers did not observe the central timeline frame: ${item.id}`);
      }
      if (
        !Number.isInteger(timeline.generation) || timeline.generation < 1 ||
        !Number.isInteger(timeline.deterministicSeed) ||
        !(timeline.fixedStepSeconds > 0) ||
        !Number.isInteger(timeline.fixedStepIndex) || timeline.fixedStepIndex < 0 ||
        !/^[0-9a-f]{8}$/.test(timeline.uniformHash)
      ) {
        blockers.push(`fixed-step/uniform/generation/seed diagnostics missing: ${item.id}`);
      }
      if (
        !timeline.fixtureClipName ||
        !REDLINE_VIDEO_NAMES.includes(timeline.fixtureClipName) ||
        !timeline.currentSrc?.startsWith('blob:') || timeline.videoWidth < 1 || timeline.videoHeight < 1 ||
        timeline.durationSeconds <= 0 || timeline.rendererHasVideo !== true ||
        timeline.externalTextureImported !== true || timeline.externalTextureBound !== true ||
        timeline.bindingId !== 'pgm' || timeline.samplePath !== 'external-texture' || timeline.rendererSource !== timeline.currentSrc ||
        timeline.rendererDimensions !== `${timeline.videoWidth}x${timeline.videoHeight}` || timeline.rendererFrameId === null ||
        Math.abs(timeline.actualMediaTimeSeconds - timeline.expectedMediaTimeSeconds) >
          timeline.mediaTimeToleranceSeconds
      ) {
        blockers.push(`fixed fixture media is not synchronized within tolerance: ${item.id}`);
      }
    }
    if (item.kind !== 'control') {
      const configuration = evidence.configuration;
      if (
        !configuration ||
        configuration.moduleId !== item.subjectId.split(':')[0] ||
        configuration.fixtureClipName !== timeline?.fixtureClipName ||
        configuration.clipSha256 !== report.realMedia?.assignments?.[configuration.moduleId]?.sha256 ||
        configuration.currentSrc !== timeline?.currentSrc ||
        configuration.beforeBypassed !== true ||
        configuration.afterBypassed !== false ||
        Object.keys(configuration.intendedParameterDelta).length < 1 ||
        Object.values(configuration.intendedParameterDelta).some((delta) => delta.before === delta.after)
      ) {
        blockers.push(`module proof did not hold fixture/module constant with an intended parameter delta: ${item.id}`);
      }
    }
  }

  if (report.consoleErrors.length > 0) {
    blockers.push(`browser console errors: ${report.consoleErrors.join('; ')}`);
  }
  if (report.uncaughtErrors.length > 0) {
    blockers.push(`uncaught browser errors: ${report.uncaughtErrors.join('; ')}`);
  }
  if (report.gpuErrors.length > 0) blockers.push(`GPU errors or device loss: ${report.gpuErrors.join('; ')}`);
  if (report.captureErrors.length > 0) {
    blockers.push(`visual proof capture errors: ${report.captureErrors.join('; ')}`);
  }
  if (report.captureErrors.length > 1) blockers.push('cascading visual-proof errors are invalid; capture must fail fast');

  return { passed: blockers.length === 0, blockers };
}

function isScreenshotArtifact(path: string): boolean {
  return (
    path.startsWith('.artifacts/visual-proof/') &&
    path.endsWith('.png') &&
    !path.includes('..')
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Kept explicit so a catalog entry without a registered WGSL mode cannot be released. */
export function findMissingShaderModes(): string[] {
  return listCatalog()
    .map((module) => module.shaderKey ?? module.id)
    .filter((shaderKey) => !(shaderKey in SHADER_EFFECT_MODE));
}
