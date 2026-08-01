export const EIGHT_VIDEO_WARMUP_MS = 5_000;
export const EIGHT_VIDEO_OBSERVATION_MS = 30_000;
export const EIGHT_VIDEO_SLOT_COUNT = 8;

export interface EightVideoSlotSample {
  moduleId: string;
  fileName: string;
  elementIdentity: string;
  currentSrc: string;
  readyState: number;
  paused: boolean;
  currentTime: number;
  videoWidth: number;
  videoHeight: number;
  duration: number;
  totalVideoFrames: number;
  droppedVideoFrames: number;
  render: {
    source: string | null;
    externalTextureImported: boolean;
    externalTextureBound: boolean;
    cachedTextureUploaded: boolean;
    cachedTextureBound: boolean;
    samplePath: string;
    frameId: number | null;
    renderCount: number;
    skippedRenderCount: number;
    targetFps: number;
    frameIntervalMs: number | null;
  };
}

export interface EightVideoScreenshotEvidence {
  moduleId: string;
  firstPath: string;
  secondPath: string;
  firstSha256: string;
  secondSha256: string;
  firstNonBlackPixelRatio: number;
  secondNonBlackPixelRatio: number;
  pixelMotionRatio: number;
}

export interface CatalogHotSwapSlotSample {
  canvasId: string;
  canvasIdentity: string;
  moduleId: string;
  sourceId: string;
  elementIdentity: string;
  currentSrc: string;
  currentTime: number;
  totalVideoFrames: number;
  driftSeconds: number;
  renderCount: number;
  bindingId: string;
  renderedModuleId: string;
  renderedSourceId: string;
  effectMode: number;
  rendererSource: string | null;
  samplePath: string;
  cachedTextureBound: boolean;
}

export interface CatalogHotSwapFrameSample {
  phase: 'before' | 'settle';
  elapsedMs: number;
  decoderCount: number;
  documentVideoCount: number;
  timelineGeneration: number;
  timelineFrameId: number;
  transportSeconds: number;
  slots: CatalogHotSwapSlotSample[];
}

export interface CatalogHotSwapStressEvidence {
  mutationPath: 'assignModuleToSlot';
  catalog: Array<{ moduleId: string; row: 'top' | 'bottom' | 'both'; shaderKey: string; effectMode: number }>;
  baseline: {
    decoderCount: number;
    documentVideoCount: number;
    timelineGeneration: number;
    slots: Array<Pick<CatalogHotSwapSlotSample, 'canvasId' | 'canvasIdentity' | 'elementIdentity' | 'currentSrc' | 'sourceId'>>;
  };
  steps: Array<{
    index: number;
    moduleId: string;
    row: 'top' | 'bottom';
    slotIndex: number;
    accepted: boolean;
    expectedEffectMode: number;
    samples: CatalogHotSwapFrameSample[];
    screenshot: { path: string; sha256: string; nonBlackPixelRatio: number };
    pgm: {
      selectedCanvasId: string;
      selectedElementIdentity: string;
      pgmElementIdentity: string;
      selectedCurrentSrc: string;
      rendererSource: string | null;
      rendererSourceId: string;
      decoderCount: number;
      documentVideoCount: number;
    };
  }>;
}

