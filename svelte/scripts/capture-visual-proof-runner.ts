import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { computeVisualProofBuildDigest, computeVisualProofSourceDigest, digestJson, parsePngMetrics, pixelDifferenceRatio, realMediaFileMetadata } from './visual-proof-verification.ts';
import { evalPage, navigateAndReady, withChrome, type CdpSession } from './cdp.ts';
import {
  FIXED_VISUAL_PROOF_FIXTURE,
  REAL_MEDIA_VIDEO_NAMES,
  FIXED_VISUAL_PROOF_TIMELINE_POSITIONS,
  FIXED_VISUAL_PROOF_VIEWPORT,
  buildVisualProofManifest,
  evaluateVisualProofReport,
  validateVisualProofRealVideoExercise,
  type AdvertisedControl,
  type VisualProofEvidence,
  type VisualProofReport
} from '../src/lib/qa/visualProof.ts';

const QA_URL = 'http://127.0.0.1:5174/?qaProof=1';
const OUTPUT_DIR = '.artifacts/visual-proof';
const REPORT_PATH = `${OUTPUT_DIR}/report.json`;

if (process.env.HEADLESS === '1') {
  throw new Error('Physical-browser proof capture refuses HEADLESS=1');
}

interface BrowserControl extends AdvertisedControl {
  expectedOutcome: string;
  fileInputId?: string;
  fixtureKind?: 'audio' | 'video' | 'clips' | 'midi';
}

interface TimelineReading {
  requestedSeconds: number;
  transportSeconds: number;
  audioContextCurrentTime: number | null;
  source: string;
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
}

interface ScreenshotReading {
  nonBlackPixelRatio: number;
  contentHash: string;
}

interface LiveClipReading {
  moduleId: string; pgmModule: string; bindingId: string; fileName: string; currentSrc: string; readyState: number;
  videoWidth: number; videoHeight: number; durationSeconds: number; mediaTimeSeconds: number;
  transportSeconds: number; contextTimeSeconds: number; centralFrameId: number;
  hasVideo: boolean; videoSize: string | null;
  externalTextureImported: boolean; externalTextureBound: boolean; samplePath: string;
  rendererSource: string | null; rendererDimensions: string | null; rendererFrameId: number | null;
}

function safeName(id: string) {
  return id.replace(/[^a-z0-9_.-]+/gi, '-');
}

