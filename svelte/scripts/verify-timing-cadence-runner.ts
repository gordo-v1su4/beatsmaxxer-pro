import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  dispatchUserGesture,
  evalPage,
  navigateAndReady,
  waitForQaSongAndRhythm,
  withChrome,
} from "./cdp.ts";

const QA_URL =
  process.env.QA_URL ?? "http://127.0.0.1:5174/?qa=1&qaMidi=1";
const SAMPLE_MS = Number(process.env.TIMING_CADENCE_SAMPLE_MS ?? 60_000);
const SETTLE_MS = Number(process.env.TIMING_CADENCE_SETTLE_MS ?? 6_000);
const MAX_GAP_MS = Number(process.env.TIMING_CADENCE_MAX_GAP_MS ?? 150);
const TEST_VOLUME = Number(process.env.TIMING_CADENCE_VOLUME ?? 0);
const RESIDENT_PRELOAD = process.env.TIMING_RESIDENT_PRELOAD !== "0";
const REPORT = resolve(
  process.env.TIMING_CADENCE_REPORT ?? ".artifacts/timing-cadence.json",
);

type FeelName = "straight" | "swing" | "dotted";
type CutOrder = "balanced" | "random";
type Scenario = { feel: FeelName; cutOrder: CutOrder };

const ALL_SCENARIOS: Scenario[] = (["balanced", "random"] as const).flatMap(
  (cutOrder) =>
    (["straight", "swing", "dotted"] as const).map((feel) => ({
      feel,
      cutOrder,
    })),
);
const requestedScenarios = process.env.TIMING_CADENCE_SCENARIOS?.split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
const SCENARIOS = requestedScenarios?.length
  ? requestedScenarios.map((entry): Scenario => {
      const [feel, cutOrder] = entry.split(":");
      if (
        !["straight", "swing", "dotted"].includes(feel) ||
        !["balanced", "random"].includes(cutOrder)
      ) {
        throw new Error(
          `Invalid TIMING_CADENCE_SCENARIOS entry "${entry}"; use feel:balanced|random`,
        );
      }
      return {
        feel: feel as FeelName,
        cutOrder: cutOrder as CutOrder,
      };
    })
  : ALL_SCENARIOS;

interface SlotReport {
  slot: string;
  effect: string | null;
  renderUpdates: number;
  sourcePtsChanges: number;
  maxRenderGapMs: number;
  maxStaleMs: number;
  samplePath: string | null;
  states: Record<string, number>;
  gaps: Array<{
    gapMs: number;
    songTime: number;
    state: string;
    sourcePts: number | null;
  }>;
}

interface ScenarioReport {
  scenario: Scenario;
  durationMs: number;
  maxRafGapMs: number;
  rafGaps: Array<{ gapMs: number; songTime: number }>;
  longTasks: Array<{ startTime: number; duration: number }>;
  pgmSelections: Array<{ songTime: number; source: string }>;
  signal: {
    label: string;
    missing?: string;
    channels: Array<{ name: string; events: number }>;
  } | null;
  settings: {
    trigger: { source: string; channel: string };
    cutOrder?: string;
    preloadHeight: number;
    outputFps: number;
    master?: { stutter?: { groove?: string } };
  };
  capacity: { pending: number; ready: number; errors: number };
  scheduleBursts: number;
  slots: SlotReport[];
}

async function clickButtonInPage(
  session: Parameters<typeof evalPage>[0],
  label: string,
) {
  await evalPage(
    session,
    `(${function clickExactButton(target: string) {
      const button = Array.from(document.querySelectorAll("button")).find(
        (candidate) =>
          candidate.textContent?.replace(/\s+/g, " ").trim().toUpperCase() ===
          target.trim().toUpperCase(),
      );
      if (!button || button.disabled) {
        throw new Error(`Enabled button is unavailable: ${target}`);
      }
      button.click();
    }.toString()})(${JSON.stringify(label)})`,
    10_000,
    `click ${label}`,
  );
}

