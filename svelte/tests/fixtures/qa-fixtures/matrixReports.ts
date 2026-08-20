import { buildVisualProofManifest, FIXED_VISUAL_PROOF_FIXTURE, FIXED_VISUAL_PROOF_TIMELINE_POSITIONS, FIXED_VISUAL_PROOF_VIEWPORT, type VisualProofReport } from '$lib/qa/visualProof';
import { createArtifactProvenance } from '$lib/qa/artifactProvenance';
import { REDLINE_AUDIO_NAME, REDLINE_AUDIO_SOURCE_PATH, REDLINE_VIDEO_NAMES, REDLINE_VIDEO_SOURCE_PATHS } from '$lib/qa/redlineProofMedia';
import { EIGHT_VIDEO_OBSERVATION_MS, EIGHT_VIDEO_WARMUP_MS, type EightVideoProofReport } from '$lib/qa/eightVideoProof';
import { WEB_PREVIEW_TARGET_FPS } from '$lib/platform/desktopPerformance';

export function buildVisualProofMatrixReport(): VisualProofReport {
  const manifest = buildVisualProofManifest([
    { id: 'button:play', label: 'Play', kind: 'button', state: 'base' }
  ]);
  const videoExercise = REDLINE_VIDEO_NAMES.map((fileName, index) => ({
    fileName,
    relativePath: REDLINE_VIDEO_SOURCE_PATHS[index]!,
    sha256: '1'.repeat(64),
    size: 1000,
    selectedFileSha256: '1'.repeat(64),
    selectedFileSize: 1000,
    currentSrc: `blob:video-${index}`,
    pgmModule: 'transition',
    bindingId: 'pgm',
    videoWidth: 1920,
    videoHeight: 1080,
    durationSeconds: 10,
    readyState: 4,
    hasVideo: true,
    externalTextureImported: true,
    externalTextureBound: true,
    samplePath: 'external-texture' as const,
    rendererSource: `blob:video-${index}`,
    rendererDimensions: '1920x1080',
    rendererFrameId: index + 1,
    videoSize: '1920x1080',
    firstTimelineSeconds: 1,
    secondTimelineSeconds: 2,
    firstMediaTimeSeconds: 1,
    secondMediaTimeSeconds: 2,
    firstCentralFrameId: index * 2 + 1,
    secondCentralFrameId: index * 2 + 2,
    firstScreenshot: `.artifacts/visual-proof/real-${index}-a.png`,
    secondScreenshot: `.artifacts/visual-proof/real-${index}-b.png`,
    firstContentHash: `a${index}`,
    secondContentHash: `b${index}`,
    nonBlackPixelRatio: 0.75,
    pixelMotionRatio: 0.2,
    sampleCount: 65,
    p95IntervalMs: 17,
    maxIntervalMs: 17,
    droppedFrames: 0,
    stalledFrames: 0,
    released: true,
    previousSourceUnbound: true,
    frameIntervalsMs: Array(65).fill(17)
  }));
  const provenance = createArtifactProvenance({
    captureId: '12345678-1234-4234-8234-123456789abc',
    capturedAt: new Date().toISOString(),
    source: { commit: 'e'.repeat(40), digest: 'a'.repeat(64), workingTreeDirty: false },
    build: { id: 'd'.repeat(64), digest: 'd'.repeat(64), profile: 'production' },
    server: {
      kind: 'vite-production-preview',
      origin: 'http://127.0.0.1:5194',
      buildDigest: 'd'.repeat(64),
      versionPath: '/_app/version.json',
      version: 'current-build',
      versionSha256: 'e'.repeat(64)
    },
    dependencyLock: { path: 'bun.lock', sha256: 'f'.repeat(64) },
    environment: {
      shellKind: 'browser',
      sourceBackend: 'html-video',
      frameProducer: 'HTMLVideoElement.copyExternalImageToTexture',
      releaseEvidence: true,
      webgpuAvailable: true,
      runtime: { name: 'Chrome', version: '128.0.0.0', userAgent: 'Mozilla Chrome/128.0.0.0' },
      device: { operatingSystem: 'darwin', architecture: 'arm64', model: 'Apple M3 Pro', gpuIdentity: 'apple common-3 Apple M3 Pro Metal' }
    },
    capabilities: {
      webgpu: 'passed',
      mediaAdvance: 'passed',
      bpmMatch: 'passed',
      primarySamples: 'passed',
      contentIntegrity: 'passed'
    },
    contentIntegrity: {
      algorithm: 'sha256',
      requiredPrimarySampleCount: videoExercise.length,
      assets: videoExercise.map((clip) => ({ name: clip.fileName, sha256: clip.sha256, size: clip.size })),
      primarySamples: videoExercise.map((clip, index) => ({
        assetName: clip.fileName,
        assetSha256: clip.sha256,
        observedSource: clip.currentSrc,
        rendererSource: clip.rendererSource,
        sourceBackend: 'html-video',
        frameProducer: 'HTMLVideoElement.copyExternalImageToTexture',
        sourceFrameId: clip.rendererFrameId,
        sourceTimestampSeconds: clip.secondMediaTimeSeconds,
        outputFrameSha256: String((index % 9) + 1).repeat(64),
        width: clip.videoWidth,
        height: clip.videoHeight
      }))
    }
  });
  const evidence = manifest.items.map((item, index) => ({
    itemId: item.id,
    before: `.artifacts/visual-proof/${item.id}-before.png`,
    after: `.artifacts/visual-proof/${item.id}-after.png`,
    timelinePositionSeconds: FIXED_VISUAL_PROOF_TIMELINE_POSITIONS[index % FIXED_VISUAL_PROOF_TIMELINE_POSITIONS.length],
    expectedOutcome: `${item.label} produces its advertised visual or state change`,
    beforeState: { active: false },
    afterState: { active: true },
    changed: true,
    blackFrame: false,
    nonBlackPixelRatio: 0.75,
    beforeContentHash: 'before',
    afterContentHash: 'after',
    screenshotContentChanged: true,
    timeline: {
      source: 'AudioContext.currentTime' as const,
      centralFrameId: 42,
      subscriberFrameIds: [42, 42],
      generation: 2,
      deterministicSeed: 1234,
      fixedStepSeconds: 1 / 60,
      fixedStepIndex: 30,
      uniformHash: 'deadbeef',
      expectedMediaTimeSeconds: FIXED_VISUAL_PROOF_TIMELINE_POSITIONS[index % FIXED_VISUAL_PROOF_TIMELINE_POSITIONS.length],
      actualMediaTimeSeconds: FIXED_VISUAL_PROOF_TIMELINE_POSITIONS[index % FIXED_VISUAL_PROOF_TIMELINE_POSITIONS.length] + 0.01,
      mediaTimeToleranceSeconds: 2 / 30,
      fixtureClipName: REDLINE_VIDEO_NAMES[0],
      currentSrc: 'blob:real-video',
      videoWidth: 1920,
      videoHeight: 1080,
      durationSeconds: 10,
      rendererHasVideo: true,
      bindingId: 'pgm',
      externalTextureImported: true,
      externalTextureBound: true,
      samplePath: 'external-texture' as const,
      rendererSource: 'blob:real-video',
      rendererDimensions: '1920x1080',
      rendererFrameId: 42
    }
  }));
  return {
    schemaVersion: 2,
    manifest,
    environment: {
      browserName: 'Chrome',
      browserVersion: '128.0.0.0',
      headless: false,
      fixture: FIXED_VISUAL_PROOF_FIXTURE,
      viewport: FIXED_VISUAL_PROOF_VIEWPORT,
      timelineSource: 'AudioContext.currentTime',
      timelinePositionsSeconds: FIXED_VISUAL_PROOF_TIMELINE_POSITIONS,
      cdpProduct: 'Chrome/128.0.0.0',
      cdpUserAgent: 'Mozilla Chrome/128.0.0.0',
      browserCommandLine: ['chrome', '--enable-automation'],
      gpu: {
        api: 'WebGPU',
        provenanceSource: 'navigator.gpu.requestAdapter',
        adapterInfoAvailable: true,
        vendor: 'apple',
        architecture: 'common-3',
        device: 'Apple M3 Pro',
        description: 'Metal',
        isFallbackAdapter: false,
        deviceCreated: true,
        deviceLabel: '',
        deviceFeatures: ['bgra8unorm-storage'],
        softwareRenderer: false
      }
    },
    humanObservationAttestation: {
      observed: true,
      lagObserved: false,
      operator: 'Real Person',
      statement: 'Human-observed headed browser; this attestation is not machine-verifiable.'
    },
    provenance: {
      ...provenance,
      catalogDigest: 'b'.repeat(64),
      controlInventoryDigest: 'c'.repeat(64),
      fixtureFiles: REDLINE_VIDEO_NAMES.map((name, index) => ({
        relativePath: REDLINE_VIDEO_SOURCE_PATHS[index]!,
        name,
        kind: 'video' as const,
        size: 1000,
        sha256: '1'.repeat(64),
        durationSeconds: 10,
        width: 1920,
        height: 1080,
        codecs: ['h264'],
        formatName: 'mov,mp4'
      }))
    },
    realMedia: {
      selectedVia: 'CLIP',
      assignedVia: 'serial QA target helper from one selected File object',
      videoExercise,
      audioExercise: {
        fileName: REDLINE_AUDIO_NAME,
        relativePath: REDLINE_AUDIO_SOURCE_PATH,
        sha256: '2'.repeat(64),
        size: 1000,
        loadedVia: 'SONG -> LOCAL ONLY',
        volume: 0.72,
        observationDurationMs: 3000,
        contextStateBefore: 'running',
        contextStateAfter: 'running',
        contextTimeBefore: 1,
        contextTimeAfter: 4,
        mediaTimeBefore: 1,
        mediaTimeAfter: 4,
        rmsPeak: 0.1,
        amplitudePeak: 0.1,
        currentSrc: 'blob:redline',
        mediaPaused: false,
        mediaMuted: false,
        expectedBpm: 125,
        detectedBpm: 125
      },
      assignments: {},
      noNetwork: { requests: [], externalRequests: [] },
      pausedBeforeEffectMatrix: true,
      maxSimultaneousDecoded: 1,
      adjacentCrossFileDifferenceRatios: Array(12).fill(0.2)
    },
    evidence,
    consoleErrors: [],
    uncaughtErrors: [],
    networkRequests: [],
    gpuErrors: [],
    captureErrors: []
  };
}