async function installErrorCapture(session: CdpSession) {
  const protocol = { exceptions: [] as string[], logs: [] as string[], requests: [] as string[] };
  session.on('Runtime.exceptionThrown', (params) => protocol.exceptions.push(JSON.stringify(params)));
  session.on('Log.entryAdded', (params) => {
    const entry = params as { entry?: { level?: string } };
    if (entry.entry?.level === 'error') protocol.logs.push(JSON.stringify(params));
  });
  session.on('Network.requestWillBeSent', (params) => {
    const request = params as { request?: { url?: string } };
    if (request.request?.url) protocol.requests.push(request.request.url);
  });
  await Promise.all([session.send('Page.enable'), session.send('Runtime.enable'), session.send('Log.enable'), session.send('Network.enable')]);
  await session.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
      window.__BMX_PROOF_CONSOLE_ERRORS__ = [];
      window.__BMX_PROOF_UNCAUGHT_ERRORS__ = [];
      window.__BMX_PROOF_GPU_ERRORS__ = [];
      window.__BMX_PROOF_GPU_PROVENANCE__ = null;
      const original = console.error.bind(console);
      console.error = (...args) => {
        window.__BMX_PROOF_CONSOLE_ERRORS__.push(args.map(String).join(' '));
        original(...args);
      };
      addEventListener('error', (event) => {
        window.__BMX_PROOF_UNCAUGHT_ERRORS__.push(String(event.error || event.message));
      });
      addEventListener('unhandledrejection', (event) => {
        window.__BMX_PROOF_UNCAUGHT_ERRORS__.push(String(event.reason));
      });
      if (navigator.gpu) {
        const originalRequestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
        navigator.gpu.requestAdapter = async (...args) => {
          const adapter = await originalRequestAdapter(...args);
          if (adapter) {
            let adapterInfo = adapter.info;
            if (!adapterInfo && typeof adapter.requestAdapterInfo === 'function') {
              try { adapterInfo = await adapter.requestAdapterInfo(); } catch { /* captured as unavailable below */ }
            }
            const readInfo = (key) => {
              const value = adapterInfo?.[key];
              return typeof value === 'string' ? value : '';
            };
            const identity = [readInfo('vendor'), readInfo('architecture'), readInfo('device'), readInfo('description')].join(' ');
            const isFallbackAdapter = typeof adapterInfo?.isFallbackAdapter === 'boolean'
              ? adapterInfo.isFallbackAdapter
              : typeof adapter.isFallbackAdapter === 'boolean' ? adapter.isFallbackAdapter : null;
            window.__BMX_PROOF_GPU_PROVENANCE__ = {
              api: 'WebGPU',
              provenanceSource: 'navigator.gpu.requestAdapter',
              adapterInfoAvailable: Boolean(adapterInfo),
              vendor: readInfo('vendor'),
              architecture: readInfo('architecture'),
              device: readInfo('device'),
              description: readInfo('description'),
              isFallbackAdapter,
              deviceCreated: false,
              deviceLabel: '',
              deviceFeatures: [],
              softwareRenderer: /swiftshader|llvmpipe|lavapipe|software(?:\\s+renderer)?|microsoft basic render|\\bwarp\\b/i.test(identity)
                || isFallbackAdapter === true
            };
            const originalRequestDevice = adapter.requestDevice.bind(adapter);
            adapter.requestDevice = async (...deviceArgs) => {
              const device = await originalRequestDevice(...deviceArgs);
              window.__BMX_PROOF_GPU_PROVENANCE__ = {
                ...window.__BMX_PROOF_GPU_PROVENANCE__,
                deviceCreated: true,
                deviceLabel: typeof device.label === 'string' ? device.label : '',
                deviceFeatures: Array.from(device.features || []).map(String).sort()
              };
              device.addEventListener('uncapturederror', event => window.__BMX_PROOF_GPU_ERRORS__.push(String(event.error?.message || event.error)));
              device.lost.then(info => window.__BMX_PROOF_GPU_ERRORS__.push('device lost: ' + info.reason + ' ' + info.message));
              return device;
            };
          }
          return adapter;
        };
      }
      return true;
    })()` });
  return protocol;
}

async function discoverControls(session: CdpSession): Promise<BrowserControl[]> {
  return (
    (await evalPage<BrowserControl[]>(
      session,
      `(() => {
        const selector = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),[role="button"]:not([aria-disabled="true"]),[role="slider"]:not([aria-disabled="true"]),[data-bmx-mouse-control]';
        const seen = new Map();
        const controls = [];
        for (const element of document.querySelectorAll(selector)) {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (style.display === 'none' || style.visibility === 'hidden' || rect.width < 1 || rect.height < 1) continue;
          if (element instanceof HTMLInputElement && element.type === 'hidden') continue;
          const kind = element.getAttribute('role') === 'slider' ? 'slider'
            : element instanceof HTMLButtonElement || element.getAttribute('role') === 'button' ? 'button'
            : element instanceof HTMLSelectElement ? 'select' : element.hasAttribute('data-bmx-mouse-control') ? 'mouse' : 'input';
          const label = (element.getAttribute('aria-label') || element.getAttribute('title') ||
            element.textContent || element.getAttribute('name') || element.getAttribute('type') || kind)
            .replace(/\\s+/g, ' ').trim();
          const moduleId = element.closest('[data-bmx-module-id]')?.getAttribute('data-bmx-module-id');
          const explicit = element.getAttribute('data-bmx-proof-id');
          const base = (explicit || [moduleId, element.id || element.getAttribute('name') || label || kind].filter(Boolean).join(':'))
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || kind;
          const occurrence = (seen.get(base) || 0) + 1;
          seen.set(base, occurrence);
          const id = base + ':' + occurrence;
          element.dataset.bmxProofRuntimeId = id;
          let fileInput = null;
          let fixtureKind = undefined;
          if (element instanceof HTMLButtonElement) {
            const text = element.textContent?.replace(/\s+/g, ' ').trim().toUpperCase() || '';
            if (text.includes('SONG')) {
              fileInput = document.querySelector('.topbar-shell input[type=file][accept^="audio"]');
              fixtureKind = 'audio';
            } else if (text.includes('CLIPS')) {
              fileInput = document.querySelector('.topbar-shell input[type=file][multiple]');
              fixtureKind = 'clips';
            } else if (text === 'MIDI') {
              fileInput = element.parentElement?.querySelector('input[type=file][accept*="midi"]');
              fixtureKind = 'midi';
            } else if (text.includes('CLIP')) {
              fileInput = element.parentElement?.querySelector('input[type=file][accept^="video"]');
              fixtureKind = 'video';
            }
          }
          const fileInputId = fileInput ? 'file:' + id : undefined;
          if (fileInput) fileInput.dataset.bmxProofFileId = fileInputId;
          controls.push({ id, label, kind, state: element.closest('[role="dialog"]') ? 'audio-consent' : 'base', fileInputId, fixtureKind, expectedOutcome: element.getAttribute('title') ||
            element.getAttribute('aria-label') || label });
        }
        return controls;
      })()`
    )) ?? []
  );
}

async function elementState(session: CdpSession, id: string) {
  return evalPage<Record<string, unknown>>(
    session,
    `(() => {
      const element = document.querySelector('[data-bmx-proof-runtime-id="${id.replaceAll('"', '\\"')}"]');
      if (!element) return { missing: true };
      const input = element instanceof HTMLInputElement ? element : null;
      return {
        missing: false,
        text: element.textContent?.replace(/\\s+/g, ' ').trim() || '',
        value: input?.value ?? (element instanceof HTMLSelectElement ? element.value : null),
        checked: input?.checked ?? null,
        disabled: element.matches(':disabled'),
        ariaPressed: element.getAttribute('aria-pressed'),
        ariaExpanded: element.getAttribute('aria-expanded'),
        className: element.className,
        dataset: { ...element.dataset },
        qa: (() => {
          const snapshot = window.__BMX_QA__?.snapshot?.();
          if (!snapshot) return null;
          return {
            playing: snapshot.playing,
            pgmModule: snapshot.pgmModule,
            modules: snapshot.modules,
            soundTouch: snapshot.soundTouch,
            usingUploadedTrack: snapshot.usingUploadedTrack,
            trackName: snapshot.trackName,
            uploadedTrackLoadGeneration: snapshot.uploadedTrackLoadGeneration,
            params: snapshot.params
          };
        })()
      };
    })()`
  );
}

async function assignFixtureFile(session: CdpSession, control: BrowserControl, resolveAudioChoice = true) {
  const selector = `[data-bmx-proof-file-id="${control.fileInputId}"]`;
  const documentNode = await session.send('DOM.getDocument', { depth: -1, pierce: true }) as {
    root?: { nodeId?: number };
  };
  const rootNodeId = documentNode.root?.nodeId;
  if (!rootNodeId) throw new Error('CDP document node unavailable');
  const queried = await session.send('DOM.querySelector', { nodeId: rootNodeId, selector }) as { nodeId?: number };
  if (!queried.nodeId) throw new Error(`fixture file input unavailable for ${control.id}`);
  const files = control.fixtureKind === 'audio'
    ? [resolve(FIXED_VISUAL_PROOF_FIXTURE.root, FIXED_VISUAL_PROOF_FIXTURE.audio)]
    : control.fixtureKind === 'midi'
      ? [resolve('tests/fixtures/media/qa.mid')]
      : control.fixtureKind === 'clips'
        ? [resolve(FIXED_VISUAL_PROOF_FIXTURE.root, FIXED_VISUAL_PROOF_FIXTURE.clips[0])]
        : [resolve(FIXED_VISUAL_PROOF_FIXTURE.root, FIXED_VISUAL_PROOF_FIXTURE.clips[0])];
  await session.send('DOM.setFileInputFiles', { nodeId: queried.nodeId, files });
  await evalPage(session, `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) throw new Error('fixture file input disappeared');
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  if (control.fixtureKind === 'audio' && resolveAudioChoice) {
    await evalPage(session, `(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      const local = [...document.querySelectorAll('button')].find(button =>
        button.textContent?.replace(/\\s+/g, ' ').trim().toUpperCase().includes('LOCAL'));
      if (!local) throw new Error('local-only audio choice is unavailable');
      local.click();
      await new Promise(resolve => setTimeout(resolve, 250));
    })()`);
  } else {
    await evalPage(session, `new Promise(resolve => setTimeout(resolve, 1200))`);
  }
}

