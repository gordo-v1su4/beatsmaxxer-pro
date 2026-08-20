import { createHash } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dispatchVisibleButtonClick, evalPage, navigateAndReady, withChrome, type CdpSession } from './cdp.ts';
import { computeVisualProofBuildDigest, computeVisualProofSourceDigest, parsePngMetrics, pixelDifferenceRatio, readProductionPreviewIdentity, realMediaFileMetadata } from './visual-proof-verification.ts';
import {
  EIGHT_VIDEO_OBSERVATION_MS,
  EIGHT_VIDEO_WARMUP_MS,
  summarizeLegacyDrift,
  type CatalogHotSwapStressEvidence,
  type EightVideoProofReport
} from '../src/lib/qa/eightVideoProof.ts';
import { REDLINE_EXPECTED_BPM, createArtifactProvenance, type ProofCapabilityStatus } from '../src/lib/qa/artifactProvenance.ts';
import { resolveProofEnvironment } from '../src/lib/qa/proofEnvironment.ts';
import {
  REDLINE_AUDIO_NAME,
  REDLINE_AUDIO_SOURCE_PATH,
  REDLINE_VIDEO_SOURCE_PATHS
} from '../src/lib/qa/redlineProofMedia.ts';

const QA_URL = process.env.QA_URL ?? '';
const OUTPUT_DIR = '.artifacts/eight-video-proof';
const AUDIO_PATH = REDLINE_AUDIO_SOURCE_PATH;

if (process.env.HEADLESS === '1') throw new Error('Eight-video proof refuses headless capture');
if (!QA_URL || new URL(QA_URL).searchParams.has('qaAutoplay')) {
  throw new Error('Release proof requires an explicit production-preview QA_URL without qaAutoplay');
}
if (process.env.PROOF_SERVER_KIND !== 'vite-production-preview' ||
    process.env.PROOF_SERVER_ORIGIN !== new URL(QA_URL).origin) {
  throw new Error('Release proof refuses an unowned or non-production-preview server');
}
// Human observation is attested after the headed run. Capture must be allowed
// to produce machine evidence first; the independent verifier remains
// fail-closed until the observer fields are populated from an actual result.

type Snapshot = { decoderCount: number; documentVideoCount: number; timelineGeneration: number; timelineFrameId: number;
  transportSeconds: number; maxDriftSeconds: number; slots: Array<any> };

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const status = (passed: boolean): ProofCapabilityStatus => passed ? 'passed' : 'failed';