export interface EightVideoProofReport {
  schemaVersion: 1;
  capturedAt: string;
  provenance: { sourceDigest: string; buildDigest: string };
  warmupMs: number;
  observationMs: number;
  environment: {
    browserProduct: string;
    userAgent: string;
    headless: boolean;
    commandLine: string[];
    /** Optional runtime label, e.g. `web`, `tauri-macos-native`. */
    runtime?: string;
    gpu: {
      vendor: string;
      architecture: string;
      device: string;
      description: string;
      isFallbackAdapter: boolean | null;
      softwareRenderer: boolean;
      deviceCreated: boolean;
    };
  };
  humanObservation: { observed: boolean; operator: string; lagObserved: boolean };
  fixtures: Array<{
    relativePath: string;
    name: string;
    size: number;
    sha256: string;
    durationSeconds: number;
    width: number | null;
    height: number | null;
    codecs: string[];
    formatName: string;
  }>;
  loadedVia: 'UI CLIPS multi-file';
  audio: {
    fileName: string;
    loadedVia: 'SONG -> ANALYZE';
    usingUploadedTrack: boolean;
    analysisStatus: string;
    analysisConfidence: number | null;
    bpm: number;
    contextState: string;
    contextTimeDelta: number;
    mediaTimeDelta: number;
    mediaPaused: boolean;
    mediaMuted: boolean;
    volume: number;
    rmsPeak: number;
    amplitudePeak: number;
  };
  decoderCount: number;
  samples: Array<{
    elapsedMs: number;
    decoderCount: number;
    documentVideoCount: number;
    timelineGeneration: number;
    timelineFrameId: number;
    transportSeconds: number;
    maxDriftSeconds: number;
    slots: EightVideoSlotSample[];
  }>;
  networkRequests: string[];
  screenshots: EightVideoScreenshotEvidence[];
  pgmCuts: Array<{
    moduleId: string;
    decoderCount: number;
    documentVideoCount: number;
    selectedElementIdentity: string;
    pgmElementIdentity: string;
    selectedSourceId: string;
    rendererSourceId: string;
    selectedCurrentSrc: string;
    rendererSource: string | null;
    externalTextureImported: boolean;
    externalTextureBound: boolean;
    cachedTextureUploaded: boolean;
    cachedTextureBound: boolean;
    samplePath: string;
  }>;
  hotSwap: CatalogHotSwapStressEvidence;
  errors: { console: string[]; network: string[]; gpu: string[]; uncaught: string[] };
}