async function exerciseControl(session: CdpSession, control: BrowserControl) {
  if (control.fileInputId) {
    try {
      await assignFixtureFile(session, control);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }
  return evalPage<{ ok: boolean; error?: string }>(
    session,
    `(async () => {
      const element = document.querySelector('[data-bmx-proof-runtime-id="${control.id.replaceAll('"', '\\"')}"]');
      if (!element) return { ok: false, error: 'control became unreachable' };
      try {
        if (element instanceof HTMLInputElement && element.type === 'range') {
          const min = Number(element.min || 0), max = Number(element.max || 100);
          const current = Number(element.value);
          element.value = String(current < max ? Math.min(max, current + Math.max(1, (max - min) / 4)) : min);
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (element.getAttribute('role') === 'slider') {
          element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        } else if (element instanceof HTMLSelectElement) {
          if (element.options.length < 2) return { ok: false, error: 'select has no alternate option' };
          element.selectedIndex = (element.selectedIndex + 1) % element.options.length;
          element.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          element.click();
          const label = (element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '')
            .replace(/\s+/g, ' ').trim().toUpperCase();
          if (label === 'TAP' || label.startsWith('TAP ')) {
            await new Promise(resolve => setTimeout(resolve, 400));
            element.click();
          }
        }
        await new Promise(resolve => setTimeout(resolve, 220));
        return { ok: true };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    })()`
  );
}

async function capturePng(
  session: CdpSession,
  relativePath: string,
  selector?: string
): Promise<ScreenshotReading> {
  let clip: Record<string, number> | undefined;
  if (selector) {
    const rect = await evalPage<{ x: number; y: number; width: number; height: number }>(
      session,
      `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })()`
    );
    if (!rect || rect.width < 1 || rect.height < 1) throw new Error(`Screenshot target missing: ${selector}`);
    clip = { ...rect, scale: 1 };
  }
  const result = (await session.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    ...(clip ? { clip } : {})
  })) as { data?: string };
  if (!result.data) throw new Error(`Screenshot capture failed: ${relativePath}`);
  await Bun.write(relativePath, Buffer.from(result.data, 'base64'));
  const analysis = await evalPage<ScreenshotReading>(
    session,
    `(async () => {
      const binary = atob(${JSON.stringify(result.data)});
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('2D screenshot analysis unavailable');
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      let sampled = 0, nonBlack = 0, hash = 2166136261;
      for (let i = 0; i < pixels.length; i += 64) {
        sampled++;
        if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 18) nonBlack++;
        hash ^= pixels[i]; hash = Math.imul(hash, 16777619);
        hash ^= pixels[i + 1]; hash = Math.imul(hash, 16777619);
        hash ^= pixels[i + 2]; hash = Math.imul(hash, 16777619);
      }
      bitmap.close();
      return { nonBlackPixelRatio: sampled ? nonBlack / sampled : 0, contentHash: (hash >>> 0).toString(16) };
    })()`,
    30_000
  );
  if (!analysis || typeof analysis.nonBlackPixelRatio !== 'number' || !analysis.contentHash) {
    throw new Error(`Screenshot analysis failed: ${relativePath}`);
  }
  return analysis;
}

await rm(OUTPUT_DIR, { recursive: true, force: true });
await mkdir(OUTPUT_DIR, { recursive: true });

