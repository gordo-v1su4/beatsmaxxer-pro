import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  ensureTransportPlaying,
  evalPage,
  navigateAndReady,
  waitForQaSongAndRhythm,
  withChrome,
} from "./cdp.ts";

// This runner owns the playback gesture below. Boot-time qaAutoplay can leave
// HTMLMediaElement.play() pending before CDP has a chance to provide one,
// pinning the splash at "Starting playback" and hiding the cadence result.
const QA_URL = process.env.QA_URL ?? "http://127.0.0.1:5174/?qa=1";
const SAMPLE_MS = Number(process.env.PERFORM_LOOP_SAMPLE_MS ?? 60_000);
const SETTLE_MS = Number(process.env.PERFORM_LOOP_SETTLE_MS ?? 6_000);
const MAX_GAP_MS = Number(process.env.PERFORM_LOOP_MAX_GAP_MS ?? 150);
const MIN_LOOPS = Number(process.env.PERFORM_LOOP_MIN_LOOPS ?? 3);
const TEST_VOLUME = Number(process.env.PERFORM_LOOP_VOLUME ?? 0);
const REPORT = resolve(
  process.env.PERFORM_LOOP_REPORT ?? ".artifacts/perform-loop-cadence.json",
);

type ClipOrder = "linear" | "random";
type FeelName = "straight" | "swing" | "dotted";
type Scenario = { order: ClipOrder; feel: FeelName };

const ALL_SCENARIOS: Scenario[] = (["linear", "random"] as const).flatMap(
  (order) =>
    (["straight", "swing", "dotted"] as const).map((feel) => ({ order, feel })),
);
const requestedScenarios = process.env.PERFORM_LOOP_SCENARIOS?.split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
const SCENARIOS = requestedScenarios?.length
  ? requestedScenarios.map((entry): Scenario => {
      const [feel, order] = entry.split(":");
      if (
        !["straight", "swing", "dotted"].includes(feel) ||
        !["linear", "random"].includes(order)
      ) {
        throw new Error(
          `Invalid PERFORM_LOOP_SCENARIOS entry "${entry}"; use feel:order`,
        );
      }
      return { feel: feel as FeelName, order: order as ClipOrder };
    })
  : ALL_SCENARIOS;

interface SlotCadence {
  slot: string;
  module: string;
  callbacks: number;
  loops: number;
  swaps: number;
  durationSeconds: number;
  leadingGapMs: number;
  trailingGapMs: number;
  maxGapMs: number;
  maxCallbackGapMs: number;
  maxLoopGapMs: number;
  maxLoopCallbackGapMs: number;
  cachedSeams: number;
  cachedSeamSamples: number;
  cachedSeamPtsChanges: number;
  maxCachedSeamStaleMs: number;
  trailingCachedSeamRun: number | null;
  cachedSeamRuns: Array<{
    index: number;
    samples: number;
    ptsChanges: number;
    maxStaleMs: number;
    startedSongTime: number;
  }>;
  droppedFrames: number;
  gaps: Array<{
    gapMs: number;
    callbackGapMs: number;
    presentedFramesDelta: number;
    mediaTime: number;
    songTime: number;
    seeking: boolean;
    pgmModule: string;
    coveredLoopWrap: boolean;
    cachedSeamRun: number | null;
  }>;
  loopGaps: Array<{
    gapMs: number;
    callbackGapMs: number;
    presentedFramesDelta: number;
    mediaTime: number;
    songTime: number;
    coveredLoopWrap: boolean;
    cachedSeamRun: number | null;
  }>;
  cachedSeamGaps: Array<{
    gapMs: number;
    sourceFramePts: number;
    songTime: number;
  }>;
}

interface ScenarioReport {
  scenario: Scenario;
  durationMs: number;
  startedAtSongTime: number;
  endedAtSongTime: number;
  maxRafGapMs: number;
  rafGaps: Array<{ gapMs: number; songTime: number; pgmModule: string }>;
  longTasks: Array<{ startTime: number; duration: number }>;
  longAnimationFrames: Array<{
    startTime: number;
    duration: number;
    blockingDuration: number;
    scripts: Array<{
      sourceURL: string;
      functionName: string;
      invokerType: string;
      duration: number;
      executionStart: number;
      forcedStyleAndLayoutDuration: number;
      pauseDuration: number;
    }>;
  }>;
  pgmSelections: Array<{ songTime: number; source: string }>;
  slots: SlotCadence[];
}

