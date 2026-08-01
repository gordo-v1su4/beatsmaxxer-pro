import { describe, expect, test } from 'vitest';
import { EIGHT_VIDEO_OBSERVATION_MS, EIGHT_VIDEO_WARMUP_MS, evaluateCatalogHotSwapStress, evaluateEightVideoProof, type EightVideoProofReport } from '$lib/qa/eightVideoProof';

function report(): EightVideoProofReport {
  const slots = Array.from({ length: 8 }, (_, index) => ({
    moduleId: `module-${index}`, fileName: `video-${index}.mp4`, elementIdentity: `element-${index}`,
    currentSrc: `blob:video-${index}`, readyState: 4, paused: false, currentTime: 1,
    videoWidth: 1920, videoHeight: 1080, duration: 10, totalVideoFrames: 30, droppedVideoFrames: 0,
    render: { source: `blob:video-${index}`, externalTextureImported: true, externalTextureBound: true,
      cachedTextureUploaded: false, cachedTextureBound: false, samplePath: 'external-texture', frameId: 1,
      renderCount: 100, skippedRenderCount: 0, targetFps: 24, frameIntervalMs: 42 }
  }));
  const baselineSlots = slots.map((slot, index) => ({
    canvasId: index < 4 ? `top-${index}` : `bottom-${index - 4}`,
    canvasIdentity: `canvas-${index}`,
    elementIdentity: slot.elementIdentity,
    currentSrc: slot.currentSrc,
    sourceId: index < 4 ? `top-${index}` : `bottom-${index - 4}`
  }));
  const catalog = [
    { moduleId: 'transition', row: 'top' as const, shaderKey: 'transition', effectMode: 1 },
    { moduleId: 'punch', row: 'bottom' as const, shaderKey: 'punch', effectMode: 5 }
  ];
  const swapSlots = (activeModuleId: string, effectMode: number, frame: number) => baselineSlots.map((base, index) => ({
    ...base,
    moduleId: index === 0 || index === 4 ? activeModuleId : index < 4 ? 'transition' : 'punch',
    currentTime: frame,
    totalVideoFrames: 100 + frame,
    driftSeconds: 0.02,
    renderCount: 200 + frame,
    bindingId: base.canvasId,
    renderedModuleId: index === 0 || index === 4 ? activeModuleId : index < 4 ? 'transition' : 'punch',
    renderedSourceId: base.sourceId,
    effectMode: index === 0 || index === 4 ? effectMode : index < 4 ? 1 : 5,
    rendererSource: base.currentSrc,
    samplePath: 'external-texture',
    cachedTextureBound: false
  }));
  const hotSwap: EightVideoProofReport['hotSwap'] = {
    mutationPath: 'assignModuleToSlot', catalog,
    baseline: { decoderCount: 8, documentVideoCount: 8, timelineGeneration: 4, slots: baselineSlots },
    steps: catalog.map((item, index) => {
      const row = item.row === 'top' ? 'top' as const : 'bottom' as const;
      const slotIndex = item.row === 'top' ? 0 : 0;
      const selectedCanvasId = item.row === 'top' ? 'top-0' : 'bottom-0';
      const selected = baselineSlots.find((slot) => slot.canvasId === selectedCanvasId)!;
      return { index, moduleId: item.moduleId, row, slotIndex, accepted: true, expectedEffectMode: item.effectMode,
        samples: Array.from({ length: 31 }, (_, frameIndex) => ({
          phase: frameIndex === 0 ? 'before' as const : 'settle' as const,
          elapsedMs: frameIndex * 40,
          decoderCount: 8,
          documentVideoCount: 8,
          timelineGeneration: 4,
          timelineFrameId: 10 + index * 40 + frameIndex,
          transportSeconds: 10 + index * 2 + frameIndex * 0.04,
          slots: swapSlots(item.moduleId, item.effectMode, frameIndex + 1)
        })),
        screenshot: { path: `${item.moduleId}.png`, sha256: item.moduleId.repeat(8), nonBlackPixelRatio: 0.5 },
        pgm: { selectedCanvasId, selectedElementIdentity: selected.elementIdentity, pgmElementIdentity: selected.elementIdentity,
          selectedCurrentSrc: selected.currentSrc, rendererSource: selected.currentSrc, rendererSourceId: selectedCanvasId,
          decoderCount: 8, documentVideoCount: 8 }
      };
    })
  };
  return {
    schemaVersion: 1, capturedAt: new Date().toISOString(), provenance: { sourceDigest: 'a'.repeat(64), buildDigest: 'b'.repeat(64) },
    warmupMs: EIGHT_VIDEO_WARMUP_MS, observationMs: EIGHT_VIDEO_OBSERVATION_MS,
    environment: { browserProduct: 'Chrome/128.0', userAgent: 'Chrome', headless: false, commandLine: ['chrome', '--enable-automation'],
      gpu: { vendor: 'apple', architecture: 'metal', device: 'M3', description: 'native', isFallbackAdapter: false,
        softwareRenderer: false, deviceCreated: true } },
    humanObservation: { observed: true, operator: 'QA Operator', lagObserved: false }, fixtures: [
      ...Array.from({ length: 8 }, (_, index) => ({ relativePath: `../.artifacts/real-media/videos/video-${index}.mp4`, name: `video-${index}.mp4`,
        size: 1000, sha256: String(index + 1).repeat(64), durationSeconds: 10, width: 1920, height: 1080, codecs: ['h264'], formatName: 'mp4' })),
      { relativePath: '../.artifacts/real-media/audio/Redline (Remastered).mp3', name: 'Redline (Remastered).mp3', size: 1000,
        sha256: 'f'.repeat(64), durationSeconds: 200, width: null, height: null, codecs: ['mp3'], formatName: 'mp3' }
    ],
    loadedVia: 'UI CLIPS multi-file',
    audio: { fileName: 'Redline (Remastered).mp3', loadedVia: 'SONG -> ANALYZE', usingUploadedTrack: true,
      analysisStatus: 'ready', analysisConfidence: 0.9, bpm: 133,
      contextState: 'running', contextTimeDelta: 30, mediaTimeDelta: 30, mediaPaused: false, mediaMuted: false,
      volume: 0.72, rmsPeak: 0.1, amplitudePeak: 0.1 },
    decoderCount: 8,
    samples: Array.from({ length: 31 }, (_, sampleIndex) => ({ elapsedMs: sampleIndex * 1_000, decoderCount: 8, documentVideoCount: 8,
      timelineGeneration: 4, timelineFrameId: sampleIndex * 30 + 1, transportSeconds: sampleIndex + 1, maxDriftSeconds: 0.03,
      slots: slots.map((slot) => ({ ...slot, currentTime: (slot.currentTime + sampleIndex) % slot.duration,
        totalVideoFrames: 30 + sampleIndex * 30, render: { ...slot.render, frameId: sampleIndex * 30 + 1,
          renderCount: slot.render.renderCount + sampleIndex * 24, skippedRenderCount: sampleIndex * 36 } })) })),
    screenshots: slots.map((slot, index) => ({ moduleId: slot.moduleId, firstPath: `first-${index}.png`, secondPath: `second-${index}.png`,
      firstSha256: `first-${index}`, secondSha256: `second-${index}`, firstNonBlackPixelRatio: 0.7,
      secondNonBlackPixelRatio: 0.7, pixelMotionRatio: 0.2 })),
    pgmCuts: slots.map((slot) => ({ moduleId: slot.moduleId, decoderCount: 8, documentVideoCount: 8, selectedElementIdentity: slot.elementIdentity,
      pgmElementIdentity: slot.elementIdentity, selectedSourceId: `slot-${slot.moduleId}`, rendererSourceId: `slot-${slot.moduleId}`,
      selectedCurrentSrc: slot.currentSrc, rendererSource: slot.currentSrc,
      externalTextureImported: true, externalTextureBound: true, cachedTextureUploaded: false,
      cachedTextureBound: false, samplePath: 'external-texture' })),
    networkRequests: ['http://127.0.0.1:5174/', 'http://127.0.0.1:5174/__api/analyze/rhythm'],
    hotSwap,
    errors: { console: [], network: [], gpu: [], uncaught: [] }
  };
}