async function ensureTransportPlaying(session: Parameters<typeof evalPage>[0]) {
  await dispatchUserGesture(session);
  for (let attempt = 0; attempt < 3; attempt++) {
    await dispatchUserGesture(session);
    await evalPage(session, "window.__BMX_QA__?.startTransport?.()", 25_000);
    const playing = await evalPage<boolean>(
      session,
      "window.__BMX_QA__?.snapshot?.()?.playing",
      10_000,
    );
    if (playing) return;
    await Bun.sleep(500);
  }
  await evalPage(session, "window.__BMX_QA__?.waitForPlaying?.(15000)", 20_000);
}

async function openTimingWorkspace(session: Parameters<typeof evalPage>[0]) {
  const workspace = await evalPage<string>(
    session,
    `(${async function selectTimingWorkspace() {
      const tabs = document.querySelector('[aria-label="Workspace"]');
      const button = Array.from(
        tabs?.querySelectorAll<HTMLButtonElement>("button") ?? [],
      ).find(
        (candidate) => candidate.textContent?.trim().toUpperCase() === "TIMING",
      );
      if (!button || button.disabled) {
        throw new Error("Timing workspace tab is unavailable");
      }
      button.click();
      for (let attempt = 0; attempt < 200; attempt++) {
        const current = (window as any).__BMX_QA__?.timingSnapshot?.()
          ?.workspace;
        if (current === "timing") return current;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("Timing workspace did not activate");
    }.toString()})()`,
    15_000,
    "open Timing workspace",
  );
  if (workspace !== "timing")
    throw new Error("Timing workspace did not activate");
}