async function configureScenario(
  session: Parameters<typeof evalPage>[0],
  scenario: Scenario,
) {
  const configured = await evalPage<{
    order: string;
    feel: string;
    interval: string;
  }>(
    session,
    `(${async function configurePerformScenario(next: Scenario) {
      const order = document.querySelector<HTMLSelectElement>(
        'select[aria-label="Clip order"]',
      );
      if (!order) throw new Error("Clip order control is unavailable");
      order.value = next.order;
      order.dispatchEvent(new Event("change", { bubbles: true }));

      const rail = document.querySelector('[data-bmx-pgm-rail]');
      const findButton = (label: string) =>
        Array.from(rail?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
          (button) => button.textContent?.trim() === label && !button.disabled,
        );
      if (!findButton("1BT")) {
        throw new Error("PGM cadence controls are unavailable: PGM rail is closed");
      }
      const interval = findButton("1BT");
      const feelLabel = { straight: "STR8", swing: "SWNG", dotted: "DOT" }[
        next.feel
      ];
      const feel = findButton(feelLabel);
      if (!interval || !feel)
        throw new Error("PGM cadence controls are unavailable");
      interval.click();
      await Promise.resolve();
      findButton(feelLabel)?.click();
      await Promise.resolve();
      const appliedFeel = ([
        ["STR8", "straight"],
        ["SWNG", "swing"],
        ["DOT", "dotted"],
      ] as const).find(([label]) =>
        findButton(label)?.className.includes("border-current/30"),
      )?.[1] ?? "";
      return {
        order: order.value,
        feel: appliedFeel,
        interval: findButton("1BT")?.textContent?.trim() ?? "",
      };
    }.toString()})(${JSON.stringify(scenario)})`,
    10_000,
    `configure ${scenario.feel} ${scenario.order}`,
  );
  if (
    configured?.order !== scenario.order ||
    configured.feel !== scenario.feel ||
    configured.interval !== "1BT"
  ) {
    throw new Error(
      `Failed to configure scenario: ${JSON.stringify({ scenario, configured })}`,
    );
  }
}

