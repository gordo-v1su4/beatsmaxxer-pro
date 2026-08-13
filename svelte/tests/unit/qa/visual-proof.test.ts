import { describe, expect, test } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  FIXED_VISUAL_PROOF_FIXTURE,
  FIXED_VISUAL_PROOF_TIMELINE_POSITIONS,
  FIXED_VISUAL_PROOF_VIEWPORT,
  REAL_MEDIA_VIDEO_NAMES,
  buildVisualProofManifest,
  evaluateVisualProofReport,
  retainSerialVisualProofSelection,
  reduceSerialVisualProofSelection,
  realVideoMediaAdvanceSeconds,
  validateVisualProofRealVideoExercise,
  type VisualProofReport
} from '$lib/qa/visualProof';
import { verifyVisualProof } from '../../../scripts/verify-visual-proof-runner';
import { realMediaFileMetadata } from '../../../scripts/visual-proof-verification';
import { MODULE_PRESETS } from '$lib/modules/presets';
import { catalogIds } from '$lib/modules/catalog';

/** Derived, not hardcoded. These totals were literals, so adding presets to a
 *  single module failed two unrelated release-gate tests with a bare number
 *  mismatch that says nothing about what actually broke. Counting the catalog
 *  still catches a manifest that drops or dedupes entries, which is what the
 *  gate is for -- the manifest is built by different code than these. */
const CATALOG_MODULE_COUNT = catalogIds().length;
const CATALOG_PRESET_COUNT = Object.values(MODULE_PRESETS).reduce(
  (total, list) => total + list.length,
  0
);