async function waitForTimingReady(
  session: Parameters<typeof evalPage>[0],
  timeoutMs = 240_000,
) {
  return evalPage<{
    slots: number;
    selected: number;
    preloadHeight: number;
    samplePaths: string[];
  }>(
    session,
    `(${async function waitUntilTimingReady(timeout: number) {
      const deadline = performance.now() + timeout;
      for (;;) {
        const snapshot = (window as any).__BMX_QA__?.timingSnapshot?.();
        const slots = Object.values(snapshot?.slots ?? {}) as Array<{
          ready?: boolean;
        }>;
        const selected = Object.values(snapshot?.selected ?? {}) as Array<{
          samplePath?: string;
        }>;
        if (
          snapshot?.workspace === "timing" &&
          snapshot.active === true &&
          snapshot.capacity?.pending === 0 &&
          slots.length >= 10 &&
          slots.every((slot) => slot.ready === true) &&
          selected.length === slots.length
        ) {
          return {
            slots: slots.length,
            selected: selected.length,
            preloadHeight: snapshot.preloadHeight,
            samplePaths: [
              ...new Set(selected.map((entry) => entry.samplePath)),
            ],
          };
        }
        if (snapshot?.capacity?.errors > 0) {
          throw new Error(
            `Timing preparation failed: ${JSON.stringify(snapshot.capacity)}`,
          );
        }
        if (performance.now() >= deadline) {
          throw new Error(
            `Timing did not become ready: ${JSON.stringify({
              workspace: snapshot?.workspace,
              active: snapshot?.active,
              capacity: snapshot?.capacity,
              slots: slots.length,
              selected: selected.length,
              preloadHeight: snapshot?.preloadHeight,
            })}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }.toString()})(${timeoutMs})`,
    timeoutMs + 10_000,
    "wait for Timing frame banks",
  );
}

async function waitForFrameLabMidi(
  session: Parameters<typeof evalPage>[0],
  timeoutMs = 90_000,
) {
  return evalPage<{
    label: string;
    channels: Array<{ name: string; events: number }>;
  }>(
    session,
    `(${async function waitUntilFrameLabMidi(timeout: number) {
      const deadline = performance.now() + timeout;
      for (;;) {
        const snapshot = (window as any).__BMX_QA__?.timingSnapshot?.();
        const signal = snapshot?.signal;
        const channelNames = new Set(
          (signal?.channels ?? []).map((channel: { name: string }) =>
            channel.name.trim().toLowerCase(),
          ),
        );
        if (
          !signal?.missing &&
          ["vocals", "synth", "bass"].every((name) => channelNames.has(name))
        ) {
          return signal;
        }
        if (performance.now() >= deadline) {
          throw new Error(
            `Frame Lab MIDI did not become ready: ${JSON.stringify(signal)}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }.toString()})(${timeoutMs})`,
    timeoutMs + 10_000,
    "wait for Frame Lab Timing MIDI",
  );
}

async function configureScenario(
  session: Parameters<typeof evalPage>[0],
  scenario: Scenario,
) {
  return evalPage<{
    feel: string;
    cutOrder: string;
    source: string;
    channel: string;
  }>(
    session,
    `(${async function configureTimingScenario(next: Scenario) {
      const waitFor = async <T extends Element>(selector: string) => {
        for (let attempt = 0; attempt < 100; attempt++) {
          const element = document.querySelector<T>(selector);
          if (element) return element;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error(`Timing control unavailable: ${selector}`);
      };
      const stutterSlot = await waitFor<HTMLButtonElement>(
        'button[aria-label^="PGM source 1:"]',
      );
      if (stutterSlot.disabled)
        throw new Error("Timing stutter slot is disabled");
      stutterSlot.click();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );

      const groove = await waitFor<HTMLSelectElement>(
        'select[aria-label="Stutter groove"]',
      );
      groove.value = next.feel;
      groove.dispatchEvent(new Event("change", { bubbles: true }));
      const order = await waitFor<HTMLSelectElement>(
        'select[aria-label="Timing program cut order"]',
      );
      order.value = next.cutOrder;
      order.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );

      const source = await waitFor<HTMLSelectElement>(
        'select[aria-label="Timing trigger source"]',
      );
      const channel = await waitFor<HTMLSelectElement>(
        'select[aria-label="Timing trigger channel"]',
      );
      return {
        feel: groove.value,
        cutOrder: order.value,
        source: source.value,
        channel: channel.value,
      };
    }.toString()})(${JSON.stringify(scenario)})`,
    15_000,
    `configure ${scenario.feel} ${scenario.cutOrder} Timing cadence`,
  );
}

async function sampleTimingCadence(
  ms: number,
  scenario: Scenario,
): Promise<ScenarioReport> {
  const qa = (window as any).__BMX_QA__;
  if (!qa) throw new Error("QA diagnostics are unavailable");
  const initial = qa.timingSnapshot();
  if (initial.workspace !== "timing" || !initial.active) {
    throw new Error("Active Timing workspace is required");
  }
  const slotIds = Object.keys(initial.slots).filter(
    (slot) => initial.slots[slot]?.ready,
  );
  if (slotIds.length < 10 || slotIds.some((slot) => !initial.selected[slot])) {
    throw new Error("A ready Timing source is required for every active slot");
  }

  const startedAt = performance.now();
  const longTasks: Array<{ startTime: number; duration: number }> = [];
  const observer =
    typeof PerformanceObserver !== "undefined"
      ? new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            longTasks.push({
              startTime: entry.startTime,
              duration: entry.duration,
            });
          }
        })
      : null;
  try {
    observer?.observe({ type: "longtask", buffered: true });
  } catch {
    // Long-task entries are optional in constrained Chromium runtimes.
  }

  const pgmSelections: Array<{ songTime: number; source: string }> = [];
  let lastPgm = qa.arrangementSnapshot().pgm as string;
  const stats = new Map(
    slotIds.map((slot) => [
      slot,
      {
        slot,
        effect: initial.selected[slot]?.effect ?? null,
        renderUpdates: 0,
        sourcePtsChanges: 0,
        maxRenderGapMs: 0,
        maxStaleMs: 0,
        samplePath: initial.selected[slot]?.samplePath ?? null,
        states: {} as Record<string, number>,
        gaps: [] as SlotReport["gaps"],
        lastTimelineFrameId: null as number | null,
        lastRenderAt: startedAt,
        lastPts: initial.selected[slot]?.pts ?? null,
      },
    ]),
  );
  let raf = 0;
  let previousRaf: number | null = null;
  let maxRafGapMs = 0;
  const rafGaps: ScenarioReport["rafGaps"] = [];
  const sample = (now: number) => {
    const snapshot = qa.timingSnapshot();
    const arrangement = qa.arrangementSnapshot();
    const songTime = arrangement.time;
    if (arrangement.pgm !== lastPgm) {
      lastPgm = arrangement.pgm;
      pgmSelections.push({ songTime, source: lastPgm });
    }
    if (previousRaf !== null) {
      const gapMs = Math.max(0, now - previousRaf);
      maxRafGapMs = Math.max(maxRafGapMs, gapMs);
      if (gapMs > 100 && rafGaps.length < 100) {
        rafGaps.push({ gapMs, songTime });
      }
    }
    previousRaf = now;
    for (const [slot, stat] of stats) {
      const render = snapshot.render[slot];
      const selected = snapshot.selected[slot];
      const live = snapshot.live[slot];
      const state = live?.state ?? "unknown";
      stat.states[state] = (stat.states[state] ?? 0) + 1;
      stat.samplePath = selected?.samplePath ?? stat.samplePath;
      stat.effect = selected?.effect ?? stat.effect;
      stat.maxStaleMs = Math.max(stat.maxStaleMs, now - stat.lastRenderAt);
      if (
        render &&
        render.timelineFrameId !== null &&
        render.timelineFrameId !== stat.lastTimelineFrameId
      ) {
        if (stat.lastTimelineFrameId !== null) {
          const gapMs = Math.max(0, now - stat.lastRenderAt);
          stat.maxRenderGapMs = Math.max(stat.maxRenderGapMs, gapMs);
          if (gapMs > 100 && stat.gaps.length < 100) {
            stat.gaps.push({
              gapMs,
              songTime,
              state,
              sourcePts: selected?.pts ?? null,
            });
          }
        }
        stat.lastTimelineFrameId = render.timelineFrameId;
        stat.lastRenderAt = now;
        stat.renderUpdates++;
      }
      if (selected?.pts !== undefined && selected.pts !== stat.lastPts) {
        stat.lastPts = selected.pts;
        stat.sourcePtsChanges++;
      }
    }
    raf = requestAnimationFrame(sample);
  };
  raf = requestAnimationFrame(sample);
  await new Promise((resolve) => setTimeout(resolve, ms));
  const endedAt = performance.now();
  cancelAnimationFrame(raf);
  observer?.disconnect();
  const final = qa.timingSnapshot();
  return {
    scenario,
    durationMs: ms,
    maxRafGapMs,
    rafGaps,
    longTasks: longTasks.filter(
      (entry) => entry.startTime >= startedAt && entry.startTime <= endedAt,
    ),
    pgmSelections,
    signal: final.signal,
    settings: final.settings,
    capacity: final.capacity,
    scheduleBursts: Object.values(final.schedules).reduce(
      (sum: number, schedule: any) => sum + Number(schedule.bursts ?? 0),
      0,
    ),
    slots: [...stats.values()].map(
      ({
        lastTimelineFrameId: _frame,
        lastRenderAt: _at,
        lastPts: _pts,
        ...stat
      }) => stat,
    ),
  };
}

await withChrome("verify-timing-cadence", 10_050, async (session) => {
  await navigateAndReady(session, QA_URL);
  await evalPage(
    session,
    "window.__BMX_QA__?.waitForClips?.(12, 90000)",
    100_000,
  );
  await waitForQaSongAndRhythm(session);
  await openTimingWorkspace(session);
  await clickButtonInPage(session, "LOAD REDLINE SONG + TRIGGERS");
  const frameLabMidiStartedAt = Date.now();
  const frameLabMidi = await waitForFrameLabMidi(session);
  const frameLabMidiReadyMs = Date.now() - frameLabMidiStartedAt;
  const initialReadyStartedAt = Date.now();
  const initialReady = await waitForTimingReady(session, 90_000);
  const initialReadyMs = Date.now() - initialReadyStartedAt;
  let residentReady: Awaited<ReturnType<typeof waitForTimingReady>> | null =
    null;
  let residentReadyMs: number | null = null;
  if (RESIDENT_PRELOAD) {
    const residentReadyStartedAt = Date.now();
    await clickButtonInPage(session, "LAPTOP · 540P");
    residentReady = await waitForTimingReady(session);
    residentReadyMs = Date.now() - residentReadyStartedAt;
  }
  await evalPage(
    session,
    `window.__BMX_QA__?.getEngine?.().audioEngine.setVolume(${JSON.stringify(TEST_VOLUME)})`,
    10_000,
    "mute Timing benchmark playback",
  );
  await ensureTransportPlaying(session);

  const hardware = await evalPage<{
    userAgent: string;
    platform: string;
    hardwareConcurrency: number;
    deviceMemory: number | null;
  }>(
    session,
    `({userAgent:navigator.userAgent,platform:navigator.platform,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory??null})`,
  );
  const reports: ScenarioReport[] = [];
  for (const scenario of SCENARIOS) {
    const configured = await configureScenario(session, scenario);
    if (
      configured?.feel !== scenario.feel ||
      configured.cutOrder !== scenario.cutOrder ||
      configured.source !== "midi" ||
      configured.channel !== "vocals-synth-bass"
    ) {
      throw new Error(
        `Failed to configure Timing scenario: ${JSON.stringify({ scenario, configured })}`,
      );
    }
    await Bun.sleep(SETTLE_MS);
    const report = await evalPage<ScenarioReport>(
      session,
      `(${sampleTimingCadence.toString()})(${SAMPLE_MS},${JSON.stringify(scenario)})`,
      SAMPLE_MS + 30_000,
      `sample ${scenario.feel} ${scenario.cutOrder} Timing cadence`,
    );
    if (!report)
      throw new Error(`No Timing cadence report for ${scenario.feel}`);
    reports.push(report);
  }

  const failures = reports.flatMap((report) => {
    const channelNames = new Set(
      (report.signal?.channels ?? []).map((channel) =>
        channel.name.trim().toLowerCase(),
      ),
    );
    const reportFailures: Array<Record<string, unknown>> = [];
    if (
      report.signal?.missing ||
      !["vocals", "synth", "bass"].every((name) => channelNames.has(name))
    ) {
      reportFailures.push({
        scenario: report.scenario,
        reason: "Frame Lab MIDI channels unavailable",
        signal: report.signal,
      });
    }
    if (
      report.settings.trigger.source !== "midi" ||
      report.settings.trigger.channel !== "vocals-synth-bass" ||
      report.settings.master?.stutter?.groove !== report.scenario.feel
    ) {
      reportFailures.push({
        scenario: report.scenario,
        reason: "Timing settings drifted",
        settings: report.settings,
      });
    }
    if (report.scheduleBursts === 0 || report.pgmSelections.length === 0) {
      reportFailures.push({
        scenario: report.scenario,
        reason: "MIDI did not drive Timing cuts",
        scheduleBursts: report.scheduleBursts,
        pgmSelections: report.pgmSelections.length,
      });
    }
    for (const slot of report.slots) {
      if (
        slot.maxRenderGapMs > MAX_GAP_MS ||
        slot.maxStaleMs > MAX_GAP_MS ||
        slot.renderUpdates < Math.floor((report.durationMs / 1000) * 10) ||
        (RESIDENT_PRELOAD &&
          slot.effect === "ramp" &&
          slot.samplePath !== "resident-frame-bank") ||
        (slot.effect === "stutter" &&
          slot.samplePath !== "cached-video-texture")
      ) {
        reportFailures.push({
          scenario: report.scenario,
          slot: slot.slot,
          maxRenderGapMs: slot.maxRenderGapMs,
          maxStaleMs: slot.maxStaleMs,
          renderUpdates: slot.renderUpdates,
          samplePath: slot.samplePath,
        });
      }
    }
    return reportFailures;
  });
  const result = {
    pass: failures.length === 0,
    hardware,
    residentPreload: RESIDENT_PRELOAD,
    preparation: {
      initialReadyMs,
      initialReady,
      frameLabMidiReadyMs,
      frameLabMidi,
      residentReadyMs,
      residentReady,
    },
    sampleMsPerScenario: SAMPLE_MS,
    maxAllowedGapMs: MAX_GAP_MS,
    reports,
    failures,
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await Bun.write(REPORT, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify(
      {
        pass: result.pass,
        report: REPORT,
        hardware,
        scenarios: reports.map(
          (report) => `${report.scenario.feel}:${report.scenario.cutOrder}`,
        ),
        failures,
      },
      null,
      2,
    ),
  );
  if (!result.pass) process.exitCode = 1;
});