async function samplePerformLoops(
  ms: number,
  scenario: Scenario,
): Promise<ScenarioReport> {
  const qa = (window as any).__BMX_QA__;
  if (!qa) throw new Error("QA diagnostics are unavailable");
  if (qa.timingSnapshot().workspace !== "perform") {
    throw new Error("Perform workspace is required");
  }
  const { videoPool, audioEngine, webGpuEngine } = qa.getEngine();
  const initial = qa.eightVideoSnapshot();
  if (initial.slots.length !== 12 || initial.decoderCount !== 12) {
    throw new Error("A decoded twelve-slot rack is required");
  }
  const startedAt = performance.now();
  const startedAtSongTime = qa.arrangementSnapshot().time;
  const longTasks: Array<{ startTime: number; duration: number }> = [];
  const longAnimationFrames: ScenarioReport["longAnimationFrames"] = [];
  const longTaskObserver =
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
    longTaskObserver?.observe({ type: "longtask", buffered: true });
  } catch {
    // Some constrained Chromium runtimes omit the longtask entry type.
  }
  const longAnimationFrameObserver =
    typeof PerformanceObserver !== "undefined" &&
    PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame")
      ? new PerformanceObserver((list) => {
          for (const raw of list.getEntries() as any) {
            if (longAnimationFrames.length >= 100) break;
            longAnimationFrames.push({
              startTime: raw.startTime,
              duration: raw.duration,
              blockingDuration: raw.blockingDuration ?? 0,
              scripts: Array.from(raw.scripts ?? []).map((script: any) => ({
                sourceURL: script.sourceURL ?? "",
                functionName: script.functionName ?? "",
                invokerType: script.invokerType ?? "",
                duration: script.duration ?? 0,
                executionStart: script.executionStart ?? 0,
                forcedStyleAndLayoutDuration:
                  script.forcedStyleAndLayoutDuration ?? 0,
                pauseDuration: script.pauseDuration ?? 0,
              })),
            });
          }
        })
      : null;
  longAnimationFrameObserver?.observe({
    type: "long-animation-frame",
    buffered: true,
  });
  const pgmSelections: Array<{ songTime: number; source: string }> = [];
  const unsubscribePgm = audioEngine.subscribePgmSelection((source: string) => {
    pgmSelections.push({ songTime: qa.arrangementSnapshot().time, source });
  });
  const stats = initial.slots
    // These modules intentionally repeat, hold, jump, or alter source time.
    // The ordinary cadence gate measures decoder presentation only.
    .filter(
      (slot: any) =>
        !["speedramp", "stutter", "timesampler"].includes(slot.moduleId),
    )
    .map((slot: any) => ({
      slot: slot.canvasId,
      module: slot.moduleId,
      video: videoPool.get(slot.canvasId) as HTMLVideoElement,
      callback: 0,
      active: true,
      callbacks: 0,
      loops: 0,
      swaps: 0,
      startedAt,
      previousNow: null as number | null,
      previousPresentationTime: null as number | null,
      previousPresentedFrames: null as number | null,
      previousMediaTime: null as number | null,
      leadingGapMs: 0,
      maxGapMs: 0,
      maxCallbackGapMs: 0,
      maxLoopGapMs: 0,
      maxLoopCallbackGapMs: 0,
      cachedSeams: 0,
      cachedSeamSamples: 0,
      cachedSeamPtsChanges: 0,
      maxCachedSeamStaleMs: 0,
      cachedSeamActive: false,
      cachedSeamLastPts: null as number | null,
      cachedSeamLastChangeAt: null as number | null,
      cachedSeamRuns: [] as SlotCadence["cachedSeamRuns"],
      droppedFrames: 0,
      droppedBefore: 0,
      gaps: [] as SlotCadence["gaps"],
      loopGaps: [] as SlotCadence["loopGaps"],
      cachedSeamGaps: [] as SlotCadence["cachedSeamGaps"],
    }));

  const watch = (stat: (typeof stats)[number], video: HTMLVideoElement) => {
    stat.video = video;
    stat.droppedBefore = video.getVideoPlaybackQuality().droppedVideoFrames;
    const decoded = (now: number, metadata: VideoFrameCallbackMetadata) => {
      if (!stat.active || stat.video !== video) return;
      if (stat.previousNow === null) {
        const presentationTime = Number.isFinite(metadata.presentationTime)
          ? metadata.presentationTime
          : now;
        stat.leadingGapMs = Math.max(0, now - stat.startedAt);
        stat.previousNow = now;
        stat.previousPresentationTime = presentationTime;
        stat.previousPresentedFrames = metadata.presentedFrames;
        stat.previousMediaTime = metadata.mediaTime;
        stat.callbacks++;
        stat.callback = video.requestVideoFrameCallback(decoded);
        return;
      }
      const callbackGapMs = Math.max(0, now - stat.previousNow);
      const presentationTime = Number.isFinite(metadata.presentationTime)
        ? metadata.presentationTime
        : now;
      const presentedFramesDelta = Math.max(
        1,
        metadata.presentedFrames -
          (stat.previousPresentedFrames ?? metadata.presentedFrames - 1),
      );
      // If the main thread misses N callbacks while the compositor presents N
      // frames, divide the presentation interval across those frames. A true
      // held frame still has delta=1 and retains the full interval.
      const gapMs =
        Math.max(
          0,
          presentationTime -
            (stat.previousPresentationTime ?? presentationTime),
        ) / presentedFramesDelta;
      const looped =
        stat.previousMediaTime !== null &&
        metadata.mediaTime + 0.1 < stat.previousMediaTime;
      const coveredLoopWrap =
        webGpuEngine.getRenderDiagnostics()[stat.slot]?.coveredLoopWrap === true;
      const cachedSeamRun = stat.cachedSeamActive
        ? stat.cachedSeamRuns.length - 1
        : null;
      stat.callbacks++;
      stat.maxGapMs = Math.max(stat.maxGapMs, gapMs);
      stat.maxCallbackGapMs = Math.max(stat.maxCallbackGapMs, callbackGapMs);
      if ((gapMs > 100 || callbackGapMs > 100) && stat.gaps.length < 100) {
        stat.gaps.push({
          gapMs,
          callbackGapMs,
          presentedFramesDelta,
          mediaTime: metadata.mediaTime,
          songTime: qa.arrangementSnapshot().time,
          seeking: video.seeking,
          pgmModule: qa.snapshot().pgmModule,
          coveredLoopWrap,
          cachedSeamRun,
        });
      }
      if (looped) {
        stat.loops++;
        stat.maxLoopGapMs = Math.max(stat.maxLoopGapMs, gapMs);
        stat.maxLoopCallbackGapMs = Math.max(
          stat.maxLoopCallbackGapMs,
          callbackGapMs,
        );
        stat.loopGaps.push({
          gapMs,
          callbackGapMs,
          presentedFramesDelta,
          mediaTime: metadata.mediaTime,
          songTime: qa.arrangementSnapshot().time,
          coveredLoopWrap,
          cachedSeamRun,
        });
      }
      stat.previousNow = now;
      stat.previousPresentationTime = presentationTime;
      stat.previousPresentedFrames = metadata.presentedFrames;
      stat.previousMediaTime = metadata.mediaTime;
      stat.callback = video.requestVideoFrameCallback(decoded);
    };
    stat.callback = video.requestVideoFrameCallback(decoded);
  };

  for (const stat of stats) watch(stat, stat.video);
  let raf = 0;
  let previousRaf: number | null = null;
  let maxRafGapMs = 0;
  const rafGaps: ScenarioReport["rafGaps"] = [];
  const checkSources = (now: number) => {
    if (previousRaf !== null) {
      const gapMs = Math.max(0, now - previousRaf);
      maxRafGapMs = Math.max(maxRafGapMs, gapMs);
      if (gapMs > 100 && rafGaps.length < 100) {
        rafGaps.push({
          gapMs,
          songTime: qa.arrangementSnapshot().time,
          pgmModule: qa.snapshot().pgmModule,
        });
      }
    }
    previousRaf = now;
    const renderDiagnostics = webGpuEngine.getRenderDiagnostics();
    for (const stat of stats) {
      const render = renderDiagnostics[stat.slot];
      const seamActive =
        render?.coveredLoopWrap === true &&
        Number.isFinite(render.sourceFramePts);
      if (seamActive) {
        const sourceFramePts = render.sourceFramePts as number;
        stat.cachedSeamSamples++;
        if (!stat.cachedSeamActive) {
          stat.cachedSeams++;
          stat.cachedSeamActive = true;
          stat.cachedSeamLastPts = sourceFramePts;
          stat.cachedSeamLastChangeAt = now;
          stat.cachedSeamRuns.push({
            index: stat.cachedSeamRuns.length,
            samples: 1,
            ptsChanges: 0,
            maxStaleMs: 0,
            startedSongTime: qa.arrangementSnapshot().time,
          });
        } else if (sourceFramePts !== stat.cachedSeamLastPts) {
          const gapMs = Math.max(
            0,
            now - (stat.cachedSeamLastChangeAt ?? now),
          );
          stat.maxCachedSeamStaleMs = Math.max(
            stat.maxCachedSeamStaleMs,
            gapMs,
          );
          stat.cachedSeamPtsChanges++;
          const run = stat.cachedSeamRuns.at(-1)!;
          run.samples++;
          run.ptsChanges++;
          run.maxStaleMs = Math.max(run.maxStaleMs, gapMs);
          if (gapMs > 100 && stat.cachedSeamGaps.length < 100) {
            stat.cachedSeamGaps.push({
              gapMs,
              sourceFramePts,
              songTime: qa.arrangementSnapshot().time,
            });
          }
          stat.cachedSeamLastPts = sourceFramePts;
          stat.cachedSeamLastChangeAt = now;
        } else {
          const staleMs = Math.max(
            0,
            now - (stat.cachedSeamLastChangeAt ?? now),
          );
          stat.maxCachedSeamStaleMs = Math.max(
            stat.maxCachedSeamStaleMs,
            staleMs,
          );
          const run = stat.cachedSeamRuns.at(-1)!;
          run.samples++;
          run.maxStaleMs = Math.max(run.maxStaleMs, staleMs);
        }
      } else if (stat.cachedSeamActive) {
        stat.cachedSeamActive = false;
        stat.cachedSeamLastPts = null;
        stat.cachedSeamLastChangeAt = null;
      }
      const current = videoPool.get(stat.slot) as HTMLVideoElement | undefined;
      if (!current || current === stat.video) continue;
      stat.video.cancelVideoFrameCallback(stat.callback);
      stat.droppedFrames += Math.max(
        0,
        stat.video.getVideoPlaybackQuality().droppedVideoFrames -
          stat.droppedBefore,
      );
      stat.swaps++;
      stat.previousNow = null;
      stat.previousPresentationTime = null;
      stat.previousPresentedFrames = null;
      stat.previousMediaTime = null;
      stat.cachedSeamActive = false;
      stat.cachedSeamLastPts = null;
      stat.cachedSeamLastChangeAt = null;
      watch(stat, current);
    }
    raf = requestAnimationFrame(checkSources);
  };
  raf = requestAnimationFrame(checkSources);

  await new Promise((resolve) => setTimeout(resolve, ms));
  const endedAt = performance.now();
  cancelAnimationFrame(raf);
  unsubscribePgm();
  longTaskObserver?.disconnect();
  longAnimationFrameObserver?.disconnect();
  for (const stat of stats) {
    stat.active = false;
    stat.video.cancelVideoFrameCallback(stat.callback);
  }
  return {
    scenario,
    durationMs: ms,
    startedAtSongTime,
    endedAtSongTime: qa.arrangementSnapshot().time,
    maxRafGapMs,
    rafGaps,
    longTasks: longTasks.filter(
      (entry) => entry.startTime >= startedAt && entry.startTime <= endedAt,
    ),
    longAnimationFrames: longAnimationFrames.filter(
      (entry) => entry.startTime >= startedAt && entry.startTime <= endedAt,
    ),
    pgmSelections,
    slots: stats.map(
      ({
        video,
        callback: _callback,
        active: _active,
        startedAt: _startedAt,
        previousNow,
        previousPresentationTime: _previousPresentationTime,
        previousPresentedFrames: _previousPresentedFrames,
        previousMediaTime: _previousMediaTime,
        cachedSeamActive,
        cachedSeamLastPts: _cachedSeamLastPts,
        cachedSeamLastChangeAt: _cachedSeamLastChangeAt,
        droppedBefore,
        ...stat
      }: any) => ({
        ...stat,
        durationSeconds: video.duration,
        trailingGapMs:
          previousNow === null ? ms : Math.max(0, endedAt - previousNow),
        trailingCachedSeamRun: cachedSeamActive
          ? stat.cachedSeamRuns.length - 1
          : null,
        maxGapMs: stat.maxGapMs,
        droppedFrames:
          stat.droppedFrames +
          Math.max(
            0,
            video.getVideoPlaybackQuality().droppedVideoFrames - droppedBefore,
          ),
      }),
    ),
  };
}

