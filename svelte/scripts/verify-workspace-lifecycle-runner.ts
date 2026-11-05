import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ensureTransportPlaying, evalPage, navigateAndReady, waitForQaSongAndRhythm, withChrome, type CdpSession } from './cdp.ts';

// A separate gate: test:local does not currently run this. Uses production UI
// navigation and read-only QA diagnostics; never writes workspace stores.
const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1&qaMidi=1';
const REPORT = resolve(process.env.WORKSPACE_LIFECYCLE_REPORT ?? '.artifacts/workspace-lifecycle.json');
const CYCLES = positiveInteger('WORKSPACE_LIFECYCLE_CYCLES', 3);
const SAMPLE_MS = positiveInteger('WORKSPACE_LIFECYCLE_SAMPLE_MS', 2500);
const READY_MS = positiveInteger('WORKSPACE_LIFECYCLE_READY_MS', 240_000);
const BACKGROUND = process.env.WORKSPACE_LIFECYCLE_BACKGROUND === '1';
if (SAMPLE_MS < 1000) throw new Error('Use at least 1000ms observations');

function positiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${name}`);
  return value;
}

type Workspace = 'perform' | 'timing';
type Snapshot = {
  view: string; workspace: Workspace; active: boolean; playing: boolean;
  time: number; duration: number; rate: number; contextState: string; contextTime: number;
  mediaTime: number; mediaPaused: boolean;
  decoderCount: number; documentVideoCount: number; canvasCount: number;
  usedBytes: number; budgetBytes: number; pending: number; assets: number;
  readySlots: number; slots: number; hidden: boolean; visibleMonitor: boolean;
  render: Record<string, { renderCount: number; timelineFrameId: number | null }>;
};

// Serialized into the browser. Keep all dependencies local to this function.
function readSnapshot(): Snapshot {
  const qa = (window as any).__BMX_QA__;
  if (!qa?.snapshot || !qa?.timingSnapshot || !qa?.eightVideoSnapshot || !qa?.getEngine)
    throw new Error('Lifecycle QA hooks unavailable');
  const state = qa.snapshot(), timing = qa.timingSnapshot(), rack = qa.eightVideoSnapshot();
  const engine = qa.getEngine();
  if (!engine.webGpuEngine.getDevice() || !state.webgpu) throw new Error('Real WebGPU device required');
  const audio = engine.audioEngine.getProofPlaybackDiagnostics();
  const arrange = document.querySelector('.arrange-workspace');
  const view = arrange ? 'arrange' : document.querySelector('.timing-workspace') ? 'timing' : 'perform';
  const slots = Object.values(timing.slots ?? {}) as Array<{ ready?: boolean }>;
  if (!Number.isFinite(state.transportSeconds) || !Number.isFinite(audio.contextCurrentTime) ||
      !Number.isFinite(timing.usedBytes) || !Number.isFinite(timing.capacity?.pending) ||
      !Number.isFinite(timing.budgetBytes) || !Number.isFinite(audio.mediaDurationSeconds) ||
      !Number.isFinite(audio.mediaCurrentTime) || !audio.currentSrc || audio.mediaDurationSeconds <= 0)
    throw new Error('Incomplete lifecycle diagnostics');
  const render = Object.fromEntries(Object.entries(timing.render ?? {}).map(([id, raw]) => {
    const value = raw as any;
    return [id, { renderCount: value.renderCount ?? 0, timelineFrameId: value.timelineFrameId ?? null }];
  }));
  return {
    view, workspace: timing.workspace, active: timing.active, playing: state.playing,
    time: state.transportSeconds, duration: audio.mediaDurationSeconds,
    rate: 1,
    contextState: audio.contextState, contextTime: audio.contextCurrentTime,
    mediaTime: audio.mediaCurrentTime, mediaPaused: audio.mediaPaused,
    decoderCount: rack.decoderCount, documentVideoCount: rack.documentVideoCount,
    canvasCount: document.querySelectorAll('canvas').length,
    usedBytes: timing.usedBytes, budgetBytes: timing.budgetBytes, pending: timing.capacity.pending,
    assets: timing.assets.length, readySlots: slots.filter(slot => slot.ready).length,
    slots: rack.slots.length, hidden: document.hidden,
    visibleMonitor: Array.from(document.querySelectorAll('canvas')).some(canvas => {
      const parent = canvas.closest(view === 'arrange' ? '.am-screen' : '.main-viewer');
      const rect = canvas.getBoundingClientRect();
      return !!parent && rect.width > 0 && rect.height > 0;
    }), render,
  };
}

async function snapshot(session: CdpSession) {
  const result = await evalPage<Snapshot>(session, `(${readSnapshot.toString()})()`, 10_000, 'read lifecycle diagnostics');
  if (!result) throw new Error('Lifecycle snapshot missing');
  return result;
}

async function clickButton(session: CdpSession, label: string, workspace = false) {
  const result = await evalPage<boolean>(session, `(${function click(label: string, workspace: boolean) {
    const scope = workspace ? document.querySelector('[aria-label="Workspace"]') : document;
    const button = Array.from(scope?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find(candidate => candidate.textContent?.trim().toUpperCase() === label.toUpperCase());
    if (!button || button.disabled) throw new Error(`Button unavailable: ${label}`);
    button.click();
    return true;
  }.toString()})(${JSON.stringify(label)},${workspace})`, 15_000, `click ${label}`, { userGesture: true });
  if (result !== true) throw new Error(`Button did not activate: ${label}`);
}

async function ready(session: CdpSession, workspace: Workspace, view: string = workspace) {
  const deadline = Date.now() + READY_MS;
  let last: Snapshot | undefined;
  while (Date.now() < deadline) {
    last = await snapshot(session);
    const error = await evalPage<string | null>(session, `(() => {
      const s=window.__BMX_QA__.timingSnapshot();
      const error=Object.values(s.status??{}).find(v=>v?.state==='error');
      return error?JSON.stringify(error):null;
    })()`, 10_000, 'check Timing preparation errors');
    if (workspace === 'timing' && error) throw new Error(`Timing preparation error: ${error}`);
    if (last.view === view && last.workspace === workspace && last.active === (workspace === 'timing') &&
        last.pending === 0 && last.slots >= 10 && last.decoderCount === last.slots &&
        (workspace !== 'timing' || last.readySlots === last.slots)) return last;
    await Bun.sleep(200);
  }
  throw new Error(`Workspace failed to converge: ${JSON.stringify(last)}`);
}

type Observation = { label: string; elapsedMs: number; before: Snapshot; after: Snapshot };
const observations: Observation[] = [];
const baselines = new Map<string, Snapshot>();

function checkResources(label: string, state: Snapshot) {
  if (state.usedBytes > state.budgetBytes || state.pending !== 0)
    throw new Error(`${label}: unconverged or over-budget cache`);
  const key = `${state.workspace}:${state.view}`;
  const baseline = baselines.get(key);
  if (!baseline) { baselines.set(key, state); return; }
  for (const field of ['decoderCount', 'documentVideoCount', 'canvasCount', 'assets', 'usedBytes'] as const) {
    if (state[field] > baseline[field])
      throw new Error(`${label}: ${field} grew from ${baseline[field]} to ${state[field]}`);
  }
}

async function observe(session: CdpSession, label: string, workspace: Workspace, view: string) {
  await ready(session, workspace, view);
  // Allow IntersectionObserver to deactivate the CSS-hidden rack before measuring.
  await Bun.sleep(350);
  const before = await snapshot(session), started = Date.now();
  checkResources(label, before);
  while (Date.now() - started < SAMPLE_MS) {
    await Bun.sleep(250);
    const current = await snapshot(session);
    if (current.view !== view || current.workspace !== workspace || current.active !== (workspace === 'timing') ||
        !current.playing || current.mediaPaused || current.contextState !== 'running' || current.hidden)
      throw new Error(`${label}: playback/ownership/visibility changed: ${JSON.stringify(current)}`);
  }
  const after = await snapshot(session), elapsedMs = Date.now() - started;
  observations.push({ label, elapsedMs, before, after });
  checkResources(label, after);
  if (after.contextTime - before.contextTime < SAMPLE_MS / 2000)
    throw new Error(`${label}: AudioContext did not advance`);
  let mediaMoved = after.mediaTime - before.mediaTime;
  if (mediaMoved < 0) mediaMoved += after.duration;
  if (mediaMoved < SAMPLE_MS / 2000)
    throw new Error(`${label}: song media did not advance`);
  // The fixture may wrap at song end; normalize one or more full-song wraps.
  let moved = after.time - before.time;
  if (moved < 0 && after.duration > 0) moved += after.duration;
  if (moved < SAMPLE_MS / 2000 * before.rate || moved > elapsedMs / 1000 * before.rate + 1)
    throw new Error(`${label}: playhead froze or jumped (${moved}s in ${elapsedMs}ms)`);
  // Arrange blits PGM without exposing its own render counter. Assert its
  // source advances; physical visual proof must still check the final blit.
  if (!before.render.pgm || !after.render.pgm ||
      before.render.pgm.timelineFrameId === null || after.render.pgm.timelineFrameId === null ||
      after.render.pgm.timelineFrameId <= before.render.pgm.timelineFrameId ||
      (view === 'arrange' && !after.visibleMonitor))
    throw new Error(`${label}: program source stopped rendering or Arrange monitor is hidden`);
  if (view === 'arrange') {
    for (const id of Object.keys(before.render).filter(id => /^(top|bottom)-\d+$/.test(id))) {
      if (after.render[id]?.timelineFrameId !== before.render[id].timelineFrameId)
        throw new Error(`${label}: hidden preview still rendering: ${id}`);
    }
  }
}

async function backgroundRoundtrip(session: CdpSession, workspace: Workspace) {
  const info = await session.send('Target.getTargetInfo') as { targetInfo?: { targetId?: string } };
  const original = info.targetInfo?.targetId;
  if (!original) throw new Error('Background test cannot identify original target');
  const created = await session.send('Target.createTarget', { url: 'about:blank' }) as { targetId?: string };
  if (!created.targetId) throw new Error('Background target unavailable');
  try {
    await session.send('Target.activateTarget', { targetId: created.targetId });
    await Bun.sleep(1000);
    if (!(await snapshot(session)).hidden) throw new Error('Browser did not actually background the app');
    await Bun.sleep(2000);
  } finally {
    await session.send('Target.activateTarget', { targetId: original });
    await session.send('Target.closeTarget', { targetId: created.targetId });
  }
  // Do not call startTransport/resume here: production lifecycle must recover itself.
  await observe(session, `${workspace}:background-return`, workspace, workspace);
}

let failure: string | null = null;
const browserErrors: unknown[] = [];
try {
  await withChrome('verify-workspace-lifecycle', 9730, async session => {
    session.on('Runtime.exceptionThrown', event => browserErrors.push(event));
    session.on('Runtime.consoleAPICalled', event => {
      const message = event as { type?: string; args?: unknown[] };
      if (message.type === 'error') browserErrors.push(message);
    });
    await navigateAndReady(session, QA_URL);
    await evalPage(session, `(() => {
      const qa=window.__BMX_QA__;
      if(!qa?.waitForClips||!qa?.stopTransport||!qa?.startTransport)throw new Error('Required QA hooks missing');
      return qa.waitForClips(12,90000);
    })()`, 100_000, 'wait for twelve loaded sources');
    await waitForQaSongAndRhythm(session);
    await evalPage(session, 'window.__BMX_QA__.stopTransport()');
    await clickButton(session, 'TIMING', true);
    await clickButton(session, 'LOAD REDLINE SONG + TRIGGERS');
    await ready(session, 'timing');
    await clickButton(session, 'LAPTOP · 540P');
    await ready(session, 'timing');
    await evalPage(session, 'window.__BMX_QA__.getEngine().audioEngine.setVolume(0)');
    // Cycle zero establishes warm baselines; subsequent cycles expose accumulation.
    for (let cycle = 0; cycle < CYCLES; cycle++) {
      for (const workspace of ['perform', 'timing'] as const) {
        await evalPage(session, 'window.__BMX_QA__.stopTransport()');
        if ((await snapshot(session)).playing) throw new Error('Transport failed to stop');
        await clickButton(session, workspace, true);
        await ready(session, workspace);
        await ensureTransportPlaying(session);
        await observe(session, `${cycle}:${workspace}`, workspace, workspace);
        await clickButton(session, 'ARRANGE', true);
        await observe(session, `${cycle}:${workspace}:arrange`, workspace, 'arrange');
        await clickButton(session, workspace, true);
        await observe(session, `${cycle}:${workspace}:return`, workspace, workspace);
        if (BACKGROUND && cycle === CYCLES - 1) await backgroundRoundtrip(session, workspace);
      }
    }
    await evalPage(session, 'window.__BMX_QA__.stopTransport()');
    if (browserErrors.length) throw new Error(`Browser emitted ${browserErrors.length} errors`);
  });
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  const result = {
    pass: failure === null, repeatConvergenceCovered: CYCLES >= 2,
    failure, browserErrors, url: QA_URL, cycles: CYCLES, sampleMs: SAMPLE_MS,
    background: BACKGROUND ? 'real target activation required' : 'not tested; set WORKSPACE_LIFECYCLE_BACKGROUND=1 on a headed browser',
    limitations: ['Checks exposed rack decoder/cache counts, not browser-wide GPU allocations or decoder internals',
      'Does not directly count RAF subscribers; verifies observable renderer ownership and convergence',
      'Silent playback diagnostics prove clock/context continuity, not physical audio quality',
      'Arrange monitor checks visibility and advancing PGM source; final monitor blit requires visual proof',
      'No input-latency or effect-fidelity assertion; run cadence and physical visual gates separately'],
    observations,
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await Bun.write(REPORT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ pass: result.pass, report: REPORT, failure, observations: observations.length }));
}
if (failure) throw new Error(failure);