export function buildEightVideoMatrixReport(): EightVideoProofReport {
  const slots = Array.from({ length: 8 }, (_, index) => ({
    moduleId: `module-${index}`,
    fileName: REDLINE_VIDEO_NAMES[index]!,
    elementIdentity: `element-${index}`,
    currentSrc: `blob:video-${index}`,
    readyState: 4,
    paused: false,
    currentTime: 1,
    videoWidth: 1920,
    videoHeight: 1080,
    duration: 10,
    totalVideoFrames: 30,
    droppedVideoFrames: 0,
    render: {
      source: `blob:video-${index}`,
      externalTextureImported: true,
      externalTextureBound: true,
      cachedTextureUploaded: false,
      cachedTextureBound: false,
      samplePath: 'external-texture' as const,
      frameId: 1,
      renderCount: 100,
      skippedRenderCount: 0,
      targetFps: WEB_PREVIEW_TARGET_FPS,
      frameIntervalMs: 42
    }
  }));
  const fixtures = Array.from({ length: 8 }, (_, index) => ({
    relativePath: REDLINE_VIDEO_SOURCE_PATHS[index]!,
    name: REDLINE_VIDEO_NAMES[index]!,
    size: 1000,
    sha256: String(index + 1).repeat(64),
    durationSeconds: 10,
    width: 1920,
    height: 1080,
    codecs: ['h264'],
    formatName: 'mp4'
  }));
  const samples = Array.from({ length: 31 }, (_, sampleIndex) => ({
    elapsedMs: sampleIndex * 1_000,
    decoderCount: 8,
    documentVideoCount: 8,
    timelineGeneration: 4,
    timelineFrameId: sampleIndex * 30 + 1,
    transportSeconds: sampleIndex + 1,
    maxDriftSeconds: 0.03,
    slots: slots.map((slot) => ({
      ...slot,
      currentTime: (slot.currentTime + sampleIndex) % slot.duration,
      totalVideoFrames: 30 + sampleIndex * 30,
      render: {
        ...slot.render,
        frameId: sampleIndex * 30 + 1,
        renderCount: slot.render.renderCount + sampleIndex * 24,
        skippedRenderCount: sampleIndex * 36
      }
    }))
  }));
  const provenance = createArtifactProvenance({
    captureId: '12345678-1234-4234-8234-123456789abc',
    capturedAt: new Date().toISOString(),
    source: { commit: 'c'.repeat(40), digest: 'a'.repeat(64), workingTreeDirty: false },
    build: { id: 'b'.repeat(64), digest: 'b'.repeat(64), profile: 'production' },
    server: {
      kind: 'vite-production-preview',
      origin: 'http://127.0.0.1:5194',
      buildDigest: 'b'.repeat(64),
      versionPath: '/_app/version.json',
      version: 'current-build',
      versionSha256: 'e'.repeat(64)
    },
    dependencyLock: { path: 'bun.lock', sha256: 'd'.repeat(64) },
    environment: {
      shellKind: 'browser',
      sourceBackend: 'html-video',
      frameProducer: 'HTMLVideoElement.copyExternalImageToTexture',
      releaseEvidence: true,
      webgpuAvailable: true,
      runtime: { name: 'Chrome', version: '128.0', userAgent: 'Chrome' },
      device: { operatingSystem: 'darwin', architecture: 'arm64', model: 'Apple M3', gpuIdentity: 'apple metal M3 native' }
    },
    capabilities: {
      webgpu: 'passed',
      mediaAdvance: 'passed',
      bpmMatch: 'passed',
      primarySamples: 'passed',
      contentIntegrity: 'passed'
    },
    contentIntegrity: {
      algorithm: 'sha256',
      requiredPrimarySampleCount: 8,
      assets: fixtures.map((fixture) => ({ name: fixture.name, sha256: fixture.sha256, size: fixture.size })),
      primarySamples: samples.at(-1)!.slots.map((slot, index) => ({
        assetName: slot.fileName,
        assetSha256: fixtures[index]!.sha256,
        observedSource: slot.currentSrc,
        rendererSource: slot.render.source!,
        sourceBackend: 'html-video',
        frameProducer: 'HTMLVideoElement.copyExternalImageToTexture',
        sourceFrameId: slot.render.frameId!,
        sourceTimestampSeconds: slot.currentTime,
        outputFrameSha256: String(index + 1).repeat(64),
        width: slot.videoWidth,
        height: slot.videoHeight
      }))
    }
  });
  return {
    schemaVersion: 2,
    provenance,
    warmupMs: EIGHT_VIDEO_WARMUP_MS,
    observationMs: EIGHT_VIDEO_OBSERVATION_MS,
    environment: {
      browserProduct: 'Chrome/128.0',
      userAgent: 'Chrome',
      headless: false,
      commandLine: ['chrome', '--enable-automation'],
      gpu: {
        vendor: 'apple',
        architecture: 'metal',
        device: 'M3',
        description: 'native',
        isFallbackAdapter: false,
        softwareRenderer: false,
        deviceCreated: true
      }
    },
    humanObservation: { observed: true, operator: 'QA Operator', lagObserved: false },
    fixtures,
    loadedVia: 'UI CLIPS multi-file',
    audio: {
      fileName: REDLINE_AUDIO_NAME,
      loadedVia: 'SONG -> ANALYZE',
      usingUploadedTrack: true,
      analysisStatus: 'ready',
      analysisConfidence: 0.9,
      bpm: 125,
      contextState: 'running',
      contextTimeDelta: 30,
      mediaTimeDelta: 30,
      mediaPaused: false,
      mediaMuted: false,
      volume: 0.72,
      rmsPeak: 0.1,
      amplitudePeak: 0.1
    },
    decoderCount: 8,
    samples,
    screenshots: slots.map((slot, index) => ({
      moduleId: slot.moduleId,
      firstPath: `first-${index}.png`,
      secondPath: `second-${index}.png`,
      firstSha256: 'a'.repeat(63) + index,
      secondSha256: String(index + 1).repeat(64),
      firstNonBlackPixelRatio: 0.7,
      secondNonBlackPixelRatio: 0.7,
      pixelMotionRatio: 0.2
    })),
    pgmCuts: slots.map((slot) => ({
      moduleId: slot.moduleId,
      decoderCount: 8,
      documentVideoCount: 8,
      selectedElementIdentity: slot.elementIdentity,
      pgmElementIdentity: slot.elementIdentity,
      selectedSourceId: `slot-${slot.moduleId}`,
      rendererSourceId: `slot-${slot.moduleId}`,
      selectedCurrentSrc: slot.currentSrc,
      rendererSource: slot.currentSrc,
      externalTextureImported: true,
      externalTextureBound: true,
      cachedTextureUploaded: false,
      cachedTextureBound: false,
      samplePath: 'external-texture' as const
    })),
    networkRequests: ['http://127.0.0.1:5194/'],
    hotSwap: {
      mutationPath: 'assignModuleToSlot',
      catalog: [{ moduleId: 'transition', row: 'top', shaderKey: 'transition', effectMode: 1 }],
      baseline: { decoderCount: 8, documentVideoCount: 8, timelineGeneration: 4, slots: [] },
      steps: []
    },
    legacyDriftReport: { maxDriftSeconds: 0.03, sampleCount: 31 },
    errors: { console: [], network: [], gpu: [], uncaught: [] }
  };
}