await withChrome("verify-perform-loop-cadence", 9650, async (session) => {
  await navigateAndReady(session, QA_URL);
  await evalPage(
    session,
    "window.__BMX_QA__?.waitForClips?.(12, 45000)",
    55_000,
  );
  await waitForQaSongAndRhythm(session);
  await evalPage(
    session,
    `window.__BMX_QA__?.getEngine?.().audioEngine.setVolume(${JSON.stringify(TEST_VOLUME)})`,
    10_000,
    "mute cadence verification",
  );
  await ensureTransportPlaying(session);

  const reports: ScenarioReport[] = [];
  for (const scenario of SCENARIOS) {
    // Every comparison starts from the same song range. A matrix longer than
    // the QA song must not accidentally fold a transport loop into only the
    // later feel/order combinations.
    await evalPage(
      session,
      "window.__BMX_QA__?.getEngine?.().audioEngine.seek(0)",
      10_000,
      `reset transport for ${scenario.feel} ${scenario.order}`,
    );
    await ensureTransportPlaying(session);
    await configureScenario(session, scenario);
    // Let the schedule change and first PGM cycle settle before measuring.
    // CDP function compilation and the first source cut are setup, not source
    // presentation cadence; leadingGapMs still records sampler attachment.
    await Bun.sleep(SETTLE_MS);
    const report = await evalPage<ScenarioReport>(
      session,
      `(${samplePerformLoops.toString()})(${SAMPLE_MS},${JSON.stringify(scenario)})`,
      SAMPLE_MS + 30_000,
      `sample ${scenario.feel} ${scenario.order} Perform loop cadence`,
    );
    if (!report)
      throw new Error(
        `No cadence report for ${scenario.feel} ${scenario.order}`,
      );
    reports.push(report);
    // Preserve completed evidence if a later long-running scenario or the
    // browser process is interrupted. The final write below replaces this
    // checkpoint with the evaluated pass/fail result.
    await mkdir(dirname(REPORT), { recursive: true });
    await Bun.write(
      REPORT,
      JSON.stringify(
        {
          complete: false,
          sampleMsPerScenario: SAMPLE_MS,
          minimumLoops: MIN_LOOPS,
          maxAllowedGapMs: MAX_GAP_MS,
          reports,
        },
        null,
        2,
      ),
    );
  }

  const failures = reports.flatMap((report) =>
    report.slots.flatMap((slot) => {
      const uncovered = (gap: {
        gapMs: number;
        coveredLoopWrap: boolean;
        cachedSeamRun: number | null;
      }) => {
        if (gap.gapMs <= MAX_GAP_MS) return false;
        if (!gap.coveredLoopWrap || gap.cachedSeamRun === null) return true;
        const seam = slot.cachedSeamRuns[gap.cachedSeamRun];
        return !seam || seam.ptsChanges === 0 || seam.maxStaleMs > MAX_GAP_MS;
      };
      const uncoveredSourceGaps = slot.gaps.filter(uncovered);
      const uncoveredLoopGaps = slot.loopGaps.filter(uncovered);
      const trailingSeam = slot.trailingCachedSeamRun === null
        ? null
        : slot.cachedSeamRuns[slot.trailingCachedSeamRun];
      const trailingCovered = !!trailingSeam &&
        trailingSeam.ptsChanges > 0 &&
        trailingSeam.maxStaleMs <= MAX_GAP_MS;
      const reasons = [
        ...(slot.loops < MIN_LOOPS ? [`only ${slot.loops} decoder loops`] : []),
        ...(slot.cachedSeams < MIN_LOOPS
          ? [`only ${slot.cachedSeams} rendered cached seams`]
          : []),
        ...(slot.cachedSeamPtsChanges < slot.cachedSeams
          ? ["cached seam did not advance"]
          : []),
        ...(uncoveredSourceGaps.length
          ? [`${uncoveredSourceGaps.length} uncovered source gaps`]
          : []),
        ...(uncoveredLoopGaps.length
          ? [`${uncoveredLoopGaps.length} uncovered decoder loop gaps`]
          : []),
        ...(slot.trailingGapMs > MAX_GAP_MS && !trailingCovered
          ? [`trailing decoder gap ${slot.trailingGapMs.toFixed(1)}ms`]
          : []),
      ];
      return reasons.length
        ? [
            {
              scenario: report.scenario,
              slot: slot.slot,
              module: slot.module,
              loops: slot.loops,
              cachedSeams: slot.cachedSeams,
              maxGapMs: slot.maxGapMs,
              maxLoopGapMs: slot.maxLoopGapMs,
              maxCachedSeamStaleMs: slot.maxCachedSeamStaleMs,
              reasons,
            },
          ]
        : [];
    }),
  );
  const result = {
    complete: true,
    pass: failures.length === 0,
    sampleMsPerScenario: SAMPLE_MS,
    minimumLoops: MIN_LOOPS,
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
        scenarios: reports.map(
          (report) => `${report.scenario.feel}:${report.scenario.order}`,
        ),
        failures: result.failures,
      },
      null,
      2,
    ),
  );
  if (!result.pass) process.exitCode = 1;
});