describe('eight-video research benchmark gate', () => {
  test('accepts simultaneous native eight-decoder evidence', () => {
    expect(evaluateEightVideoProof(report())).toEqual({ passed: true, blockers: [] });
  });

  test('rejects serial, duplicate, short, and synthetic evidence', () => {
    const value = report();
    value.observationMs = 29_999;
    value.decoderCount = 1;
    value.samples[0]!.slots[1]!.elementIdentity = value.samples[0]!.slots[0]!.elementIdentity;
    value.samples[0]!.slots[1]!.currentSrc = value.samples[0]!.slots[0]!.currentSrc;
    const blockers = evaluateEightVideoProof(value).blockers;
    expect(blockers).toContain('observation was shorter than 30 seconds');
    expect(blockers).toContain('exactly eight video decoders must be active');
    expect(blockers).toContain('HTMLVideoElement identities are not unique');
    expect(blockers).toContain('currentSrc identities are not unique');
  });

  test('rejects a ninth PGM decoder and frozen or muted playback', () => {
    const value = report();
    value.pgmCuts[0]!.pgmElementIdentity = 'ninth-element';
    value.screenshots[0]!.pixelMotionRatio = 0;
    value.audio.mediaMuted = true;
    const blockers = evaluateEightVideoProof(value).blockers;
    expect(blockers).toContain('PGM used a ninth or mismatched decoder: module-0');
    expect(blockers).toContain('slot rendered a frozen image: module-0');
    expect(blockers).toContain('audible audio diagnostics failed');
  });

  test('rejects a PGM source ID that differs from the selected stable slot', () => {
    const value = report();
    value.pgmCuts[0]!.rendererSourceId = 'ninth-source';
    expect(evaluateEightVideoProof(value).blockers).toContain('PGM used a ninth or mismatched decoder: module-0');
  });

  test('rejects missing Essentia evidence or a fallback BPM', () => {
    const value = report();
    value.audio.analysisStatus = 'local';
    value.audio.bpm = 0;
    value.networkRequests = ['http://127.0.0.1:5174/'];
    const blockers = evaluateEightVideoProof(value).blockers;
    expect(blockers).toContain('Redline did not complete the consented Essentia rhythm path with a usable BPM');
    expect(blockers).toContain('expected exactly one same-origin Essentia rhythm analysis request');
  });

  test('accepts a persistent real-video cache during a timesampler seek gap', () => {
    const value = report();
    const sample = value.samples[5]!.slots[3]!;
    sample.readyState = 1;
    sample.render.externalTextureImported = false;
    sample.render.externalTextureBound = false;
    sample.render.cachedTextureBound = true;
    sample.render.samplePath = 'cached-video-texture';
    value.networkRequests.push('http://127.0.0.1:5174/src/lib/audio/prepareAnalysisUpload.ts');
    expect(evaluateEightVideoProof(value)).toEqual({ passed: true, blockers: [] });
  });
});