async function gitText(...args: string[]) {
  const child = Bun.spawn(['git', ...args], { cwd: '..', stdout: 'pipe', stderr: 'pipe' });
  const [text, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  if (exitCode !== 0) throw new Error(`git ${args.join(' ')} failed`);
  return text.trim();
}

async function installCapture(session: CdpSession) {
  const errors = { console: [] as string[], network: [] as string[], gpu: [] as string[], uncaught: [] as string[] };
  const requests: string[] = [];
  const requestUrls = new Map<string, string>();
  session.on('Runtime.exceptionThrown', (value) => errors.uncaught.push(JSON.stringify(value)));
  session.on('Log.entryAdded', (value) => {
    const entry = value as { entry?: { level?: string; text?: string } };
    if (entry.entry?.level === 'error') errors.console.push(entry.entry.text ?? JSON.stringify(value));
  });
  session.on('Network.loadingFailed', (value) => {
    const failure = value as { requestId?: string; type?: string; errorText?: string; canceled?: boolean };
    const url = failure.requestId ? requestUrls.get(failure.requestId) : undefined;
    if (failure.canceled === true && failure.type === 'Media' && failure.errorText === 'net::ERR_ABORTED' &&
        url?.startsWith(`blob:${new URL(QA_URL).origin}/`)) return;
    errors.network.push(JSON.stringify({ ...failure, url }));
  });
  session.on('Network.requestWillBeSent', (value) => {
    const request = value as { requestId?: string; request?: { url?: string } };
    if (request.requestId && request.request?.url) requestUrls.set(request.requestId, request.request.url);
    if (request.request?.url) requests.push(request.request.url);
  });
  await Promise.all([session.send('Page.enable'), session.send('Runtime.enable'), session.send('Log.enable'), session.send('Network.enable')]);
  await session.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    window.__BMX_EIGHT_GPU__ = null; window.__BMX_EIGHT_GPU_ERRORS__ = [];
    if (!navigator.gpu) return;
    const requestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = async (...args) => {
      const adapter = await requestAdapter(...args);
      if (!adapter) return adapter;
      const info = adapter.info || {};
      const identity = [info.vendor, info.architecture, info.device, info.description].join(' ');
      window.__BMX_EIGHT_GPU__ = { vendor: info.vendor || '', architecture: info.architecture || '', device: info.device || '',
        description: info.description || '', isFallbackAdapter: typeof info.isFallbackAdapter === 'boolean' ? info.isFallbackAdapter : null,
        softwareRenderer: /swiftshader|llvmpipe|software/i.test(identity), deviceCreated: false };
      const requestDevice = adapter.requestDevice.bind(adapter);
      adapter.requestDevice = async (...deviceArgs) => {
        const device = await requestDevice(...deviceArgs); window.__BMX_EIGHT_GPU__.deviceCreated = true;
        device.addEventListener('uncapturederror', event => window.__BMX_EIGHT_GPU_ERRORS__.push(String(event.error?.message || event.error)));
        device.lost.then(info => window.__BMX_EIGHT_GPU_ERRORS__.push('device lost: ' + info.message));
        return device;
      };
      return adapter;
    };
  })()` });
  return { errors, requests };
}

async function setFiles(session: CdpSession, selector: string, files: string[]) {
  const document = await session.send('DOM.getDocument', { depth: -1, pierce: true }) as { root?: { nodeId?: number } };
  const node = await session.send('DOM.querySelector', { nodeId: document.root?.nodeId, selector }) as { nodeId?: number };
  if (!node.nodeId) throw new Error(`UI file input missing: ${selector}`);
  await session.send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: files.map((file) => resolve(file)) });
}

async function screenshotCanvas(session: CdpSession, canvasId: string, path: string) {
  const rect = await evalPage<any>(session, `(() => { const c = document.querySelector('[data-canvas-id="${canvasId}"]'); if (!c) return null;
    const r = c.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height, scale: 1 }; })()`);
  if (!rect || rect.width < 2 || rect.height < 2) throw new Error(`Canvas is not capturable: ${canvasId}`);
  const result = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: rect }) as { data?: string };
  if (!result.data) throw new Error(`Screenshot failed: ${canvasId}`);
  await Bun.write(path, Buffer.from(result.data, 'base64'));
}

async function capture() {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(`${OUTPUT_DIR}/hot-swap`, { recursive: true });
  const videoPaths = REDLINE_VIDEO_SOURCE_PATHS.slice(0, 8);
  if (videoPaths.length !== 8) throw new Error(`Expected eight manifest-backed MP4s; found ${videoPaths.length}`);
  const fixturePaths = [...videoPaths, AUDIO_PATH];
  const [fixtures, sourceDigest, buildDigest, previewIdentity] = await Promise.all([
    realMediaFileMetadata(fixturePaths), computeVisualProofSourceDigest(), computeVisualProofBuildDigest(),
    readProductionPreviewIdentity(new URL(QA_URL).origin)
  ]);

  return withChrome('eight-video-proof', 10_200, async (session) => {
    const protocol = await installCapture(session);
    await navigateAndReady(session, QA_URL, 'document.documentElement?.dataset.bmxQa === "1"');
    const version = await session.send('Browser.getVersion') as { product?: string; userAgent?: string };
    const command = await session.send('Browser.getBrowserCommandLine') as { arguments?: string[] };

    await setFiles(session, '.topbar-shell input[type="file"][accept^="audio"]', [AUDIO_PATH]);
    await Bun.sleep(100);
    const analyzeClicked = await evalPage<boolean>(session, `(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent?.trim().toUpperCase() === 'ANALYZE'); if (!b) return false; b.click(); return true; })()`);
    if (!analyzeClicked) throw new Error('SONG -> ANALYZE choice was unavailable');
    await evalPage(session, `window.__BMX_QA__?.waitForAnalysis?.('ready', 90000)`, 95_000, 'wait for consented Essentia analysis');
    await setFiles(session, '.topbar-shell input[type="file"][multiple]', videoPaths);
    await dispatchVisibleButtonClick(session, 'PLAY');
    await evalPage(session, `window.__BMX_QA__?.waitForPlaying?.(10000)`, 15_000, 'observe visible PLAY transport start');
    await evalPage(session, `window.__BMX_QA__?.prepareEightVideoBenchmark?.(60000)`, 70_000, 'prepare eight concurrent rack videos');

    await Bun.sleep(EIGHT_VIDEO_WARMUP_MS);
    const first = await evalPage<Snapshot>(session, 'window.__BMX_QA__?.eightVideoSnapshot?.()');
    if (!first) throw new Error('Initial eight-video snapshot unavailable');
    const firstAudio = await evalPage<any>(session, 'window.__BMX_QA__?.realAudioSnapshot?.()');
    const firstPaths = new Map<string, string>();
    for (const slot of first.slots) {
      const path = `${OUTPUT_DIR}/${slot.moduleId}-first.png`; firstPaths.set(slot.moduleId, path);
      await screenshotCanvas(session, slot.canvasId, path);
    }

    const samples: EightVideoProofReport['samples'] = [];
    let rmsPeak = Number(firstAudio?.rms ?? 0), amplitudePeak = Number(firstAudio?.amplitude ?? 0);
    const observationStart = performance.now();
    while (performance.now() - observationStart < EIGHT_VIDEO_OBSERVATION_MS) {
      const snapshot = await evalPage<Snapshot>(session, 'window.__BMX_QA__?.eightVideoSnapshot?.()');
      const audio = await evalPage<any>(session, 'window.__BMX_QA__?.realAudioSnapshot?.()');
      if (!snapshot) throw new Error('Eight-video observation snapshot unavailable');
      if (snapshot.timelineGeneration !== first.timelineGeneration || audio?.playing !== true || audio?.mediaPaused === true) {
        throw new Error(`Shared transport changed during observation: ${JSON.stringify({
          expectedGeneration: first.timelineGeneration,
          actualGeneration: snapshot.timelineGeneration,
          playing: audio?.playing,
          mediaPaused: audio?.mediaPaused,
          lastStopReason: audio?.lastStopReason,
          stopCount: audio?.stopCount
        })}`);
      }
      rmsPeak = Math.max(rmsPeak, Number(audio?.rms ?? 0)); amplitudePeak = Math.max(amplitudePeak, Number(audio?.amplitude ?? 0));
      samples.push({ elapsedMs: performance.now() - observationStart, decoderCount: snapshot.decoderCount,
        documentVideoCount: snapshot.documentVideoCount, timelineGeneration: snapshot.timelineGeneration,
        timelineFrameId: snapshot.timelineFrameId, transportSeconds: snapshot.transportSeconds,
        maxDriftSeconds: snapshot.maxDriftSeconds, slots: snapshot.slots });
      await Bun.sleep(1_000);
    }
    const observationMs = performance.now() - observationStart;
    const last = await evalPage<Snapshot>(session, 'window.__BMX_QA__?.eightVideoSnapshot?.()');
    const lastAudio = await evalPage<any>(session, 'window.__BMX_QA__?.realAudioSnapshot?.()');
    if (!last) throw new Error('Final eight-video snapshot unavailable');
    samples.push({ elapsedMs: observationMs, decoderCount: last.decoderCount, documentVideoCount: last.documentVideoCount,
      timelineGeneration: last.timelineGeneration, timelineFrameId: last.timelineFrameId,
      transportSeconds: last.transportSeconds, maxDriftSeconds: last.maxDriftSeconds, slots: last.slots });

    const screenshots: EightVideoProofReport['screenshots'] = [];
    for (const slot of last.slots) {
      const secondPath = `${OUTPUT_DIR}/${slot.moduleId}-second.png`;
      await screenshotCanvas(session, slot.canvasId, secondPath);
      const firstPath = firstPaths.get(slot.moduleId)!;
      const [firstBytes, secondBytes] = await Promise.all([Bun.file(firstPath).bytes(), Bun.file(secondPath).bytes()]);
      const [firstPng, secondPng] = [parsePngMetrics(firstBytes), parsePngMetrics(secondBytes)];
      screenshots.push({ moduleId: slot.moduleId, firstPath, secondPath, firstSha256: sha256(firstBytes), secondSha256: sha256(secondBytes),
        firstNonBlackPixelRatio: firstPng.nonBlackPixelRatio, secondNonBlackPixelRatio: secondPng.nonBlackPixelRatio,
        pixelMotionRatio: pixelDifferenceRatio(firstPng, secondPng) });
    }
    const pgmCuts = [] as EightVideoProofReport['pgmCuts'];
    for (const slot of last.slots) {
      const cut = await evalPage<any>(session, `window.__BMX_QA__?.cutEightVideoPgm?.(${JSON.stringify(slot.moduleId)}, 300)`);
      if (!cut) throw new Error(`PGM cut diagnostics unavailable: ${slot.moduleId}`);
      pgmCuts.push(cut);
    }
    const catalog = await evalPage<CatalogHotSwapStressEvidence['catalog']>(session, 'window.__BMX_QA__?.catalogHotSwapCatalog?.()');
    const baseline = await evalPage<CatalogHotSwapStressEvidence['baseline']>(session, 'window.__BMX_QA__?.catalogHotSwapBaseline?.()');
    if (!catalog?.length || !baseline) throw new Error('Runtime catalog hot-swap discovery/baseline unavailable');
    const hotSwapSteps: CatalogHotSwapStressEvidence['steps'] = [];
    for (const [index, item] of catalog.entries()) {
      const raw = await evalPage<Omit<CatalogHotSwapStressEvidence['steps'][number], 'index' | 'screenshot'>>(
        session,
        `window.__BMX_QA__?.stressCatalogModule?.(${JSON.stringify(item.moduleId)}, ${index % 4}, 1100)`,
        15_000,
        `stress catalog module ${item.moduleId}`
      );
      if (!raw) throw new Error(`Catalog hot-swap evidence unavailable: ${item.moduleId}`);
      const canvasId = `${raw.row}-${raw.slotIndex}`;
      const screenshotPath = `${OUTPUT_DIR}/hot-swap/${String(index).padStart(2, '0')}-${item.moduleId}.png`;
      await screenshotCanvas(session, canvasId, screenshotPath);
      const screenshotBytes = await Bun.file(screenshotPath).bytes();
      const png = parsePngMetrics(screenshotBytes);
      const step: CatalogHotSwapStressEvidence['steps'][number] = {
        index,
        ...raw,
        screenshot: { path: screenshotPath, sha256: sha256(screenshotBytes), nonBlackPixelRatio: png.nonBlackPixelRatio }
      };
      hotSwapSteps.push(step);
      await Bun.write(`${OUTPUT_DIR}/hot-swap/${String(index).padStart(2, '0')}-${item.moduleId}.json`, JSON.stringify(step, null, 2));
    }
    const hotSwap: CatalogHotSwapStressEvidence = {
      mutationPath: 'assignModuleToSlot',
      catalog,
      baseline,
      steps: hotSwapSteps
    };
    const gpu = await evalPage<any>(session, 'window.__BMX_EIGHT_GPU__');
    protocol.errors.gpu.push(...((await evalPage<string[]>(session, 'window.__BMX_EIGHT_GPU_ERRORS__')) ?? []));
    const [sourceCommit, dirtyStatus, lockBytes] = await Promise.all([
      gitText('rev-parse', 'HEAD'),
      gitText('status', '--porcelain', '--untracked-files=normal'),
      Bun.file('bun.lock').bytes()
    ]);
    const capturedAt = new Date().toISOString();
    const fixtureByName = new Map(fixtures.map((fixture) => [fixture.name, fixture]));
    const screenshotByModule = new Map(screenshots.map((screenshot) => [screenshot.moduleId, screenshot]));
    const firstByModule = new Map(first.slots.map((slot: any) => [slot.moduleId, slot]));
    const primarySamples = last.slots.map((slot: any) => {
      const fixture = fixtureByName.get(slot.fileName);
      const screenshot = screenshotByModule.get(slot.moduleId);
      return {
        assetName: slot.fileName,
        assetSha256: fixture?.sha256 ?? '',
        observedSource: slot.currentSrc,
        rendererSource: slot.render?.source ?? '',
        sourceBackend: 'html-video' as const,
        frameProducer: 'HTMLVideoElement.copyExternalImageToTexture' as const,
        sourceFrameId: slot.render?.frameId ?? 0,
        sourceTimestampSeconds: slot.currentTime,
        outputFrameSha256: screenshot?.secondSha256 ?? '',
        width: slot.videoWidth,
        height: slot.videoHeight
      };
    });
    const videoFixtures = fixtures.filter((fixture) => fixture.width !== null);
    const mediaAdvanced = last.slots.every((slot: any) => {
      const initial = firstByModule.get(slot.moduleId) as any;
      return initial && slot.totalVideoFrames > initial.totalVideoFrames;
    });
    const contentIntegrityPassed = primarySamples.length === 8 && primarySamples.every((sample) =>
      /^[0-9a-f]{64}$/.test(sample.assetSha256) && /^[0-9a-f]{64}$/.test(sample.outputFrameSha256) &&
      sample.observedSource === sample.rendererSource && sample.sourceFrameId > 0);
    const proofEnv = resolveProofEnvironment();
    const artifactProvenance = createArtifactProvenance({
      captureId: crypto.randomUUID(),
      capturedAt,
      source: { commit: sourceCommit, digest: sourceDigest, workingTreeDirty: dirtyStatus.length > 0 },
      build: { id: buildDigest, digest: buildDigest, profile: 'production' },
      server: {
        kind: 'vite-production-preview',
        origin: new URL(QA_URL).origin,
        buildDigest,
        ...previewIdentity
      },
      dependencyLock: { path: 'bun.lock', sha256: sha256(lockBytes) },
      environment: {
        shellKind: proofEnv.shellKind,
        sourceBackend: proofEnv.sourceBackend,
        frameProducer: proofEnv.frameProducer,
        releaseEvidence: proofEnv.releaseEvidence,
        webgpuAvailable: gpu?.deviceCreated === true,
        runtime: {
          name: version.product?.split('/')[0] ?? '',
          version: version.product?.split('/')[1] ?? '',
          userAgent: version.userAgent ?? ''
        },
        device: {
          operatingSystem: process.platform,
          architecture: process.arch,
          model: [gpu?.vendor, gpu?.device].filter(Boolean).join(' ') || 'unknown',
          gpuIdentity: [gpu?.vendor, gpu?.architecture, gpu?.device, gpu?.description].filter(Boolean).join(' ')
        }
      },
      capabilities: {
        webgpu: status(gpu?.deviceCreated === true),
        mediaAdvance: status(mediaAdvanced),
        bpmMatch: status(Math.abs(Number(lastAudio?.bpm ?? 0) - REDLINE_EXPECTED_BPM) <= 0.01),
        primarySamples: status(primarySamples.length === 8),
        contentIntegrity: status(contentIntegrityPassed)
      },
      contentIntegrity: {
        algorithm: 'sha256',
        requiredPrimarySampleCount: 8,
        assets: videoFixtures.map((fixture) => ({ name: fixture.name, sha256: fixture.sha256, size: fixture.size })),
        primarySamples
      }
    });
    const report: EightVideoProofReport = {
      schemaVersion: 2, provenance: artifactProvenance,
      warmupMs: EIGHT_VIDEO_WARMUP_MS, observationMs, environment: { browserProduct: version.product ?? '', userAgent: version.userAgent ?? '',
        headless: false, commandLine: command.arguments ?? [], gpu }, fixtures, loadedVia: 'UI CLIPS multi-file',
      humanObservation: { observed: process.env.PHYSICAL_BROWSER_OBSERVED === '1', operator: process.env.PHYSICAL_BROWSER_OPERATOR ?? '',
        lagObserved: process.env.PHYSICAL_BROWSER_LAG_OBSERVED !== '0' },
      audio: { fileName: REDLINE_AUDIO_NAME, loadedVia: 'SONG -> ANALYZE', usingUploadedTrack: !!lastAudio?.usingUploadedTrack,
        analysisStatus: String(lastAudio?.analysisStatus ?? ''), analysisConfidence: Number.isFinite(lastAudio?.analysisConfidence) ? Number(lastAudio.analysisConfidence) : null,
        bpm: Number(lastAudio?.bpm ?? 0),
        contextState: String(lastAudio?.contextState ?? ''), contextTimeDelta: Number(lastAudio?.contextCurrentTime ?? 0) - Number(firstAudio?.contextCurrentTime ?? 0),
        mediaTimeDelta: Number(lastAudio?.mediaCurrentTime ?? 0) - Number(firstAudio?.mediaCurrentTime ?? 0), mediaPaused: !!lastAudio?.mediaPaused,
        mediaMuted: !!lastAudio?.mediaMuted, volume: Number(lastAudio?.volume ?? 0), rmsPeak, amplitudePeak },
      decoderCount: last.decoderCount, samples, screenshots, pgmCuts, hotSwap,
      legacyDriftReport: summarizeLegacyDrift(samples, hotSwap),
      networkRequests: protocol.requests, errors: protocol.errors
    };
    await Bun.write(`${OUTPUT_DIR}/report.json`, JSON.stringify(report, null, 2));
    return report;
  });
}

await capture();