function completeReport(): VisualProofReport {
  const manifest = buildVisualProofManifest([
    { id: 'button:play', label: 'Play', kind: 'button', state: 'base' },
    { id: 'privacy:analyze', label: 'ANALYZE', kind: 'button', state: 'audio-consent' },
    { id: 'privacy:local', label: 'LOCAL ONLY', kind: 'button', state: 'audio-consent' },
    { id: 'privacy:cancel', label: 'CANCEL', kind: 'button', state: 'audio-consent' }
  ]);
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
      fixtureClipName: REAL_MEDIA_VIDEO_NAMES[0], currentSrc: 'blob:real-video',
      videoWidth: 1920, videoHeight: 1080, durationSeconds: 10, rendererHasVideo: true,
      bindingId: 'pgm', externalTextureImported: true, externalTextureBound: true, samplePath: 'external-texture',
      rendererSource: 'blob:real-video', rendererDimensions: '1920x1080', rendererFrameId: 42
    },
    ...(item.kind === 'control' ? {} : { configuration: {
      moduleId: item.subjectId.split(':')[0], fixtureClipName: REAL_MEDIA_VIDEO_NAMES[0],
      beforeBypassed: true, afterBypassed: false,
      beforeParams: { mix: 50 }, afterParams: { mix: 75 },
      intendedParameterDelta: { mix: { before: 50, after: 75 } }, clipSha256: '1'.repeat(64), currentSrc: 'blob:real-video'
    } })
  }));

  return {
    schemaVersion: 1,
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
      browserCommandLine: ['chrome', '--enable-automation', '--remote-debugging-port=9970'],
      gpu: {
        api: 'WebGPU', provenanceSource: 'navigator.gpu.requestAdapter', adapterInfoAvailable: true,
        vendor: 'apple', architecture: 'common-3', device: 'Apple M3 Pro', description: 'Metal',
        isFallbackAdapter: false, deviceCreated: true, deviceLabel: '', deviceFeatures: ['bgra8unorm-storage'],
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
      sourceDigest: 'a'.repeat(64), buildDigest: 'd'.repeat(64), catalogDigest: 'b'.repeat(64), controlInventoryDigest: 'c'.repeat(64),
      captureNonce: '12345678-1234-1234-1234-123456789abc', capturedAt: '2026-08-01T12:00:00.000Z',
      fixtureFiles: [
        ...REAL_MEDIA_VIDEO_NAMES.map((name) => ({ relativePath: `../.artifacts/real-media/videos/${name}`, name, kind: 'video' as const,
          size: 1000, sha256: '1'.repeat(64), durationSeconds: 10, width: 1920, height: 1080, codecs: ['h264'], formatName: 'mov,mp4' })),
        { relativePath: '../.artifacts/real-media/audio/Redline (Remastered).mp3', name: 'Redline (Remastered).mp3', kind: 'audio' as const,
          size: 1000, sha256: '2'.repeat(64), durationSeconds: 200, width: null, height: null, codecs: ['mjpeg', 'mp3'], formatName: 'mp3' }
      ]
    },
    realMedia: {
      selectedVia: 'CLIP', assignedVia: 'serial QA target helper from one selected File object',
      videoExercise: REAL_MEDIA_VIDEO_NAMES.map((fileName, index) => ({
        fileName, relativePath: `../.artifacts/real-media/videos/${fileName}`, sha256: '1'.repeat(64), size: 1000,
        selectedFileSha256: '1'.repeat(64), selectedFileSize: 1000,
        currentSrc: `blob:video-${index}`, pgmModule: 'transition', bindingId: 'pgm', videoWidth: 1920, videoHeight: 1080, durationSeconds: 10,
        readyState: 4, hasVideo: true, externalTextureImported: true, externalTextureBound: true,
        samplePath: 'external-texture', rendererSource: `blob:video-${index}`, rendererDimensions: '1920x1080', rendererFrameId: index + 1,
        videoSize: '1920x1080',
        firstTimelineSeconds: 1, secondTimelineSeconds: 2, firstMediaTimeSeconds: 1, secondMediaTimeSeconds: 2,
        firstCentralFrameId: index * 2 + 1, secondCentralFrameId: index * 2 + 2,
        firstScreenshot: `.artifacts/visual-proof/real-${index}-a.png`, secondScreenshot: `.artifacts/visual-proof/real-${index}-b.png`,
        firstContentHash: `a${index}`, secondContentHash: `b${index}`, nonBlackPixelRatio: 0.75, pixelMotionRatio: 0.2,
        sampleCount: 65, p95IntervalMs: 17, maxIntervalMs: 17, droppedFrames: 0, stalledFrames: 0, released: true, previousSourceUnbound: true,
        frameIntervalsMs: Array(65).fill(17)
      })),
      audioExercise: { fileName: 'Redline (Remastered).mp3', relativePath: '../.artifacts/real-media/audio/Redline (Remastered).mp3',
        sha256: '2'.repeat(64), size: 1000, loadedVia: 'SONG -> LOCAL ONLY', volume: 0.72, observationDurationMs: 3000,
        contextStateBefore: 'running', contextStateAfter: 'running', contextTimeBefore: 1, contextTimeAfter: 4,
        mediaTimeBefore: 1, mediaTimeAfter: 4, rmsPeak: 0.1, amplitudePeak: 0.1, currentSrc: 'blob:redline', mediaPaused: false, mediaMuted: false },
      assignments: Object.fromEntries(manifest.items.filter((item) => item.kind === 'module')
        .map((item) => [item.subjectId, { fileName: REAL_MEDIA_VIDEO_NAMES[0], sha256: '1'.repeat(64) }])),
      noNetwork: { requests: [], externalRequests: [] }, pausedBeforeEffectMatrix: true, maxSimultaneousDecoded: 1,
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

describe('visual proof release gate', () => {
  test('capture-phase retention survives the normal UI handler clearing its file input', () => {
    const selected = { name: REAL_MEDIA_VIDEO_NAMES[0], size: 123 };
    const input = { files: [selected] as Array<typeof selected>, value: '/fake/path/video.mp4' };
    const retained = retainSerialVisualProofSelection(input.files);
    input.value = '';
    input.files = [];
    expect(retained).toEqual([selected]);
    expect(input.files).toEqual([]);
    expect(() => retainSerialVisualProofSelection([selected, selected])).toThrow('exactly one selected real MP4');
  });

  test('ignores empty follow-up changes without erasing a valid captured selection', () => {
    const selected = { name: REAL_MEDIA_VIDEO_NAMES[0], size: 123 };
    const initial = { generation: 0, files: [] as Array<typeof selected>, error: '' };
    const captured = reduceSerialVisualProofSelection(initial, [selected]);
    const afterUiClear = reduceSerialVisualProofSelection(captured, []);
    const afterSyntheticEmptyChange = reduceSerialVisualProofSelection(afterUiClear, []);
    expect(afterSyntheticEmptyChange).toEqual({ generation: 1, files: [selected], error: '' });
  });

  test('a missing selection does not advance generation and therefore remains timeout-eligible', () => {
    const initial = { generation: 7, files: [] as Array<{ name: string }>, error: '' };
    expect(reduceSerialVisualProofSelection(initial, [])).toBe(initial);
    expect(reduceSerialVisualProofSelection(initial, []).generation).toBe(7);
  });

  test('accepts complete physical-browser proof for every manifest item', () => {
    const result = evaluateVisualProofReport(completeReport());

    expect(result).toEqual({ passed: true, blockers: [] });
  });

  test('accepts headed CDP provenance from an automated Chrome using a native hardware adapter', () => {
    const report = completeReport();
    const blockers = evaluateVisualProofReport(report).blockers;

    expect(report.environment.browserCommandLine).toContain('--enable-automation');
    expect(blockers).not.toContain('browser identity must come from a headed CDP browser session');
    expect(blockers).not.toContain('WebGPU adapter/device provenance is missing or unknown');
    expect(blockers).not.toContain(
      'physical proof requires a native hardware WebGPU adapter, not software or fallback rendering'
    );
  });

  test('blocks headless evidence even when screenshots exist', () => {
    const report = completeReport();
    report.environment.headless = true;

    expect(evaluateVisualProofReport(report).blockers).toContain(
      'explicit, separately identified human observation attestation is required'
    );
  });

  test.each([
    ['SwiftShader adapter', { description: 'Google SwiftShader' }],
    ['llvmpipe adapter', { description: 'llvmpipe (LLVM 18.1.8)' }],
    ['fallback adapter', { isFallbackAdapter: true }],
    ['software launch flag', null]
  ])('blocks %s instead of accepting it as physical GPU proof', (_label, gpuPatch) => {
    const report = completeReport();
    if (gpuPatch) Object.assign(report.environment.gpu, gpuPatch);
    else report.environment.browserCommandLine.push('--use-angle=swiftshader');

    expect(evaluateVisualProofReport(report).blockers).toContain(
      'physical proof requires a native hardware WebGPU adapter, not software or fallback rendering'
    );
  });

  test('blocks unavailable or unknown adapter/device provenance', () => {
    const report = completeReport();
    Object.assign(report.environment.gpu, {
      adapterInfoAvailable: false, vendor: '', architecture: '', device: '', description: '',
      isFallbackAdapter: null, deviceCreated: false
    });

    const blockers = evaluateVisualProofReport(report).blockers;
    expect(blockers).toContain('WebGPU adapter/device provenance is missing or unknown');
    expect(blockers).toContain(
      'physical proof requires a native hardware WebGPU adapter, not software or fallback rendering'
    );
  });

  test('blocks evidence that was not observed in a physical browser', () => {
    const report = completeReport();
    report.humanObservationAttestation.observed = false;

    expect(evaluateVisualProofReport(report).blockers).toContain(
      'explicit, separately identified human observation attestation is required'
    );
  });

  test('blocks observer-visible lag and bad measured frame cadence', () => {
    const report = completeReport();
    report.humanObservationAttestation.lagObserved = true;
    report.realMedia.videoExercise[0]!.p95IntervalMs = 80;
    report.realMedia.videoExercise[0]!.stalledFrames = 2;
    expect(evaluateVisualProofReport(report).blockers).toContain(
      'explicit, separately identified human observation attestation is required'
    );
    expect(evaluateVisualProofReport(report).blockers).toContain(
      `real MP4 was not visibly decoded and moving: ${REAL_MEDIA_VIDEO_NAMES[0]}`
    );
  });

  test('blocks concurrent decoder fan-out or an unreleased serial clip', () => {
    const report = completeReport();
    report.realMedia.maxSimultaneousDecoded = 2;
    report.realMedia.videoExercise[0]!.released = false;
    const blockers = evaluateVisualProofReport(report).blockers;
    expect(blockers).toContain('real-media proof decoded more than one video at a time');
    expect(blockers).toContain(`real MP4 was not visibly decoded and moving: ${REAL_MEDIA_VIDEO_NAMES[0]}`);
  });

  test('rejects copied/test-card video instead of the WebGPU external-texture path', () => {
    const report = completeReport();
    report.realMedia.videoExercise[0]!.externalTextureImported = false;
    report.realMedia.videoExercise[0]!.samplePath = 'test-card';
    report.evidence[0]!.timeline.externalTextureBound = false;
    const blockers = evaluateVisualProofReport(report).blockers;
    expect(blockers).toContain(`real MP4 was not visibly decoded and moving: ${REAL_MEDIA_VIDEO_NAMES[0]}`);
    expect(blockers).toContain(`fixed fixture media is not synchronized within tolerance: ${report.evidence[0]!.itemId}`);
  });

  test('rejects thirteen claimed files that reuse one PGM source and screenshot', () => {
    const report = completeReport();
    for (const clip of report.realMedia.videoExercise) {
      clip.currentSrc = 'blob:reused-source';
      clip.rendererSource = 'blob:reused-source';
      clip.firstContentHash = 'same-frame';
    }
    report.realMedia.adjacentCrossFileDifferenceRatios.fill(0);
    expect(evaluateVisualProofReport(report).blockers).toContain(
      'real-video sequence reused the same PGM source or screenshot content'
    );
  });

  test('accepts live media advancement across a valid looping boundary', () => {
    const clip = completeReport().realMedia.videoExercise[0]!;
    clip.durationSeconds = 15.092993;
    clip.firstMediaTimeSeconds = 15.02261;
    clip.secondMediaTimeSeconds = 1.117828;
    expect(realVideoMediaAdvanceSeconds(clip)).toBeCloseTo(1.188211, 5);
    expect(validateVisualProofRealVideoExercise(clip)).toEqual([]);
  });

  test('a failed real clip prevents the matrix branch from starting', () => {
    const clips = completeReport().realMedia.videoExercise;
    clips[5]!.pixelMotionRatio = 0;
    let matrixStarted = false;
    expect(() => {
      for (const clip of clips) {
        const blockers = validateVisualProofRealVideoExercise(clip);
        if (blockers.length) throw new Error(blockers.join('; '));
      }
      matrixStarted = true;
    }).toThrow(REAL_MEDIA_VIDEO_NAMES[5]);
    expect(matrixStarted).toBe(false);
  });

  test('matrix retained-File attach awaits decoded PGM readiness instead of commit alone', async () => {
    const source = await readFile('src/lib/qa/bspQa.ts', 'utf8');
    const attach = source.slice(source.indexOf('async attachVisualProofRealClipToModule'), source.indexOf('async releaseVisualProofRealClip'));
    expect(attach).toContain('while (performance.now() < deadline)');
    expect(attach).toContain('HTMLMediaElement.HAVE_CURRENT_DATA');
    expect(attach).toContain("pgm?.bindingId === 'pgm'");
    expect(attach).toContain("pgm.samplePath === 'external-texture'");
  });

  test('deterministic shots await a post-seek decoded frame and exact subsequent PGM render', async () => {
    const source = await readFile('src/lib/qa/bspQa.ts', 'utf8');
    const timeline = source.slice(source.indexOf('async setVisualProofTimelinePosition'), source.indexOf('/** Cycle PGM'));
    expect(timeline.indexOf('videoPool.seekModule')).toBeLessThan(timeline.lastIndexOf('audioTimeline.publishFrame'));
    expect(timeline).toContain('video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA');
    expect(timeline).toContain("render.source === video.currentSrc");
    expect(timeline).toContain("render.samplePath === 'external-texture'");
  });

  test('capture removes stale proof output before writing a new run', async () => {
    const source = await readFile('scripts/capture-visual-proof-runner.ts', 'utf8');
    expect(source).toContain("await rm(OUTPUT_DIR, { recursive: true, force: true })");
    expect(source.indexOf('await rm(OUTPUT_DIR')).toBeLessThan(source.indexOf('await withChrome'));
  });

  test('PLAY proof awaits actual playback before sampling and restores paused transport after evidence', async () => {
    const source = await readFile('scripts/capture-visual-proof-runner.ts', 'utf8');
    const controlProof = source.slice(source.indexOf('const isPlayControl'), source.indexOf("if (control.fixtureKind === 'video' || control.fixtureKind === 'clips') {", source.indexOf('evidence.push({')));
    const click = controlProof.indexOf('exerciseControl(session, control)');
    const playback = controlProof.indexOf('waitForPlaying?.(10000)');
    const afterState = controlProof.indexOf('afterState = await elementState');
    const evidence = controlProof.indexOf('evidence.push({');
    const restore = controlProof.indexOf('stopTransport?.()');

    expect(controlProof).toContain("control.label.replace(/\\s+/g, ' ').trim().toUpperCase() === 'PLAY'");
    expect(click).toBeLessThan(playback);
    expect(playback).toBeLessThan(afterState);
    expect(afterState).toBeLessThan(evidence);
    expect(evidence).toBeLessThan(restore);
  });

  test('SONG proof observes a new real local-only upload generation before sampling state', async () => {
    const [engine, qa, runner] = await Promise.all([
      readFile('src/lib/audio/AudioEngine.ts', 'utf8'),
      readFile('src/lib/qa/bspQa.ts', 'utf8'),
      readFile('scripts/capture-visual-proof-runner.ts', 'utf8')
    ]);
    const fileLoad = engine.slice(engine.indexOf('async loadAudioFile'), engine.indexOf('async loadAudioUrl'));
    const afterState = runner.indexOf('afterState = await elementState', runner.indexOf('const isPlayControl'));
    const controlProof = runner.slice(runner.indexOf('const isPlayControl'), runner.indexOf('const afterShot', afterState));

    expect(fileLoad.indexOf('prepareUploadedTrack')).toBeLessThan(fileLoad.indexOf('uploadedTrackLoadGeneration += 1'));
    expect(qa).toContain('if (snap.uploadedTrackLoadGeneration > afterGeneration) return snap');
    expect(controlProof).toContain("control.fixtureKind === 'audio'");
    expect(controlProof.indexOf('exerciseControl(session, control)')).toBeLessThan(controlProof.indexOf('waitForUploadedTrackLoad'));
    expect(controlProof.indexOf('waitForUploadedTrackLoad')).toBeLessThan(controlProof.indexOf('afterState = await elementState'));
  });

  test('rejects reports that accumulated cascading capture failures', () => {
    const report = completeReport();
    report.captureErrors = ['module:transition: decode failed', 'shader:transition: missing frame'];
    expect(evaluateVisualProofReport(report).blockers).toContain(
      'cascading visual-proof errors are invalid; capture must fail fast'
    );
  });

  test('blocks a missing module, preset, shader, or control evidence item', () => {
    const report = completeReport();
    const missing = report.evidence.find((item) => item.itemId.startsWith('preset:'))!;
    report.evidence = report.evidence.filter((item) => item !== missing);

    expect(evaluateVisualProofReport(report).blockers).toContain(
      `missing visual proof: ${missing.itemId}`
    );
  });

  test('blocks evidence without distinct before and after screenshots', () => {
    const report = completeReport();
    report.evidence[0].after = report.evidence[0].before;

    expect(evaluateVisualProofReport(report).blockers).toContain(
      `before/after screenshots must be distinct: ${report.evidence[0].itemId}`
    );
  });

  test('blocks screenshots whose sampled pixel content is unchanged', () => {
    const report = completeReport();
    report.evidence[0].afterContentHash = report.evidence[0].beforeContentHash;
    report.evidence[0].screenshotContentChanged = false;

    expect(evaluateVisualProofReport(report).blockers).toContain(
      `before/after screenshot content is unchanged: ${report.evidence[0].itemId}`
    );
  });

  test('blocks missing same-frame and deterministic renderer diagnostics', () => {
    const report = completeReport();
    report.evidence[0].timeline.subscriberFrameIds = [41, 42];
    report.evidence[0].timeline.uniformHash = 'not-hex';

    const blockers = evaluateVisualProofReport(report).blockers;
    expect(blockers).toContain(`subscribers did not observe the central timeline frame: ${report.evidence[0].itemId}`);
    expect(blockers).toContain(`fixed-step/uniform/generation/seed diagnostics missing: ${report.evidence[0].itemId}`);
  });

  test('blocks fixture media outside the declared timeline tolerance', () => {
    const report = completeReport();
    report.evidence[0].timeline.actualMediaTimeSeconds = 0.8;

    expect(evaluateVisualProofReport(report).blockers).toContain(
      `fixed fixture media is not synchronized within tolerance: ${report.evidence[0].itemId}`
    );
  });

  test('blocks black frames and unchanged advertised controls', () => {
    const report = completeReport();
    const control = report.evidence.find((item) => item.itemId.startsWith('control:'))!;
    control.blackFrame = true;
    control.changed = false;

    const blockers = evaluateVisualProofReport(report).blockers;
    expect(blockers).toContain(`black frame detected: ${control.itemId}`);
    expect(blockers).toContain(`no intended before/after change observed: ${control.itemId}`);
  });

  test('blocks console and uncaught browser errors', () => {
    const report = completeReport();
    report.consoleErrors.push('WebGPU validation error');
    report.uncaughtErrors.push('Unhandled rejection');

    const blockers = evaluateVisualProofReport(report).blockers;
    expect(blockers).toContain('browser console errors: WebGPU validation error');
    expect(blockers).toContain('uncaught browser errors: Unhandled rejection');
  });

  test('blocks an incomplete advertised-control inventory', () => {
    const report = completeReport();
    report.manifest.controlInventory.discoveredCount = 2;

    expect(evaluateVisualProofReport(report).blockers).toContain(
      'manifest must include every enabled advertised UI control'
    );
  });

  test('blocks non-deterministic fixture, viewport, or timeline configuration', () => {
    const report = completeReport();
    report.environment.fixture = { ...FIXED_VISUAL_PROOF_FIXTURE, audio: 'other.wav' };
    report.environment.viewport = { width: 800, height: 600, deviceScaleFactor: 1 };
    report.environment.timelineSource = 'requestAnimationFrame';
    report.environment.timelinePositionsSeconds = [0];

    const blockers = evaluateVisualProofReport(report).blockers;
    expect(blockers).toContain('fixed QA fixture does not match the release manifest');
    expect(blockers).toContain('fixed viewport does not match the release manifest');
    expect(blockers).toContain('timeline must be sourced from AudioContext.currentTime');
    expect(blockers).toContain('fixed timeline positions do not match the release manifest');
  });

  test('manifest includes every catalog module, preset, and registered shader effect', () => {
    const manifest = buildVisualProofManifest([]);
    const modules = manifest.items.filter((item) => item.kind === 'module');
    const presets = manifest.items.filter((item) => item.kind === 'preset');
    const shaders = manifest.items.filter((item) => item.kind === 'shader');

    expect(modules).toHaveLength(CATALOG_MODULE_COUNT);
    expect(presets).toHaveLength(CATALOG_PRESET_COUNT);
    expect(shaders).toHaveLength(CATALOG_MODULE_COUNT);
    expect(shaders.map((item) => item.subjectId).sort()).toEqual(
      modules.map((item) => item.subjectId).sort()
    );
  });

  test('blocks capture diagnostics instead of treating unsupported items as proof', () => {
    const report = completeReport();
    report.captureErrors.push('control:file-upload: fixture assignment unavailable');

    expect(evaluateVisualProofReport(report).blockers).toContain(
      'visual proof capture errors: control:file-upload: fixture assignment unavailable'
    );
  });

  test('rejects synthetic/stale clip bindings and missing real-media motion', () => {
    const report = completeReport();
    report.realMedia.videoExercise[0]!.fileName = 'clip1.webm';
    report.realMedia.videoExercise[1]!.pixelMotionRatio = 0.001;
    const blockers = evaluateVisualProofReport(report).blockers;
    expect(blockers).toContain('real-media phase must exercise every staged MP4 in manifest order');
  });

  test('rejects silent, muted, or network-uploaded Redline evidence', () => {
    const report = completeReport();
    report.realMedia.audioExercise.mediaMuted = true;
    report.realMedia.audioExercise.rmsPeak = 0;
    report.realMedia.noNetwork.requests.push('http://127.0.0.1:5174/__api/analyze/rhythm');
    const blockers = evaluateVisualProofReport(report).blockers;
    expect(blockers).toContain('real Redline audio was not audibly played through SONG -> LOCAL ONLY');
    expect(blockers).toContain('network analysis/upload traffic occurred during the real-media phase');
  });

  test('classifies Redline as audio despite its embedded cover-art video stream', async () => {
    const audioPath = `${FIXED_VISUAL_PROOF_FIXTURE.root}/${FIXED_VISUAL_PROOF_FIXTURE.audio}`;
    const { access } = await import('node:fs/promises');
    try {
      await access(audioPath);
    } catch {
      return;
    }
    const [metadata] = await realMediaFileMetadata([audioPath]);
    expect(metadata?.kind).toBe('audio');
    expect(metadata?.width).toBeNull();
    expect(metadata?.height).toBeNull();
    expect(metadata?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test('rejects a whole-catalog report backed by one-byte artifacts', async () => {
    const report = completeReport();
    report.manifest.items = report.manifest.items.filter((item) => item.kind !== 'control' || item.subjectId === 'button:play');
    report.manifest.controlInventory.discoveredCount = 1;
    report.manifest.controlInventory.includedCount = 1;
    report.evidence = report.evidence.filter((item) => report.manifest.items.some((manifestItem) => manifestItem.id === item.itemId));
    // one module + one shader entry each, every preset, and the single
    // surviving control the filter above leaves in place.
    expect(report.manifest.items).toHaveLength(CATALOG_MODULE_COUNT * 2 + CATALOG_PRESET_COUNT + 1);
    await mkdir('.artifacts/visual-proof', { recursive: true });
    await Promise.all([
      writeFile('.artifacts/visual-proof/one-byte-before.png', Uint8Array.of(0)),
      writeFile('.artifacts/visual-proof/one-byte-after.png', Uint8Array.of(1))
    ]);
    for (const evidence of report.evidence) {
      evidence.before = '.artifacts/visual-proof/one-byte-before.png';
      evidence.after = '.artifacts/visual-proof/one-byte-after.png';
    }
    const oldObserved = process.env.PHYSICAL_BROWSER_OBSERVED;
    const oldOperator = process.env.PHYSICAL_BROWSER_OPERATOR;
    process.env.PHYSICAL_BROWSER_OBSERVED = '1';
    process.env.PHYSICAL_BROWSER_OPERATOR = report.humanObservationAttestation.operator;
    try {
      const blockers = await verifyVisualProof(report);
      expect(blockers.some((blocker) => blocker.includes('artifact is too small to be a PNG screenshot'))).toBe(true);
    } finally {
      if (oldObserved === undefined) delete process.env.PHYSICAL_BROWSER_OBSERVED;
      else process.env.PHYSICAL_BROWSER_OBSERVED = oldObserved;
      if (oldOperator === undefined) delete process.env.PHYSICAL_BROWSER_OPERATOR;
      else process.env.PHYSICAL_BROWSER_OPERATOR = oldOperator;
    }
  });
});