describe('all-catalog hot-swap stress gate', () => {
  test('rejects evidence that does not cover every discovered catalog module', () => {
    expect(evaluateCatalogHotSwapStress(undefined).passed).toBe(false);
  });

  test('rejects a swap observation shorter than one second of rAF samples', () => {
    const value = report().hotSwap;
    value.steps[0]!.samples = value.steps[0]!.samples.slice(0, 10);
    expect(evaluateCatalogHotSwapStress(value).blockers).toContain(
      'rAF evidence does not span before mutation through settle: transition'
    );
  });

  test('rejects decoder growth during a swap', () => {
    const value = report().hotSwap;
    const sample = value.steps[0]!.samples[1]!;
    sample.decoderCount = 9;
    const blockers = evaluateCatalogHotSwapStress(value).blockers;
    expect(blockers).toContain('decoder/video count changed during swap: transition');
  });

  test('rejects a stable canvas remount during a swap', () => {
    const value = report().hotSwap;
    value.steps[0]!.samples[1]!.slots[0]!.canvasIdentity = 'replacement-canvas';
    const blockers = evaluateCatalogHotSwapStress(value).blockers;
    expect(blockers).toContain('slot media or canvas identity changed during swap: transition:top-0');
  });

  test('rejects a stable video source rebind during a swap', () => {
    const value = report().hotSwap;
    value.steps[0]!.samples[1]!.slots[1]!.currentSrc = 'blob:replacement-video';
    const blockers = evaluateCatalogHotSwapStress(value).blockers;
    expect(blockers).toContain('slot media or canvas identity changed during swap: transition:top-1');
  });

  test('rejects a renderer effect binding that differs from the rack assignment', () => {
    const value = report().hotSwap;
    const slot = value.steps[1]!.samples[1]!.slots[4]!;
    slot.renderedModuleId = 'wrong-effect';
    const blockers = evaluateCatalogHotSwapStress(value).blockers;
    expect(blockers).toContain('renderer binding/effect/source mismatch: punch:bottom-0');
  });

  test('rejects the wrong WGSL effect mode after a swap', () => {
    const value = report().hotSwap;
    value.steps[1]!.samples[1]!.slots[4]!.effectMode = 99;
    const blockers = evaluateCatalogHotSwapStress(value).blockers;
    expect(blockers).toContain('rendered shader effect mode mismatch: punch:bottom-0');
  });

  test('rejects a synthetic test card during a swap', () => {
    const value = report().hotSwap;
    value.steps[1]!.samples[1]!.slots[4]!.samplePath = 'test-card';
    const blockers = evaluateCatalogHotSwapStress(value).blockers;
    expect(blockers).toContain('synthetic or missing video sample appeared during swap: punch:bottom-0');
  });

  test('rejects persistent cache use outside timesampler', () => {
    const value = report().hotSwap;
    value.steps[1]!.samples[1]!.slots[4]!.cachedTextureBound = true;
    const blockers = evaluateCatalogHotSwapStress(value).blockers;
    expect(blockers).toContain('persistent video cache was used outside timesampler: punch:bottom-0');
  });

  test('rejects a timeline generation discontinuity', () => {
    const value = report().hotSwap;
    value.steps[0]!.samples[1]!.timelineGeneration = 5;
    const blockers = evaluateCatalogHotSwapStress(value).blockers;
    expect(blockers).toContain('timeline generation changed during catalog hot swaps');
  });

  test('rejects slot drift above 400ms', () => {
    const value = report().hotSwap;
    value.steps[0]!.samples[1]!.slots[0]!.driftSeconds = 0.401;
    const blockers = evaluateCatalogHotSwapStress(value).blockers;
    expect(blockers).toContain('shared timeline drift exceeded 400ms during swap: transition:top-0');
  });

  test('rejects a stalled decoded slot through a swap', () => {
    const value = report().hotSwap;
    value.steps[0]!.samples.at(-1)!.slots[1]!.totalVideoFrames = value.steps[0]!.samples[0]!.slots[1]!.totalVideoFrames;
    const blockers = evaluateCatalogHotSwapStress(value).blockers;
    expect(blockers).toContain('video decode/render frames did not advance through swap: transition');
  });

  test('rejects a PGM decoder that is not the selected rack slot decoder', () => {
    const value = report().hotSwap;
    value.steps[0]!.pgm.pgmElementIdentity = 'ninth-video';
    const blockers = evaluateCatalogHotSwapStress(value).blockers;
    expect(blockers).toContain('PGM did not reuse the selected slot decoder after swap: transition');
  });

  test('rejects a PGM source ID that is not the selected stable slot', () => {
    const value = report().hotSwap;
    value.steps[0]!.pgm.rendererSourceId = 'top-1';
    expect(evaluateCatalogHotSwapStress(value).blockers).toContain(
      'PGM did not reuse the selected slot decoder after swap: transition'
    );
  });
});