export function evaluateCatalogHotSwapStress(evidence: CatalogHotSwapStressEvidence | undefined) {
  const blockers: string[] = [];
  const fail = (condition: unknown, message: string) => { if (condition) blockers.push(message); };
  if (!evidence) return { passed: false, blockers: ['all-catalog hot-swap evidence is missing'] };

  fail(evidence.mutationPath !== 'assignModuleToSlot', 'hot swaps did not use the rack assignment domain path');
  fail(evidence.catalog.length < 1, 'runtime catalog discovery returned no modules');
  fail(new Set(evidence.catalog.map((item) => item.moduleId)).size !== evidence.catalog.length,
    'runtime catalog contains duplicate module IDs');
  fail(evidence.catalog.some((item) => !item.shaderKey || !Number.isFinite(item.effectMode)),
    'runtime catalog contains an unregistered shader effect mode');
  fail(evidence.baseline.decoderCount !== EIGHT_VIDEO_SLOT_COUNT ||
    evidence.baseline.documentVideoCount !== EIGHT_VIDEO_SLOT_COUNT ||
    evidence.baseline.slots.length !== EIGHT_VIDEO_SLOT_COUNT,
  'hot-swap baseline must contain exactly eight decoders, videos, and slots');

  const baseline = new Map(evidence.baseline.slots.map((slot) => [slot.canvasId, slot]));
  fail(baseline.size !== EIGHT_VIDEO_SLOT_COUNT ||
    new Set(evidence.baseline.slots.map((slot) => slot.canvasIdentity)).size !== EIGHT_VIDEO_SLOT_COUNT ||
    new Set(evidence.baseline.slots.map((slot) => slot.elementIdentity)).size !== EIGHT_VIDEO_SLOT_COUNT ||
    new Set(evidence.baseline.slots.map((slot) => slot.currentSrc)).size !== EIGHT_VIDEO_SLOT_COUNT,
  'hot-swap baseline identities and sources must be eight distinct stable values');

  const catalogById = new Map(evidence.catalog.map((item) => [item.moduleId, item]));
  fail(evidence.steps.length !== evidence.catalog.length, 'every discovered catalog module requires one deterministic swap step');
  fail(new Set(evidence.steps.map((step) => step.moduleId)).size !== evidence.catalog.length ||
    evidence.catalog.some((item) => !evidence.steps.some((step) => step.moduleId === item.moduleId)),
  'hot-swap steps do not cover every discovered catalog module exactly once');

  const generations = new Set<number>([evidence.baseline.timelineGeneration]);
  for (const [expectedIndex, step] of evidence.steps.entries()) {
    const catalog = catalogById.get(step.moduleId);
    fail(step.index !== expectedIndex, `hot-swap step order is not deterministic: ${step.moduleId}`);
    fail(!catalog || (catalog.row !== 'both' && catalog.row !== step.row), `hot-swap row affinity failed: ${step.moduleId}`);
    fail(!step.accepted, `rack assignment rejected catalog module: ${step.moduleId}`);
    fail(!catalog || step.expectedEffectMode !== catalog.effectMode, `shader effect mode mismatch: ${step.moduleId}`);
    fail(step.samples.length < 30 || step.samples[0]?.phase !== 'before' || !step.samples.some((sample) => sample.phase === 'settle') ||
      (step.samples.at(-1)?.elapsedMs ?? 0) < 1_000,
      `rAF evidence does not span before mutation through settle: ${step.moduleId}`);
    fail(!step.screenshot.path || !step.screenshot.sha256 || step.screenshot.nonBlackPixelRatio < 0.02,
      `swap screenshot evidence is missing or black: ${step.moduleId}`);

    const before = step.samples[0];
    const after = step.samples.at(-1);
    for (const sample of step.samples) {
      generations.add(sample.timelineGeneration);
      fail(sample.decoderCount !== EIGHT_VIDEO_SLOT_COUNT || sample.documentVideoCount !== EIGHT_VIDEO_SLOT_COUNT ||
        sample.slots.length !== EIGHT_VIDEO_SLOT_COUNT, `decoder/video count changed during swap: ${step.moduleId}`);
      for (const slot of sample.slots) {
        const base = baseline.get(slot.canvasId);
        fail(!base || slot.canvasIdentity !== base.canvasIdentity || slot.elementIdentity !== base.elementIdentity ||
          slot.currentSrc !== base.currentSrc || slot.sourceId !== base.sourceId,
        `slot media or canvas identity changed during swap: ${step.moduleId}:${slot.canvasId}`);
        fail(slot.bindingId !== slot.canvasId || slot.renderedModuleId !== slot.moduleId ||
          slot.renderedSourceId !== slot.sourceId || slot.rendererSource !== slot.currentSrc,
        `renderer binding/effect/source mismatch: ${step.moduleId}:${slot.canvasId}`);
        const expected = catalogById.get(slot.moduleId)?.effectMode;
        fail(expected === undefined || slot.effectMode !== expected,
          `rendered shader effect mode mismatch: ${step.moduleId}:${slot.canvasId}`);
        fail(slot.samplePath === 'test-card' || !['external-texture', 'cached-video-texture'].includes(slot.samplePath),
          `synthetic or missing video sample appeared during swap: ${step.moduleId}:${slot.canvasId}`);
        fail(slot.cachedTextureBound && slot.moduleId !== 'timesampler',
          `persistent video cache was used outside timesampler: ${step.moduleId}:${slot.canvasId}`);
        fail(Math.abs(slot.driftSeconds) > 0.4, `shared timeline drift exceeded 400ms during swap: ${step.moduleId}:${slot.canvasId}`);
      }
    }
    fail(!before || !after || after.timelineFrameId <= before.timelineFrameId ||
      after.transportSeconds <= before.transportSeconds,
    `timeline did not advance through swap: ${step.moduleId}`);
    if (before && after) {
      const beforeSlots = new Map(before.slots.map((slot) => [slot.canvasId, slot]));
      fail(after.slots.some((slot) => {
        const prior = beforeSlots.get(slot.canvasId);
        return !prior || slot.totalVideoFrames <= prior.totalVideoFrames || slot.renderCount <= prior.renderCount;
      }), `video decode/render frames did not advance through swap: ${step.moduleId}`);
    }
    const selected = baseline.get(step.pgm.selectedCanvasId);
    fail(!selected || step.pgm.decoderCount !== EIGHT_VIDEO_SLOT_COUNT ||
      step.pgm.documentVideoCount !== EIGHT_VIDEO_SLOT_COUNT ||
      step.pgm.selectedElementIdentity !== selected.elementIdentity ||
      step.pgm.pgmElementIdentity !== selected.elementIdentity ||
      step.pgm.selectedCurrentSrc !== selected.currentSrc || step.pgm.rendererSource !== selected.currentSrc ||
      step.pgm.rendererSourceId !== step.pgm.selectedCanvasId,
    `PGM did not reuse the selected slot decoder after swap: ${step.moduleId}`);
  }
  fail(generations.size !== 1, 'timeline generation changed during catalog hot swaps');
  return { passed: blockers.length === 0, blockers };
}