await withChrome('capture-visual-proof', 9970, async (session) => {
  console.log('[visual-proof] installing protocol error capture');
  const protocolCapture = await installErrorCapture(session);
  try {
    await navigateAndReady(session, QA_URL);
  } catch (error) {
    console.error(JSON.stringify({
      stage: 'page readiness marker',
      error: String(error),
      protocolExceptions: protocolCapture.exceptions,
      protocolErrors: protocolCapture.logs
    }, null, 2));
    throw error;
  }
  console.log('[visual-proof] discovering interactive controls');
  const controls = await discoverControls(session);
  const songControl = controls.find((control) => control.fixtureKind === 'audio');
  if (!songControl) throw new Error('stable SONG picker control is missing');
  console.log('[visual-proof] REAL AUDIO: selecting Redline (Remastered).mp3 through SONG');
  const realPhaseRequestStart = protocolCapture.requests.length;
  await assignFixtureFile(session, songControl, false);
  const consentControls = (await discoverControls(session)).filter((control) => control.state === 'audio-consent');
  const localOnly = consentControls.find((control) => control.label.toUpperCase().includes('LOCAL ONLY'));
  const cancel = consentControls.find((control) => control.label.toUpperCase() === 'CANCEL');
  if (!cancel || !localOnly) throw new Error('conditional audio privacy controls are missing');
  console.log('[visual-proof] REAL AUDIO: choosing LOCAL ONLY; no upload/network is permitted');
  await exerciseControl(session, localOnly);
  console.log('[visual-proof] REAL AUDIO: audible volume 72%; observing playback and analyser for 3 seconds');
  const audioPlayback = await evalPage<any>(session, `window.__BMX_QA__?.sampleRealAudioPlayback?.(3000)`, 15_000, 'observe real Redline playback');
  if (!audioPlayback?.after?.usingUploadedTrack || audioPlayback.after.trackName !== 'Redline (Remastered).mp3') {
    throw new Error('Redline did not remain bound to uploaded playback');
  }
  if (audioPlayback.after.contextState !== 'running' || audioPlayback.after.contextCurrentTime - audioPlayback.before.contextCurrentTime < 2 ||
      audioPlayback.after.mediaCurrentTime - audioPlayback.before.mediaCurrentTime < 2 || audioPlayback.after.mediaPaused || audioPlayback.after.mediaMuted ||
      audioPlayback.after.volume < 0.25 || audioPlayback.rmsPeak <= 0.005 || audioPlayback.amplitudePeak <= 0.005 ||
      protocolCapture.requests.slice(realPhaseRequestStart).some((url) => /\/(?:__api|api)\/analyze\//.test(url))) {
    throw new Error('Real-audio phase failed before video/matrix: audible local-only playback diagnostics are incomplete');
  }

  const clipControl = controls.find((control) => control.fixtureKind === 'video' && control.id.includes('transition'));
  if (!clipControl?.fileInputId) throw new Error('visible Transition CLIP picker control is missing');
  console.log('[visual-proof] REAL VIDEO: selecting staged MP4s one at a time through the visible Transition CLIP picker');
  const clipsSelector = `[data-bmx-proof-file-id="${clipControl.fileInputId}"]`;
  const documentNode = await session.send('DOM.getDocument', { depth: -1, pierce: true }) as { root?: { nodeId?: number } };
  const clipInput = await session.send('DOM.querySelector', { nodeId: documentNode.root?.nodeId, selector: clipsSelector }) as { nodeId?: number };
  if (!clipInput.nodeId) throw new Error('visible CLIP file input is unavailable');

  const mediaPaths = [
    ...FIXED_VISUAL_PROOF_FIXTURE.clips.map((name) => `${FIXED_VISUAL_PROOF_FIXTURE.root}/${name}`),
    `${FIXED_VISUAL_PROOF_FIXTURE.root}/${FIXED_VISUAL_PROOF_FIXTURE.audio}`
  ];
  const mediaMetadata = await realMediaFileMetadata(mediaPaths);
  const mediaByName = new Map(mediaMetadata.map((entry) => [entry.name, entry]));
  const videoExercise: VisualProofReport['realMedia']['videoExercise'] = [];
  const realFirstFrames: ReturnType<typeof parsePngMetrics>[] = [];
  let maxSimultaneousDecoded = 0;
  await evalPage(session, `window.__BMX_QA__?.focusVisualProofModule?.('transition')`);
  for (let index = 0; index < REAL_MEDIA_VIDEO_NAMES.length; index++) {
    const fileName = REAL_MEDIA_VIDEO_NAMES[index]!;
    console.log(`[visual-proof] REAL VIDEO ${index + 1}/13: ${fileName} — UI load, live motion/cadence, then full release`);
    await evalPage(session, `window.__BMX_QA__?.showVisualProofRealVideoProgress?.(${index + 1}, 13, ${JSON.stringify(fileName)})`);
    const selectionBefore = await evalPage<{ generation: number }>(session, `window.__BMX_QA__?.visualProofRealMediaSelectionState?.()`);
    await session.send('DOM.setFileInputFiles', { nodeId: clipInput.nodeId, files: [resolve(FIXED_VISUAL_PROOF_FIXTURE.root, FIXED_VISUAL_PROOF_FIXTURE.clips[index]!)] });
    const capturedSelection = await evalPage<{ generation: number; name: string; size: number; sha256: string }>(session,
      `window.__BMX_QA__?.waitForVisualProofRealMediaSelection?.(${selectionBefore.generation}, ${JSON.stringify(fileName)}, 5000)`, 10_000,
      `retain capture-phase selected File: ${fileName}`);
    await evalPage(session, `window.__BMX_QA__?.waitForVisualProofClip?.('transition', ${JSON.stringify(fileName)}, 30000)`, 35_000);
    await evalPage(session, `new Promise(resolve => setTimeout(resolve, 300))`);
    const firstTimeline = await evalPage<LiveClipReading>(session, `window.__BMX_QA__?.readVisualProofLiveClip?.()`);
    const selected = firstTimeline;
    const firstScreenshot = `${OUTPUT_DIR}/real-video-${index + 1}-frame-a.png`;
    const firstShot = await capturePng(session, firstScreenshot, '[data-canvas-id="pgm"]');
    const cadence = await evalPage<any>(session, `window.__BMX_QA__?.sampleVisualProofFrameCadence?.(1100)`, 5_000, `observe motion for ${fileName}`);
    const secondTimeline = cadence.after as LiveClipReading;
    const secondScreenshot = `${OUTPUT_DIR}/real-video-${index + 1}-frame-b.png`;
    const secondShot = await capturePng(session, secondScreenshot, '[data-canvas-id="pgm"]');
    const [firstPng, secondPng] = await Promise.all([readFile(firstScreenshot), readFile(secondScreenshot)]).then(([a, b]) => [parsePngMetrics(a), parsePngMetrics(b)] as const);
    const metadata = mediaByName.get(fileName)!;
    realFirstFrames.push(firstPng);
    const release = await evalPage<any>(session, `window.__BMX_QA__?.releaseVisualProofRealClip?.('transition', ${JSON.stringify(selected.currentSrc)})`, 15_000, `release real clip ${fileName}`);
    maxSimultaneousDecoded = Math.max(maxSimultaneousDecoded, 1 + Number(release.decodedCount));
    const exercise: VisualProofReport['realMedia']['videoExercise'][number] = {
      fileName, relativePath: metadata.relativePath, sha256: metadata.sha256, size: metadata.size,
      selectedFileSha256: capturedSelection.sha256, selectedFileSize: capturedSelection.size,
      currentSrc: selected.currentSrc, pgmModule: selected.pgmModule, bindingId: selected.bindingId,
      videoWidth: selected.videoWidth, videoHeight: selected.videoHeight,
      durationSeconds: selected.durationSeconds, readyState: secondTimeline.readyState, hasVideo: secondTimeline.hasVideo,
      externalTextureImported: secondTimeline.externalTextureImported, externalTextureBound: secondTimeline.externalTextureBound,
      samplePath: secondTimeline.samplePath, rendererSource: secondTimeline.rendererSource,
      rendererDimensions: secondTimeline.rendererDimensions, rendererFrameId: secondTimeline.rendererFrameId,
      videoSize: secondTimeline.videoSize ?? '',
      firstTimelineSeconds: firstTimeline.transportSeconds, secondTimelineSeconds: secondTimeline.transportSeconds,
      firstMediaTimeSeconds: firstTimeline.mediaTimeSeconds, secondMediaTimeSeconds: secondTimeline.mediaTimeSeconds,
      firstCentralFrameId: firstTimeline.centralFrameId, secondCentralFrameId: secondTimeline.centralFrameId,
      firstScreenshot, secondScreenshot, firstContentHash: firstShot.contentHash, secondContentHash: secondShot.contentHash,
      nonBlackPixelRatio: Math.min(firstShot.nonBlackPixelRatio, secondShot.nonBlackPixelRatio),
      pixelMotionRatio: pixelDifferenceRatio(firstPng, secondPng), sampleCount: cadence.sampleCount,
      p95IntervalMs: cadence.p95IntervalMs, maxIntervalMs: cadence.maxIntervalMs,
      droppedFrames: cadence.droppedFrames, stalledFrames: cadence.stalledFrames,
      frameIntervalsMs: cadence.frameIntervalsMs,
      released: release.released && release.decodedCount === 0,
      previousSourceUnbound: release.previousSourceUnbound === true
    };
    const phaseBlockers = validateVisualProofRealVideoExercise(exercise);
    if (phaseBlockers.length) throw new Error(`Real-video phase failed before matrix: ${phaseBlockers.join('; ')}`);
    videoExercise.push(exercise);
  }
  await evalPage(session, `window.__BMX_QA__?.hideVisualProofRealVideoProgress?.()`);
  const adjacentCrossFileDifferenceRatios = realFirstFrames.slice(1).map((frame, index) => pixelDifferenceRatio(realFirstFrames[index]!, frame));
  if (new Set(videoExercise.map((entry) => entry.currentSrc)).size !== REAL_MEDIA_VIDEO_NAMES.length ||
      new Set(videoExercise.map((entry) => entry.firstContentHash)).size < 10 ||
      adjacentCrossFileDifferenceRatios.filter((ratio) => ratio > 0.01).length < 8) {
    throw new Error('Real-video phase failed before matrix: PGM sources or screenshots were reused across files');
  }
  console.log('[visual-proof] REAL MEDIA: all MP4s visibly exercised; centrally pausing before deterministic effect matrix');
  await evalPage(session, `window.__BMX_QA__?.stopTransport?.()`);
  const pausedDiagnostics = await evalPage<any>(session, `window.__BMX_QA__?.getEngine?.().audioEngine.getProofPlaybackDiagnostics()`);
  const matrixAssignments: Record<string, { fileName: string; sha256: string }> = {};
  const manifestControls = [...controls, ...consentControls.filter((control) => !controls.some((base) => base.id === control.id))];
  const manifest = buildVisualProofManifest(manifestControls);
  const evidence: VisualProofEvidence[] = [];
  const captureErrors: string[] = [];
  let timelineSource = 'unavailable';
  let activeMatrixModule: string | null = null;

  for (let index = 0; index < manifest.items.length; index++) {
    const item = manifest.items[index]!;
    console.log(`[visual-proof] item ${index + 1}/${manifest.items.length}: ${item.id}`);
    const position = FIXED_VISUAL_PROOF_TIMELINE_POSITIONS[index % FIXED_VISUAL_PROOF_TIMELINE_POSITIONS.length]!;
    const beforePath = `${OUTPUT_DIR}/${safeName(item.id)}-before.png`;
    const afterPath = `${OUTPUT_DIR}/${safeName(item.id)}-after.png`;
    try {
      if (item.kind !== 'control') {
        const moduleId = item.subjectId.split(':')[0]!;
        if (moduleId !== activeMatrixModule) {
          if (activeMatrixModule) await evalPage(session, `window.__BMX_QA__?.releaseVisualProofRealClip?.(${JSON.stringify(activeMatrixModule)})`, 15_000);
          const binding = await evalPage<any>(session, `window.__BMX_QA__?.attachVisualProofRealClipToModule?.(${JSON.stringify(moduleId)})`, 30_000,
            `serial matrix clip attach: ${moduleId}`);
          const metadata = mediaByName.get(binding.fileName)!;
          matrixAssignments[moduleId] = { fileName: binding.fileName, sha256: metadata.sha256 };
          activeMatrixModule = moduleId;
          maxSimultaneousDecoded = Math.max(maxSimultaneousDecoded,
            await evalPage<number>(session, `window.__BMX_QA__?.realMediaDecodedCount?.()`));
        }
      }
      await evalPage(session, `window.__BMX_QA__?.resetVisualProofUiState?.()`, 15_000);
      let currentControls = await discoverControls(session);

      let beforeState: unknown;
      let afterState: unknown;
      let actionOk = true;
      let actionError: string | undefined;
      const isControl = item.kind === 'control';
      if (isControl) {
        if (activeMatrixModule && activeMatrixModule !== 'transition') {
          await evalPage(session, `window.__BMX_QA__?.releaseVisualProofRealClip?.(${JSON.stringify(activeMatrixModule)})`, 15_000);
          activeMatrixModule = null;
        }
        await evalPage(session, `window.__BMX_QA__?.restoreVisualProofRack?.()`, 15_000);
        if (!activeMatrixModule) {
          await evalPage(session, `window.__BMX_QA__?.attachVisualProofRealClipToModule?.('transition')`, 30_000);
          activeMatrixModule = 'transition';
        }
        if (item.controlState === 'audio-consent') {
          const currentSong = currentControls.find((control) => control.fixtureKind === 'audio');
          if (!currentSong) throw new Error('SONG picker unavailable for privacy scenario');
          await assignFixtureFile(session, currentSong, false);
          currentControls = await discoverControls(session);
        }
        const control = currentControls.find((entry) => entry.id === item.subjectId);
        if (!control) throw new Error('discovered control is no longer in the inventory');
        const isPlayControl = control.label.replace(/\s+/g, ' ').trim().toUpperCase() === 'PLAY';
        const uploadedTrackLoadGeneration = control.fixtureKind === 'audio'
          ? await evalPage<number>(session, `window.__BMX_QA__?.snapshot?.().uploadedTrackLoadGeneration ?? -1`)
          : null;
        const timeline = await evalPage<TimelineReading>(session, `window.__BMX_QA__?.setVisualProofTimelinePosition?.(${position})`, 15_000);
        if (!timeline) throw new Error('shared timeline hook is unavailable');
        if (timeline.source !== 'AudioContext.currentTime') throw new Error(`invalid timeline source: ${timeline.source}`);
        timelineSource = timeline.source;
        beforeState = await elementState(session, control.id);
        const beforeShot = await capturePng(session, beforePath);
        if (control.fixtureKind === 'video' || control.fixtureKind === 'clips') {
          await evalPage(session, `window.__BMX_QA__?.releaseAllVisualProofClips?.()`, 30_000);
          activeMatrixModule = null;
        }
        const action = await exerciseControl(session, control);
        actionOk = Boolean(action?.ok);
        actionError = action?.error;
        if (uploadedTrackLoadGeneration !== null && actionOk) {
          const upload = await evalPage<{ uploadedTrackLoadGeneration: number }>(
            session,
            `window.__BMX_QA__?.waitForUploadedTrackLoad?.(${uploadedTrackLoadGeneration}, 10000)`,
            15_000,
            'observe SONG local-only load'
          );
          if (!(upload?.uploadedTrackLoadGeneration > uploadedTrackLoadGeneration)) {
            throw new Error('SONG -> LOCAL ONLY did not load the selected track');
          }
        }
        if (isPlayControl && actionOk) {
          const playback = await evalPage<{ playing: boolean }>(
            session,
            `window.__BMX_QA__?.waitForPlaying?.(10000)`,
            15_000,
            'observe PLAY transport start'
          );
          if (!playback?.playing) throw new Error('PLAY did not start the transport');
        }
        afterState = await elementState(session, control.id);
        const afterShot = await capturePng(session, afterPath);
        const changed = actionOk && JSON.stringify(beforeState) !== JSON.stringify(afterState);
        if (!changed) throw new Error(actionError ?? 'advertised control produced no observable outcome');
        evidence.push({
          itemId: item.id,
          before: beforePath,
          after: afterPath,
          timelinePositionSeconds: position,
          expectedOutcome: control.expectedOutcome,
          beforeState,
          afterState,
          changed,
          blackFrame: beforeShot.nonBlackPixelRatio <= 0.01 || afterShot.nonBlackPixelRatio <= 0.01,
          nonBlackPixelRatio: Math.min(beforeShot.nonBlackPixelRatio, afterShot.nonBlackPixelRatio),
          beforeContentHash: beforeShot.contentHash,
          afterContentHash: afterShot.contentHash,
          screenshotContentChanged: beforeShot.contentHash !== afterShot.contentHash,
          timeline: { ...timeline, source: timeline.source }
        });
        if (isPlayControl) {
          await evalPage(session, `window.__BMX_QA__?.stopTransport?.()`, 15_000, 'restore paused transport after PLAY proof');
        }
        if (control.fixtureKind === 'video' || control.fixtureKind === 'clips') {
          await evalPage(session, `window.__BMX_QA__?.releaseAllVisualProofClips?.()`, 30_000);
        }
      } else {
        beforeState = await evalPage(session, `window.__BMX_QA__?.prepareVisualProofBaseline?.(${JSON.stringify(item.id)})`, 15_000);
        const beforeTimeline = await evalPage<TimelineReading>(session, `window.__BMX_QA__?.setVisualProofTimelinePosition?.(${position})`, 15_000);
        if (!beforeTimeline || beforeTimeline.source !== 'AudioContext.currentTime') throw new Error('baseline timeline hook is unavailable');
        const beforeShot = await capturePng(session, beforePath, '[data-canvas-id="pgm"]');
        afterState = await evalPage(session, `window.__BMX_QA__?.applyVisualProofItem?.(${JSON.stringify(item.id)})`, 15_000);
        if (!afterState) throw new Error('module/preset/shader QA action returned no state');
        const timeline = await evalPage<TimelineReading>(session, `window.__BMX_QA__?.setVisualProofTimelinePosition?.(${position})`, 15_000);
        if (!timeline) throw new Error('shared timeline hook is unavailable');
        if (timeline.source !== 'AudioContext.currentTime') throw new Error(`invalid timeline source: ${timeline.source}`);
        timelineSource = timeline.source;
        if (Math.abs(timeline.transportSeconds - position) > 0.075) {
          throw new Error(`timeline missed fixed position ${position}: ${timeline.transportSeconds}`);
        }
        const afterShot = await capturePng(session, afterPath, '[data-canvas-id="pgm"]');
        const changed = JSON.stringify(beforeState) !== JSON.stringify(afterState);
        const beforeConfig = beforeState as { moduleId?: string; fixtureClipName?: string; currentSrc?: string; bypassed?: boolean; params?: Record<string, number> };
        const afterConfig = afterState as { moduleId?: string; fixtureClipName?: string; currentSrc?: string; bypassed?: boolean; params?: Record<string, number> };
        if (
          beforeConfig.moduleId !== afterConfig.moduleId ||
          beforeConfig.fixtureClipName !== afterConfig.fixtureClipName ||
          beforeConfig.fixtureClipName !== timeline.fixtureClipName ||
          beforeTimeline.requestedSeconds !== timeline.requestedSeconds
        ) throw new Error('module, fixture, or timeline changed across proof comparison');
        const intendedParameterDelta = Object.fromEntries(
          Object.keys(afterConfig.params ?? {}).flatMap((key) => {
            const before = beforeConfig.params?.[key];
            const after = afterConfig.params?.[key];
            return before !== undefined && after !== undefined && before !== after
              ? [[key, { before, after }]] : [];
          })
        );
        if (Object.keys(intendedParameterDelta).length < 1) throw new Error('proof action produced no intended parameter delta');
        evidence.push({
          itemId: item.id,
          before: beforePath,
          after: afterPath,
          timelinePositionSeconds: position,
          expectedOutcome: `${item.label} renders its registered effect at the shared timeline position`,
          beforeState,
          afterState,
          changed,
          blackFrame: beforeShot.nonBlackPixelRatio <= 0.01 || afterShot.nonBlackPixelRatio <= 0.01,
          nonBlackPixelRatio: Math.min(beforeShot.nonBlackPixelRatio, afterShot.nonBlackPixelRatio),
          beforeContentHash: beforeShot.contentHash,
          afterContentHash: afterShot.contentHash,
          screenshotContentChanged: beforeShot.contentHash !== afterShot.contentHash,
          timeline: { ...timeline, source: timeline.source },
          configuration: {
            moduleId: afterConfig.moduleId!,
            fixtureClipName: afterConfig.fixtureClipName!,
            beforeBypassed: beforeConfig.bypassed === true,
            afterBypassed: afterConfig.bypassed === true,
            beforeParams: beforeConfig.params ?? {},
            afterParams: afterConfig.params ?? {},
            intendedParameterDelta,
            clipSha256: mediaByName.get(afterConfig.fixtureClipName!)?.sha256 ?? '',
            currentSrc: afterConfig.currentSrc ?? ''
          }
        });
      }
    } catch (error) {
      await evalPage(session, `window.__BMX_QA__?.releaseAllVisualProofClips?.()`, 30_000).catch(() => null);
      throw new Error(`Effect matrix failed fast at ${item.id}: ${String(error)}`);
    }
  }

  if (activeMatrixModule) await evalPage(session, `window.__BMX_QA__?.releaseVisualProofRealClip?.(${JSON.stringify(activeMatrixModule)})`, 15_000);

  const cdpVersion = await session.send('Browser.getVersion') as {
    product?: string; revision?: string; userAgent?: string;
  };
  const commandLine = await session.send('Browser.getBrowserCommandLine') as { arguments?: string[] };
  const actualViewport = await evalPage<{ width: number; height: number; deviceScaleFactor: number }>(session,
    `({ width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio })`);
  if (JSON.stringify(actualViewport) !== JSON.stringify(FIXED_VISUAL_PROOF_VIEWPORT)) {
    captureErrors.push(`actual viewport mismatch: ${JSON.stringify(actualViewport)}`);
  }
  const errors = await evalPage<{ consoleErrors: string[]; uncaughtErrors: string[]; gpuErrors: string[] }>(
    session,
    `({
      consoleErrors: window.__BMX_PROOF_CONSOLE_ERRORS__ || [],
      uncaughtErrors: window.__BMX_PROOF_UNCAUGHT_ERRORS__ || [],
      gpuErrors: window.__BMX_PROOF_GPU_ERRORS__ || []
    })`
  );
  const gpu = await evalPage<VisualProofReport['environment']['gpu']>(
    session,
    'window.__BMX_PROOF_GPU_PROVENANCE__',
    10_000,
    'WebGPU adapter/device provenance'
  );
  if (!gpu) captureErrors.push('WebGPU adapter/device provenance was not captured from navigator.gpu.requestAdapter');

  const report: VisualProofReport = {
    schemaVersion: 1,
    manifest,
    environment: {
      browserName: cdpVersion.product?.split('/')[0] ?? 'unknown',
      browserVersion: cdpVersion.product?.split('/')[1] ?? 'unknown',
      headless: false,
      fixture: FIXED_VISUAL_PROOF_FIXTURE,
      viewport: FIXED_VISUAL_PROOF_VIEWPORT,
      timelineSource,
      timelinePositionsSeconds: FIXED_VISUAL_PROOF_TIMELINE_POSITIONS,
      cdpProduct: cdpVersion.product ?? '',
      cdpUserAgent: cdpVersion.userAgent ?? '',
      browserCommandLine: commandLine.arguments ?? [],
      gpu: gpu ?? {
        api: 'WebGPU', provenanceSource: 'navigator.gpu.requestAdapter', adapterInfoAvailable: false,
        vendor: '', architecture: '', device: '', description: '', isFallbackAdapter: null,
        deviceCreated: false, deviceLabel: '', deviceFeatures: [], softwareRenderer: false
      }
    },
    humanObservationAttestation: {
      observed: process.env.PHYSICAL_BROWSER_OBSERVED === '1',
      lagObserved: process.env.PHYSICAL_BROWSER_LAG_OBSERVED !== '0',
      operator: process.env.PHYSICAL_BROWSER_OPERATOR?.trim() ?? '',
      statement: 'Human-observed headed browser; this attestation is not machine-verifiable.'
    },
    provenance: {
      sourceDigest: await computeVisualProofSourceDigest(),
      buildDigest: await computeVisualProofBuildDigest(),
      catalogDigest: digestJson(manifest.items.filter((item) => item.kind !== 'control')),
      controlInventoryDigest: digestJson(manifest.items.filter((item) => item.kind === 'control')),
      captureNonce: crypto.randomUUID(),
      capturedAt: new Date().toISOString(),
      fixtureFiles: mediaMetadata
    },
    realMedia: {
      selectedVia: 'CLIP',
      assignedVia: 'serial QA target helper from one selected File object',
      videoExercise,
      audioExercise: {
        fileName: 'Redline (Remastered).mp3',
        relativePath: mediaByName.get('Redline (Remastered).mp3')!.relativePath,
        sha256: mediaByName.get('Redline (Remastered).mp3')!.sha256,
        size: mediaByName.get('Redline (Remastered).mp3')!.size,
        loadedVia: 'SONG -> LOCAL ONLY', volume: audioPlayback.after.volume,
        observationDurationMs: audioPlayback.observationDurationMs,
        contextStateBefore: audioPlayback.before.contextState, contextStateAfter: audioPlayback.after.contextState,
        contextTimeBefore: audioPlayback.before.contextCurrentTime, contextTimeAfter: audioPlayback.after.contextCurrentTime,
        mediaTimeBefore: audioPlayback.before.mediaCurrentTime, mediaTimeAfter: audioPlayback.after.mediaCurrentTime,
        rmsPeak: audioPlayback.rmsPeak, amplitudePeak: audioPlayback.amplitudePeak,
        currentSrc: audioPlayback.after.currentSrc, mediaPaused: audioPlayback.after.mediaPaused,
        mediaMuted: audioPlayback.after.mediaMuted
      },
      assignments: matrixAssignments,
      noNetwork: {
        requests: protocolCapture.requests.slice(realPhaseRequestStart),
        externalRequests: protocolCapture.requests.slice(realPhaseRequestStart).filter((url) => {
          try { return new URL(url).origin !== 'http://127.0.0.1:5174'; } catch { return true; }
        })
      },
      pausedBeforeEffectMatrix: pausedDiagnostics?.playing === false && pausedDiagnostics?.mediaPaused === true,
      maxSimultaneousDecoded,
      adjacentCrossFileDifferenceRatios
    },
    evidence,
    consoleErrors: [...(errors?.consoleErrors ?? []), ...protocolCapture.logs],
    uncaughtErrors: [...(errors?.uncaughtErrors ?? []), ...protocolCapture.exceptions],
    networkRequests: protocolCapture.requests,
    gpuErrors: errors?.gpuErrors ?? [],
    captureErrors
  };

  await Bun.write(REPORT_PATH, JSON.stringify(report, null, 2));
  const result = evaluateVisualProofReport(report);
  console.log(JSON.stringify({ report: REPORT_PATH, evidence: evidence.length, ...result }, null, 2));
  session.close();
  if (!result.passed) throw new Error(`Physical-browser capture completed with ${result.blockers.length} blocker(s)`);
});
