import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ensureTransportPlaying, evalPage, navigateAndReady, waitForQaSongAndRhythm, withChrome } from './cdp.ts';
import { evaluateInputLatency, type InputLatencySample } from './qa/inputLatency.ts';

// DIAGNOSTIC, not reduced-workload product acceptance. All cases retain twelve
// decoded sources, the same media identities, and the normal PGM/target preview.
const REPORT = resolve(process.env.GPU_TAIL_REPORT ?? '.artifacts/gpu-tail-diagnostic.json');
const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1';
const STEPS = 24, INTERVAL_MS = 80;
function installPhase(reduced: boolean, paused: boolean) {
  const qa = (window as any).__BMX_QA__;
  if (!qa?.getEngine || !qa?.eightVideoSnapshot || !qa?.timingSnapshot) throw new Error('Required QA API missing');
  const engine = qa.getEngine().webGpuEngine, device = engine.getDevice();
  const rack = qa.eightVideoSnapshot();
  if (!device || typeof device.queue.onSubmittedWorkDone !== 'function' || rack.decoderCount !== 12 ||
      document.hidden || qa.timingSnapshot().workspace !== 'perform' || qa.snapshot().playing === paused)
    throw new Error('Visible playing Perform with WebGPU and twelve decoders required');
  const slots = rack.slots.map((slot: any) => slot.canvasId);
  const targetId = 'top-0';
  for (const id of slots) if (!engine.setCanvasActive(id, !reduced || id === targetId)) throw new Error(`Binding missing: ${id}`);
  if (!engine.setCanvasActive('pgm', true)) throw new Error('PGM binding missing');
  const knob = document.querySelector<HTMLElement>('[data-bmx-proof-id="control-knob-transition-mix"]');
  if (!knob) throw new Error('Transition MIX control missing');
  const rect = knob.getBoundingClientRect();
  if (!rect.width || !rect.height) throw new Error('Target knob invisible');
  const diagnostics = () => engine.getRenderDiagnostics();
  const first = diagnostics()[targetId];
  if (!first?.hasVideo || first.effectModuleId !== 'transition') throw new Error('Target source unready');
  const identity = () => qa.eightVideoSnapshot().slots.map((slot: any) => ({
    slot: slot.canvasId, file: slot.fileName, source: slot.currentSrc, element: slot.elementIdentity,
    width: slot.videoWidth, height: slot.videoHeight,
  }));
  const initialIdentity = identity();
  const samples: Array<InputLatencySample & { encodeMs?: number; callbackAt?: number }> = [];
  const errors: string[] = [], stalls: Array<{ at: number; delayMs: number }> = [], longTasks: unknown[] = [];
  const apiCalls: Record<string, number> = {};
  const wrappedApis = ['submit', 'copyExternalImageToTexture', 'writeTexture', 'writeBuffer'].map(name => {
    const original = (device.queue as any)[name];
    if (typeof original !== 'function') throw new Error(`GPU queue API unavailable: ${name}`);
    apiCalls[name] = 0;
    (device.queue as any)[name] = function (...args: any[]) { apiCalls[name]++; return original.apply(this, args); };
    return { name, original };
  });
  let dragging = false, y0 = 0, value0 = 0, lastExpected = NaN;
  const down = (event: PointerEvent) => {
    dragging = true; y0 = event.clientY; value0 = Number(knob.getAttribute('aria-valuenow')); lastExpected = value0;
  };
  const move = (event: PointerEvent) => {
    if (!dragging || !(event.buttons & 1)) return;
    const expected = Math.round(Math.max(0, Math.min(100, value0 + (y0 - event.clientY) * 100 / 160)));
    if (expected === lastExpected) { errors.push('No value change'); return; }
    lastExpected = expected;
    samples.push({ expected, trusted: event.isTrusted, eventAt: event.timeStamp, capturedAt: performance.now(),
      previousFrame: diagnostics()[targetId]?.timelineFrameId, domAt: null, renderAt: null,
      renderedFrame: null, gpuCompleteAt: null });
  };
  const up = () => { dragging = false; };
  knob.addEventListener('pointerdown', down, true); knob.addEventListener('pointermove', move, true);
  knob.addEventListener('pointerup', up, true);
  const observer = new MutationObserver(() => {
    const value = Number(knob.getAttribute('aria-valuenow'));
    for (const sample of samples) if (sample.domAt === null && sample.expected === value) sample.domAt = performance.now();
  });
  observer.observe(knob, { attributes: true, attributeFilter: ['aria-valuenow'] });
  let lastTimer = performance.now();
  const timer = setInterval(() => {
    const at = performance.now(); stalls.push({ at, delayMs: Math.max(0, at - lastTimer - 10) }); lastTimer = at;
  }, 10);
  const supported = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask');
  const tasks = supported ? new PerformanceObserver(list => {
    for (const task of list.getEntries()) longTasks.push({ at: task.startTime, duration: task.duration });
  }) : null;
  tasks?.observe({ type: 'longtask' });
  const original = engine.renderAll;
  const wrapped = function (this: any, ...args: any[]) {
    const begin = performance.now(), result = original.apply(this, args), submitted = performance.now();
    const diag = diagnostics()[targetId];
    for (const sample of samples) {
      if (sample.renderAt !== null || !diag?.renderedThisFrame || diag.timelineFrameId <= sample.previousFrame ||
          Math.abs(diag.mix - sample.expected / 100) > .00001) continue;
      sample.renderAt = submitted; sample.renderedFrame = diag.timelineFrameId; sample.encodeMs = submitted - begin;
      void device.queue.onSubmittedWorkDone().then(() => { sample.gpuCompleteAt = performance.now(); },
        (error: unknown) => errors.push(`GPU completion error: ${String(error)}`));
    }
    return result;
  };
  engine.renderAll = wrapped;
  (window as any).__BMX_GPU_TAIL_PHASE__ = {
    samples,
    finish() {
      if (engine.renderAll !== wrapped) errors.push('Observer ownership changed');
      else engine.renderAll = original;
      clearInterval(timer); observer.disconnect(); tasks?.disconnect();
      for (const api of wrappedApis) (device.queue as any)[api.name] = api.original;
      knob.removeEventListener('pointerdown', down, true); knob.removeEventListener('pointermove', move, true); knob.removeEventListener('pointerup', up, true);
      const finalIdentity = identity(), finalRack = qa.eightVideoSnapshot();
      if (JSON.stringify(initialIdentity) !== JSON.stringify(finalIdentity)) errors.push('Media identity/dimensions changed');
      if (finalRack.decoderCount !== 12 || document.hidden || qa.snapshot().playing === paused) errors.push('Decoder count/visibility/playback changed');
      const render = diagnostics();
      const slotActivity = slots.map((id: string) => ({ id, skipReason: render[id]?.skipReason,
        frame: render[id]?.timelineFrameId, parameterPath: render[id]?.parameterPath,
        samplePath: render[id]?.samplePath, canvas: render[id]?.canvas, effectMode: render[id]?.effectMode }));
      if (reduced && slotActivity.some((slot: any) => slot.id !== targetId && slot.skipReason !== 'inactive'))
        errors.push('Reduced bindings were reactivated');
      return { samples, errors, stalls, longTasks, longTaskObserverSupported: !!supported, apiCalls,
        initialIdentity, finalIdentity, decoderCount: finalRack.decoderCount, slotActivity,
        pausedSources: finalRack.slots.filter((slot: any) => slot.paused).length,
        gpuFeatures: Array.from(device.features), audio: qa.getEngine().audioEngine.getProofPlaybackDiagnostics(),
        api: { setCanvasActive: typeof engine.setCanvasActive, queueCompletion: typeof device.queue.onSubmittedWorkDone } };
    },
  };
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
    direction: Number(knob.getAttribute('aria-valuenow')) >= 50 ? 1 : -1 };
}

