import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ensureTransportPlaying, evalPage, navigateAndReady, screenshotPng, waitForQaSongAndRhythm, withChrome } from './cdp.ts';
import { evaluateInputLatency, type InputLatencySample } from './qa/inputLatency.ts';

const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1';
const MODULE = process.env.INPUT_LATENCY_MODULE ?? 'transition';
const REPORT = resolve(process.env.INPUT_LATENCY_REPORT ?? '.artifacts/input-latency.json');
const SCREENSHOT = REPORT.replace(/\.json$/i, '') + '.png';
function positive(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${name}`);
  return value;
}
const STEPS = positive('INPUT_LATENCY_STEPS', 24);
const INTERVAL_MS = positive('INPUT_LATENCY_INTERVAL_MS', 80);
const DEADLINE_MS = positive('INPUT_LATENCY_DEADLINE_MS', 2000);
const LIMITS = { p95Ms: positive('INPUT_LATENCY_P95_MS', 100), maxMs: positive('INPUT_LATENCY_MAX_MS', 150) };
if (!Number.isSafeInteger(STEPS) || STEPS < 10 || STEPS > 32 || INTERVAL_MS < 50)
  throw new Error('Use 10–32 drag steps, spaced at least 50ms to require each value to render');

// Installed only in the isolated acceptance browser. Observe the existing render
// owner after its real GPU submission; do not add an animation/render loop.
function installProbe(moduleId: string) {
  const qa = (window as any).__BMX_QA__;
  if (!qa?.getEngine || !qa?.snapshot || !qa?.eightVideoSnapshot || !qa?.timingSnapshot)
    throw new Error('Input-latency hooks unavailable');
  const engine = qa.getEngine().webGpuEngine, device = engine.getDevice();
  const state = qa.snapshot(), rack = qa.eightVideoSnapshot();
  if (!device || !state.webgpu || !state.playing || document.hidden ||
      qa.timingSnapshot().workspace !== 'perform' || rack.decoderCount !== 12 ||
      rack.slots.some((slot: any) => !slot.videoWidth || !slot.videoHeight || slot.readyState < 2))
    throw new Error('Visible playing Perform with twelve decoded sources required');
  const selector = `[data-bmx-proof-id="control-knob-${CSS.escape(moduleId)}-mix"]`;
  const knob = document.querySelector<HTMLElement>(selector);
  if (!knob) throw new Error(`MIX knob unavailable: ${moduleId}`);
  knob.scrollIntoView({ block: 'center', inline: 'center' });
  const rect = knob.getBoundingClientRect();
  if (!rect.width || !rect.height) throw new Error('MIX knob is hidden');
  const value = Number(knob.getAttribute('aria-valuenow'));
  const min = Number(knob.getAttribute('aria-valuemin')), max = Number(knob.getAttribute('aria-valuemax'));
  if (![value, min, max].every(Number.isFinite) || min !== 0 || max !== 100)
    throw new Error('Expected a finite 0–100 MIX control');
  const findRender = () => Object.values(engine.getRenderDiagnostics()).find((raw: any) =>
    raw.effectModuleId === moduleId && raw.bindingId !== 'pgm' && /^top-|^bottom-/.test(raw.bindingId)) as any;
  const first = findRender();
  if (!first || first.timelineFrameId === null || !first.hasVideo)
    throw new Error('Target preview has no decoded rendered frame');
  const samples: InputLatencySample[] = [], errors: string[] = [], longTasks: number[] = [], events: unknown[] = [];
  let startY = 0, startValue = value, dragging = false, lastExpected = value;
  const down = (event: PointerEvent) => {
    if (!event.isTrusted) { errors.push('Untrusted pointerdown'); return; }
    startY = event.clientY; startValue = Number(knob.getAttribute('aria-valuenow')); dragging = true;
  };
  const move = (event: PointerEvent) => {
    if (!dragging || !(event.buttons & 1)) return;
    // Rack module wrappers commit integer percentages (EffectModule/CompactModule).
    const expected = Math.round(Math.max(min, Math.min(max, startValue + (startY - event.clientY) * (max - min) / 160)));
    if (Math.abs(expected - lastExpected) < .001) { errors.push('Drag value did not change'); return; }
    lastExpected = expected;
    const previousFrame = findRender()?.timelineFrameId;
    if (!Number.isFinite(previousFrame)) errors.push('Missing pre-input rendered frame');
    samples.push({ trusted: event.isTrusted, expected, eventAt: event.timeStamp,
      capturedAt: performance.now(), previousFrame, domAt: null, renderAt: null,
      renderedFrame: null, gpuCompleteAt: null });
  };
  const up = () => { dragging = false; };
  const logEvent = (event: PointerEvent) => {
    if (events.length >= 150 || (!dragging && event.type !== 'pointerdown')) return;
    const record = { type: event.type, y: event.clientY, pointerId: event.pointerId,
      buttons: event.buttons, target: (event.target as Element)?.getAttribute?.('data-bmx-proof-id'),
      capture: false, value: knob.getAttribute('aria-valuenow') };
    events.push(record);
    queueMicrotask(() => { record.capture = knob.hasPointerCapture(event.pointerId); record.value = knob.getAttribute('aria-valuenow'); });
  };
  for (const type of ['pointerdown','pointermove','pointerup','pointercancel']) document.addEventListener(type, logEvent as EventListener, true);
  const domObserver = new MutationObserver(() => {
    const current = Number(knob.getAttribute('aria-valuenow'));
    events.push({ type: 'aria-update', value: current, at: performance.now() });
    for (const sample of samples) if (sample.domAt === null && Math.abs(current - sample.expected) < .001)
      sample.domAt = performance.now();
  });
  domObserver.observe(knob, { attributes: true, attributeFilter: ['aria-valuenow'] });
  knob.addEventListener('pointerdown', down, true);
  knob.addEventListener('pointermove', move, true);
  knob.addEventListener('pointerup', up, true);
  knob.addEventListener('pointercancel', up, true);
  const original = engine.renderAll;
  const wrapped = function (this: any, ...args: any[]) {
    const result = original.apply(this, args);
    const diag = findRender();
    for (const sample of samples) {
      if (sample.renderAt !== null || !diag || diag.renderedThisFrame !== true ||
          diag.timelineFrameId <= sample.previousFrame || Math.abs(diag.mix - sample.expected / 100) > .00001) continue;
      sample.renderAt = performance.now(); sample.renderedFrame = diag.timelineFrameId;
      void device.queue.onSubmittedWorkDone().then(() => { sample.gpuCompleteAt = performance.now(); },
        (error: unknown) => errors.push(`GPU completion rejected: ${String(error)}`));
    }
    return result;
  };
  engine.renderAll = wrapped;
  const supported = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask');
  const observer = supported ? new PerformanceObserver(list => {
    for (const entry of list.getEntries()) longTasks.push(entry.duration);
  }) : null;
  observer?.observe({ type: 'longtask' });
  const baseline = { decoderCount: rack.decoderCount, clips: rack.slots.map((slot: any) => slot.fileName),
    workspace: qa.timingSnapshot().workspace, audio: qa.getEngine().audioEngine.getProofPlaybackDiagnostics(),
    transportSeconds: state.transportSeconds };
  const probe = {
    samples, errors, longTasks, longTaskObserverSupported: !!supported, baseline,
    finish() {
      const ending = qa.snapshot(), endingRack = qa.eightVideoSnapshot();
      const audio = qa.getEngine().audioEngine.getProofPlaybackDiagnostics();
      if (!ending.playing || audio.contextState !== 'running' || audio.mediaPaused || document.hidden ||
          endingRack.decoderCount !== 12 || qa.timingSnapshot().workspace !== 'perform')
        errors.push('Playback, visibility, decoder count or workspace changed during drag');
      if (audio.contextCurrentTime <= baseline.audio.contextCurrentTime)
        errors.push('Audio clock failed to advance');
      if (engine.renderAll !== wrapped) errors.push('Render observer ownership changed');
      else engine.renderAll = original;
      domObserver.disconnect(); observer?.disconnect();
      knob.removeEventListener('pointerdown', down, true); knob.removeEventListener('pointermove', move, true);
      knob.removeEventListener('pointerup', up, true); knob.removeEventListener('pointercancel', up, true);
      for (const type of ['pointerdown','pointermove','pointerup','pointercancel']) document.removeEventListener(type, logEvent as EventListener, true);
      return { samples, errors, events, longTasks, longTaskObserverSupported: !!supported, baseline,
        ending: { decoderCount: endingRack.decoderCount, audio, transportSeconds: ending.transportSeconds } };
    },
  };
  (window as any).__BMX_INPUT_LATENCY_PROBE__ = probe;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
    direction: value >= 50 ? 1 : -1, value, bindingId: first.bindingId };
}

type Evidence = { samples: InputLatencySample[]; errors: string[]; [key: string]: unknown };
let evidence: Evidence | null = null, failure: string | null = null, browserVersion: unknown = null;
const browserErrors: unknown[] = [];
try {
  await withChrome('verify-input-latency', 9790, async session => {
    session.on('Runtime.exceptionThrown', event => browserErrors.push(event));
    session.on('Runtime.consoleAPICalled', event => {
      if ((event as { type?: string }).type === 'error') browserErrors.push(event);
    });
    browserVersion = await session.send('Browser.getVersion');
    await navigateAndReady(session, QA_URL);
    await evalPage(session, `(() => {
      const qa=window.__BMX_QA__;
      if(!qa?.waitForClips||!qa?.getEngine)throw new Error('Required QA hooks missing');
      qa.getEngine().audioEngine.setVolume(0); return qa.waitForClips(12,90000);
    })()`, 100_000, 'wait for twelve sources and mute audio');
    await waitForQaSongAndRhythm(session);
    await ensureTransportPlaying(session);
    await Bun.sleep(2000);
    const target = await evalPage<{ x: number; y: number; direction: number }>(session,
      `(${installProbe.toString()})(${JSON.stringify(MODULE)})`, 15_000, 'install passive input/render observer');
    if (!target) throw new Error('Input target unavailable');
    try {
      await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x, y: target.y });
      await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', buttons: 1, clickCount: 1 });
      for (let step = 1; step <= STEPS; step++) {
        await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x,
          y: target.y + target.direction * step * 2, button: 'left', buttons: 1 });
        await Bun.sleep(INTERVAL_MS);
      }
    } finally {
      await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x,
        y: target.y + target.direction * STEPS * 2, button: 'left', buttons: 0, clickCount: 1 });
    }
    const deadline = Date.now() + DEADLINE_MS;
    while (Date.now() < deadline) {
      const complete = await evalPage<boolean>(session, `(() => {
        const p=window.__BMX_INPUT_LATENCY_PROBE__;
        return p.samples.length===${STEPS}&&p.samples.every(s=>s.domAt!==null&&s.renderAt!==null&&s.gpuCompleteAt!==null);
      })()`, 5000, 'wait for bounded input coverage');
      if (complete) break;
      await Bun.sleep(50);
    }
    evidence = await evalPage<Evidence>(session, 'window.__BMX_INPUT_LATENCY_PROBE__.finish()', 10_000, 'finish and restore passive observers');
    if (!evidence) throw new Error('Missing drag evidence');
    await mkdir(dirname(SCREENSHOT), { recursive: true });
    await screenshotPng(session, SCREENSHOT);
  });
} catch (error) { failure = error instanceof Error ? error.message : String(error); }
const evaluation = evaluateInputLatency(evidence?.samples ?? [], STEPS, LIMITS);
const pass = failure === null && browserErrors.length === 0 && (evidence?.errors.length ?? 1) === 0 && evaluation.pass;
await mkdir(dirname(REPORT), { recursive: true });
await Bun.write(REPORT, JSON.stringify({ pass, failure, browserErrors, browserVersion, screenshot: SCREENSHOT, url: QA_URL,
  module: MODULE, steps: STEPS, intervalMs: INTERVAL_MS, deadlineMs: DEADLINE_MS, limits: LIMITS,
  evaluation, evidence,
  limitations: ['Trusted CDP-generated pointer events measure browser delivery, not physical mouse hardware latency',
    'Encoded-frame timing is after the existing renderAll GPU queue submission, not compositor presentation',
    'GPU completion may include other queued work and does not prove visible pixels',
    'Controlled 80ms default move spacing tests sustained drag with every intended value covered; faster coalesced input needs a separate contract',
    'This gate exercises a Perform MIX control with twelve fixtures; Timing and other control classes need separate scenarios'],
}, null, 2));
console.log(JSON.stringify({ pass, report: REPORT, failure, evaluation }, null, 2));
if (!pass) throw new Error('Input latency acceptance failed; inspect report');