export function evaluateEightVideoProof(report: EightVideoProofReport) {
  const blockers: string[] = [];
  const fail = (condition: unknown, message: string) => { if (condition) blockers.push(message); };
  const first = report.samples[0];
  const last = report.samples.at(-1);
  const firstSlots = first?.slots ?? [];
  const lastByModule = new Map((last?.slots ?? []).map((slot) => [slot.moduleId, slot]));
  const isRealVideoSample = (render: EightVideoSlotSample['render']) =>
    (render.externalTextureImported && render.externalTextureBound && render.samplePath === 'external-texture') ||
    (render.cachedTextureBound && render.samplePath === 'cached-video-texture');

  fail(report.schemaVersion !== 1, 'unsupported report schema');
  fail(report.loadedVia !== 'UI CLIPS multi-file', 'clips were not loaded through the UI CLIPS multi-file path');
  fail(report.warmupMs < EIGHT_VIDEO_WARMUP_MS, 'warmup was shorter than 5 seconds');
  fail(report.observationMs < EIGHT_VIDEO_OBSERVATION_MS, 'observation was shorter than 30 seconds');
  fail(report.environment.headless, 'benchmark must use headed Chrome');
  fail(!report.humanObservation.observed || !report.humanObservation.operator.trim() || report.humanObservation.lagObserved,
    'headed playback requires explicit lag-free physical-browser observation provenance');
  fail(!/Chrome\//.test(report.environment.browserProduct), 'browser is not Chrome');
  const command = report.environment.commandLine.join(' ').toLowerCase();
  fail(!report.environment.commandLine.includes('--enable-automation'), 'Chrome command-line provenance is unavailable');
  const gpuText = Object.values(report.environment.gpu).join(' ').toLowerCase();
  fail(report.environment.gpu.softwareRenderer || report.environment.gpu.isFallbackAdapter === true ||
    /swiftshader|llvmpipe|software/.test(`${command} ${gpuText}`), 'software or fallback GPU is forbidden');
  fail(!report.environment.gpu.deviceCreated, 'WebGPU device provenance is missing');
  fail(![report.environment.gpu.vendor, report.environment.gpu.architecture, report.environment.gpu.device,
    report.environment.gpu.description].some((value) => value.trim()), 'GPU adapter identity metadata is missing');
  fail(report.fixtures.length !== 9 || report.fixtures.filter((f) => f.width !== null).length !== 8,
    'fixture metadata must contain exactly eight videos and Redline');
  fail(!report.fixtures.some((fixture) => fixture.name === 'Redline (Remastered).mp3') ||
    report.fixtures.some((fixture) => fixture.size < 1 || fixture.durationSeconds <= 0 || fixture.codecs.length === 0 ||
      (fixture.width !== null && (fixture.width < 1 || (fixture.height ?? 0) < 1))), 'fixture codec metadata is incomplete');
  fail(new Set(report.fixtures.map((f) => f.sha256)).size !== report.fixtures.length, 'fixtures are not distinct');
  fail(report.decoderCount !== EIGHT_VIDEO_SLOT_COUNT, 'exactly eight video decoders must be active');
  fail(report.samples.some((sample) => sample.decoderCount !== EIGHT_VIDEO_SLOT_COUNT ||
    sample.documentVideoCount !== EIGHT_VIDEO_SLOT_COUNT || sample.slots.length !== EIGHT_VIDEO_SLOT_COUNT ||
    new Set(sample.slots.map((slot) => slot.elementIdentity)).size !== EIGHT_VIDEO_SLOT_COUNT ||
    new Set(sample.slots.map((slot) => slot.currentSrc)).size !== EIGHT_VIDEO_SLOT_COUNT),
  'every observation sample must prove exactly eight unique active video elements and sources');
  fail(firstSlots.length !== EIGHT_VIDEO_SLOT_COUNT || (last?.slots.length ?? 0) !== EIGHT_VIDEO_SLOT_COUNT,
    'every sample must contain eight rack slots');
  fail(report.samples.length < 25 || !first || !last || last.elapsedMs - first.elapsedMs < EIGHT_VIDEO_OBSERVATION_MS - 1_000,
    'observation sampling did not span the full 30-second window');
  fail(new Set(firstSlots.map((s) => s.elementIdentity)).size !== EIGHT_VIDEO_SLOT_COUNT,
    'HTMLVideoElement identities are not unique');
  fail(new Set(firstSlots.map((s) => s.currentSrc)).size !== EIGHT_VIDEO_SLOT_COUNT,
    'currentSrc identities are not unique');
  fail(new Set(firstSlots.map((s) => s.fileName)).size !== EIGHT_VIDEO_SLOT_COUNT, 'rack files are not unique');
  fail(report.samples.some((sample) => sample.slots.some((slot) =>
    (slot.readyState < 2 && slot.render.samplePath !== 'cached-video-texture') || slot.videoWidth < 1 ||
    slot.videoHeight < 1 || slot.paused || !isRealVideoSample(slot.render) || slot.render.source !== slot.currentSrc)),
  'every slot must remain ready, playing, and backed by a real video texture throughout observation');

  for (const slot of firstSlots) {
    const end = lastByModule.get(slot.moduleId);
    const shot = report.screenshots.find((item) => item.moduleId === slot.moduleId);
    const slotSeries = report.samples.map((sample) => sample.slots.find((item) => item.moduleId === slot.moduleId));
    let cumulativeAdvance = 0;
    for (let index = 1; index < slotSeries.length; index++) {
      const previous = slotSeries[index - 1], current = slotSeries[index];
      if (previous && current && previous.duration > 0) {
        cumulativeAdvance += ((current.currentTime - previous.currentTime) % previous.duration + previous.duration) % previous.duration;
      }
    }
    fail(!end || slot.readyState < 2 || end.readyState < 2 || slot.videoWidth < 1 || slot.videoHeight < 1,
      `slot is not decoded: ${slot.moduleId}`);
    fail(!end || slotSeries.some((item) => !item || item.paused) || cumulativeAdvance < 1,
      `slot did not play concurrently: ${slot.moduleId}`);
    fail(!end || end.totalVideoFrames <= slot.totalVideoFrames, `slot decoded no new frames: ${slot.moduleId}`);
    fail(!end || end.render.renderCount <= slot.render.renderCount || end.render.targetFps !== 24 ||
      slotSeries.some((item) => !item || item.render.frameIntervalMs === null || item.render.frameIntervalMs > 100),
      `slot render cadence/frame-time telemetry failed: ${slot.moduleId}`);
    fail(!end || end.droppedVideoFrames - slot.droppedVideoFrames > Math.max(12, (end.totalVideoFrames - slot.totalVideoFrames) * 0.3),
      `slot dropped excessive frames: ${slot.moduleId}`);
    fail(!end || (end.totalVideoFrames - slot.totalVideoFrames) / (report.observationMs / 1000) < 18,
      `slot decode cadence fell below 18 fps: ${slot.moduleId}`);
    fail(!isRealVideoSample(slot.render) || slot.render.source !== slot.currentSrc,
      `slot did not render through a real video texture: ${slot.moduleId}`);
    fail(!slotSeries.some((item) => item?.render.externalTextureImported && item.render.externalTextureBound &&
      item.render.samplePath === 'external-texture'), `slot never proved its live external-texture path: ${slot.moduleId}`);
    fail(!shot || shot.firstNonBlackPixelRatio < 0.02 || shot.secondNonBlackPixelRatio < 0.02,
      `slot rendered black: ${slot.moduleId}`);
    fail(!shot || shot.firstSha256 === shot.secondSha256 || shot.pixelMotionRatio < 0.002,
      `slot rendered a frozen image: ${slot.moduleId}`);
  }

  fail(report.samples.some((sample) => sample.maxDriftSeconds > 0.4), 'shared timeline drift exceeded 400ms');
  fail(new Set(report.samples.map((sample) => sample.timelineGeneration)).size !== 1,
    'timeline generation changed during observation');
  fail(report.pgmCuts.length !== EIGHT_VIDEO_SLOT_COUNT || new Set(report.pgmCuts.map((cut) => cut.moduleId)).size !== EIGHT_VIDEO_SLOT_COUNT,
    'PGM did not cut across all eight slots');
  for (const cut of report.pgmCuts) {
    fail(cut.decoderCount !== EIGHT_VIDEO_SLOT_COUNT || cut.documentVideoCount !== EIGHT_VIDEO_SLOT_COUNT ||
      cut.pgmElementIdentity !== cut.selectedElementIdentity || cut.rendererSource !== cut.selectedCurrentSrc ||
      cut.rendererSourceId !== cut.selectedSourceId,
      `PGM used a ninth or mismatched decoder: ${cut.moduleId}`);
    fail(!((cut.externalTextureImported && cut.externalTextureBound && cut.samplePath === 'external-texture') ||
      (cut.cachedTextureBound && cut.samplePath === 'cached-video-texture')),
      `PGM video texture path failed: ${cut.moduleId}`);
  }
  fail(report.audio.fileName !== 'Redline (Remastered).mp3' || report.audio.loadedVia !== 'SONG -> ANALYZE' ||
    !report.audio.usingUploadedTrack || report.audio.analysisStatus !== 'ready' ||
    !Number.isFinite(report.audio.bpm) || report.audio.bpm < 60 || report.audio.bpm > 200,
    'Redline did not complete the consented Essentia rhythm path with a usable BPM');
  fail(report.audio.contextState !== 'running' || report.audio.contextTimeDelta < 25 || report.audio.mediaTimeDelta < 25 ||
    report.audio.mediaPaused || report.audio.mediaMuted || report.audio.volume < 0.25 ||
    report.audio.rmsPeak <= 0.005 || report.audio.amplitudePeak <= 0.005, 'audible audio diagnostics failed');
  fail(Object.values(report.errors).some((errors) => errors.length > 0), 'console, network, GPU, or uncaught errors were captured');
  blockers.push(...evaluateCatalogHotSwapStress(report.hotSwap).blockers);
  const analysisRequests = report.networkRequests.filter((request) => {
    try {
      const url = new URL(request);
      return ['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/__api\/analyze\/(?:fast|rhythm)$/.test(url.pathname);
    } catch {
      return false;
    }
  });
  fail(analysisRequests.length !== 1 || !analysisRequests[0]?.endsWith('/__api/analyze/rhythm'),
    'expected exactly one same-origin Essentia rhythm analysis request');
  fail(report.networkRequests.some((request) => {
    if (/^(?:blob:|data:)/.test(request)) return false;
    try {
      const url = new URL(request);
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return true;
      if (/^\/__api\/analyze\/(?:fast|rhythm)$/.test(url.pathname)) return false;
      return /^\/(?:__api|api)\/analyze(?:\/|$)/.test(url.pathname);
    } catch {
      return !/^(?:blob:|data:)/.test(request);
    }
  }), 'external or unexpected upload network requests occurred');
  return { passed: blockers.length === 0, blockers };
}