const reports: unknown[] = [], browserErrors: unknown[] = [];
let failure: string | null = null, browserVersion: unknown;
try {
  await withChrome('diagnose-gpu-tail', 9850, async session => {
    session.on('Runtime.exceptionThrown', event => browserErrors.push(event));
    session.on('Runtime.consoleAPICalled', event => { if ((event as any).type === 'error') browserErrors.push(event); });
    browserVersion = await session.send('Browser.getVersion');
    await navigateAndReady(session, QA_URL);
    await evalPage(session, `(() => {
      const q=window.__BMX_QA__;if(!q?.waitForClips)throw new Error('Missing clips hook');
      q.getEngine().audioEngine.setVolume(0);return q.waitForClips(12,90000);
    })()`, 100_000);
    await waitForQaSongAndRhythm(session); await ensureTransportPlaying(session); await Bun.sleep(2000);
    for (const phase of [
      { name: 'full-cold', reduced: false, paused: false }, { name: 'full-warm', reduced: false, paused: false },
      { name: 'reduced-warm-diagnostic', reduced: true, paused: false }, { name: 'full-restored-warm', reduced: false, paused: false },
      { name: 'reduced-stopped-diagnostic', reduced: true, paused: true },
    ]) {
      if (phase.paused) { await evalPage(session, 'window.__BMX_QA__.stopTransport()'); await Bun.sleep(500); }
      const target = await evalPage<{ x: number; y: number; direction: number }>(session,
        `(${installPhase.toString()})(${phase.reduced},${phase.paused})`, 15_000);
      if (!target) throw new Error('Phase installation failed');
      await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x, y: target.y });
      await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', buttons: 1, clickCount: 1 });
      try {
        for (let step = 1; step <= STEPS; step++) {
          await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x,
            y: target.y + target.direction * step * 2, button: 'left', buttons: 1 });
          await Bun.sleep(INTERVAL_MS);
        }
      } finally {
        await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x,
          y: target.y + target.direction * STEPS * 2, button: 'left', buttons: 0, clickCount: 1 });
      }
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        if (await evalPage(session, `window.__BMX_GPU_TAIL_PHASE__.samples.length===24&&window.__BMX_GPU_TAIL_PHASE__.samples.every(s=>s.gpuCompleteAt!==null)`)) break;
        await Bun.sleep(50);
      }
      const evidence = await evalPage<any>(session, 'window.__BMX_GPU_TAIL_PHASE__.finish()');
      if (!evidence) throw new Error('Phase evidence missing');
      const evaluation = evaluateInputLatency(evidence.samples, STEPS, { p95Ms: 100, maxMs: 150 });
      reports.push({ ...phase, evaluation, evidence });
      await mkdir(dirname(REPORT), { recursive: true });
      await Bun.write(REPORT, JSON.stringify({ complete: false, reports, browserErrors, browserVersion }, null, 2));
      // Preserve failed cases before aborting; do not silently continue with a broken setup.
      if (!evaluation.pass || evidence.errors.length) throw new Error(`${phase.name}: incomplete or invalid phase`);
      await Bun.sleep(500);
    }
    await evalPage(session, `(() => {const q=window.__BMX_QA__;for(const slot of q.eightVideoSnapshot().slots)q.getEngine().webGpuEngine.setCanvasActive(slot.canvasId,true);q.stopTransport();})()`);
  });
} catch (error) { failure = error instanceof Error ? error.message : String(error); }
await mkdir(dirname(REPORT), { recursive: true });
await Bun.write(REPORT, JSON.stringify({ complete: true, diagnosticOnly: true, failure, browserVersion, browserErrors, reports }, null, 2));
console.log(JSON.stringify({ diagnosticOnly: true, failure, report: REPORT, cases: reports.length }));
if (failure || browserErrors.length) throw new Error('GPU tail diagnostic failed; inspect preserved report');
