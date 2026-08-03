import { get } from 'svelte/store';
import { audioEngine } from '$lib/audio';
import { fetchManifestClipFiles, loadRackClipsFromFiles } from '$lib/media/loadRackClips';
import { tauriNativeSource } from '$lib/media/sources/TauriNativeSource';
import { canPlaceInRow, listCatalog } from '$lib/modules/catalog';
import { webGpuEngine } from '$lib/rendering/webgpu/WebGpuEngine';
import { SHADER_EFFECT_MODE } from '$lib/rendering/webgpu/shaders/moduleFx.wgsl';
import {
  DESKTOP_NATIVE_PROOF_RUNTIME,
  DESKTOP_NATIVE_PROOF_SCHEMA_VERSION,
  evaluateDesktopNativeProof
} from '$lib/qa/desktopNativeProofContract';
import { autoRandom, feel, intervalBeats, pgmSource } from '$lib/stores/pgm';
import { audioTimeline } from '$lib/transport';
import {
  applyModuleDrop,
  currentRackSlotForModule,
  rackBottom,
  rackTop,
  updateParam,
  videoLayers
} from '$lib/stores/rack';

const PROGRAM_FRAME_PREFIX = '__bsp_pgm__:';
const PREPARED_PROGRAM_FRAME_PREFIX = '__bsp_pgm_prepared__:';

async function wait(ms: number) {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('wait_desktop_proof', { durationMs: Math.max(0, Math.round(ms)) });
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadProofAudio() {
  const response = await fetch('/qa-media/manifest.json');
  if (!response.ok) throw new Error(`desktop proof manifest failed: ${response.status}`);
  const manifest = (await response.json()) as { audio?: string };
  if (!manifest.audio) throw new Error('desktop proof manifest has no audio');
  const audioResponse = await fetch(`/qa-media/${encodeURIComponent(manifest.audio)}`);
  if (!audioResponse.ok) throw new Error(`desktop proof audio failed: ${audioResponse.status}`);
  const blob = await audioResponse.blob();
  await audioEngine.loadAudioFile(
    new File([blob], manifest.audio, { type: blob.type || 'audio/mpeg' }),
    { hostedAnalysis: true }
  );
  await audioEngine.start();
  return manifest.audio;
}

async function sampleNativeCadence(durationMs: number) {
  const startedAt = performance.now();
  const deadline = startedAt + durationMs;
  // The headed proof may be launched behind the Codex window, where WKWebView
  // suppresses rAF. Drive the same authoritative timeline publication at the
  // display cadence so the proof measures native decode/cuts, not occlusion.
  while (performance.now() < deadline) {
    audioTimeline.publishFrame();
    await wait(16);
  }
  const native = await tauriNativeSource.getDecodeStats();
  const intervals = native.nativeCompositor.intervalsUs.map((value) => value / 1_000);
  const sorted = [...intervals].sort((a, b) => a - b);
  const quantile = (values: number[], fraction: number) =>
    values[Math.min(values.length - 1, Math.floor(values.length * fraction))] ?? null;
  const displayPeriodMs = quantile(sorted, 0.5);
  const observedDurationMs = performance.now() - startedAt;
  const expectedPresentations = displayPeriodMs && displayPeriodMs > 0
    ? Math.floor(observedDurationMs / displayPeriodMs)
    : 0;
  const droppedPresentations = Math.max(0, expectedPresentations - intervals.length);
  const cuts = native.nativeCompositor.cuts.map((cut) => ({
    sourceId: cut.sourceId,
    latencyMs: cut.latencyUs / 1_000,
    blackFrames: cut.blackFrames
  }));
  const completedLatencies = cuts.map((cut) => cut.latencyMs).sort((a, b) => a - b);
  const unresolvedCuts = native.nativeCompositor.pendingProgramSource ? 1 : 0;
  const elapsedSeconds = Math.max(native.elapsedMs / 1_000, 0.001);
  const sourceEntries = Object.entries(native.sources);
  const previewEntries = sourceEntries.filter(
    ([sourceId]) =>
      !sourceId.startsWith(PROGRAM_FRAME_PREFIX) &&
      !sourceId.startsWith(PREPARED_PROGRAM_FRAME_PREFIX)
  );
  const programEntries = sourceEntries.filter(([sourceId]) => sourceId.startsWith(PROGRAM_FRAME_PREFIX));
  const programProducedFrames = programEntries.reduce(
    (sum, [, source]) => sum + source.producedFrames,
    0
  );
  return {
    durationMs: observedDurationMs,
    samples: intervals.length,
    displayPeriodMs,
    expectedPresentations,
    droppedPresentations,
    estimatedDropRate: expectedPresentations > 0 ? droppedPresentations / expectedPresentations : null,
    p95IntervalMs: quantile(sorted, 0.95),
    p99IntervalMs: quantile(sorted, 0.99),
    maxIntervalMs: intervals.length > 0 ? Math.max(...intervals) : null,
    over34Ms: intervals.filter((value) => value > 34).length,
    stallsOver50Ms: intervals.filter((value) => value > 50).length,
    over100Ms: intervals.filter((value) => value > 100).length,
    pgmBlackFrames: native.nativeCompositor.pgmBlackFrames,
    cuts,
    completedCuts: cuts.length,
    unresolvedCuts,
    p95CutLatencyMs: quantile(completedLatencies, 0.95),
    maxCutLatencyMs: completedLatencies.length > 0 ? Math.max(...completedLatencies) : null,
    sourceCadence: {
      previews: Object.fromEntries(previewEntries.map(([sourceId, source]) => [sourceId, {
        producedFrames: source.producedFrames,
        framesPerSecond: source.producedFrames / elapsedSeconds,
        lastTimestampUs: source.lastTimestampUs,
        lastSequence: source.lastSequence
      }])),
      program: {
        producedFrames: programProducedFrames,
        framesPerSecond: programProducedFrames / elapsedSeconds,
        sourceCount: programEntries.length
      }
    }
  };
}

function nativeSurfaces(native: Awaited<ReturnType<typeof tauriNativeSource.getDecodeStats>>) {
  const entries = Object.entries(native.nativeCompositor.surfaces);
  return {
    previews: Object.fromEntries(entries.filter(([surfaceId]) => surfaceId !== 'pgm')),
    program: native.nativeCompositor.surfaces.pgm ?? null
  };
}

async function waitForNativeSurfaces(timeoutMs: number) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const native = await tauriNativeSource.getDecodeStats();
    const surfaces = nativeSurfaces(native);
    if (
      native.previewDecoderCount === 8 &&
      native.programDecoderActive &&
      Object.keys(surfaces.previews).length === 8 &&
      surfaces.program &&
      native.zeroCopyFrames > 0 &&
      native.iosurfaceImports > 0
    ) {
      return native;
    }
    await wait(100);
  }
  throw new Error('desktop proof timed out waiting for eight native previews and PGM');
}

async function verifyOneFrameEffectSwap() {
  const beforeTop = [...get(rackTop)];
  const beforeBottom = [...get(rackBottom)];
  const replacement = listCatalog().find(
    (module) => canPlaceInRow(module, 'top') && !beforeTop.includes(module.id) && !beforeBottom.includes(module.id)
  );
  if (!replacement) throw new Error('desktop proof found no compatible palette replacement');
  const expectedEffectMode = SHADER_EFFECT_MODE[replacement.shaderKey ?? replacement.id] ?? 0;
  const beforeNative = await tauriNativeSource.getDecodeStats();
  const clipNameBefore = get(videoLayers)['top-0']?.name ?? null;
  const effectBefore = beforeTop[0] ?? null;
  const changed = applyModuleDrop(
    { source: 'palette', moduleId: replacement.id },
    { row: 'top', index: 0 }
  );
  if (!changed) throw new Error(`desktop proof could not swap ${replacement.id} onto top-0`);
  let afterNative = beforeNative;
  const deadline = performance.now() + 500;
  while (performance.now() < deadline) {
    afterNative = await tauriNativeSource.getDecodeStats();
    const nativeSurface = afterNative.nativeCompositor.surfaces['top-0'];
    if (
      nativeSurface?.effectModuleId === replacement.id &&
      nativeSurface.effectMode === expectedEffectMode
    ) {
      break;
    }
    await wait(1);
  }
  const appliedSurface = afterNative.nativeCompositor.surfaces['top-0'];
  const nativeEffectApplied =
    appliedSurface?.effectModuleId === replacement.id &&
    appliedSurface.effectMode === expectedEffectMode;
  const beforeTimelineFrame = appliedSurface?.effectRequestedFrame ??
    beforeNative.nativeCompositor.presentedFrames;
  const afterTimelineFrame = appliedSurface?.effectAppliedFrame ??
    afterNative.nativeCompositor.presentedFrames;
  const requestedMix = 37;
  updateParam(replacement.id, 'mix', requestedMix);
  let paramsNative = afterNative;
  const paramsDeadline = performance.now() + 500;
  while (performance.now() < paramsDeadline) {
    paramsNative = await tauriNativeSource.getDecodeStats();
    if (paramsNative.nativeCompositor.surfaces['top-0']?.effectMix === requestedMix) break;
    await wait(1);
  }
  const paramsSurface = paramsNative.nativeCompositor.surfaces['top-0'];
  const nativeParamsApplied = paramsSurface?.effectMix === requestedMix;
  const paramsTimelineFrame = paramsSurface?.effectParamsAppliedFrame ??
    paramsNative.nativeCompositor.presentedFrames;
  const paramsRequestedFrame = paramsSurface?.effectParamsRequestedFrame ?? afterTimelineFrame;
  return {
    nativeEffectApplied,
    nativeParamsApplied,
    requestedMix,
    appliedMix: paramsSurface?.effectMix ?? null,
    replacementModuleId: replacement.id,
    slotId: 'top-0',
    clipNameBefore,
    clipNameAfter: get(videoLayers)['top-0']?.name ?? null,
    sourceBefore: 'top-0',
    sourceAfter: 'top-0',
    effectBefore,
    effectAfter: get(rackTop)[0] ?? null,
    beforeTimelineFrame,
    afterTimelineFrame,
    timelineFrameDelta: afterTimelineFrame - beforeTimelineFrame,
    paramsTimelineFrameDelta: paramsTimelineFrame - paramsRequestedFrame,
    previewOpenCountsBefore: Object.fromEntries(
      Object.entries(beforeNative.sources)
        .filter(([sourceId]) =>
          !sourceId.startsWith(PROGRAM_FRAME_PREFIX) &&
          !sourceId.startsWith(PREPARED_PROGRAM_FRAME_PREFIX)
        )
        .map(([sourceId, stats]) => [sourceId, stats.openCount])
    ),
    previewOpenCountsAfter: Object.fromEntries(
      Object.entries(paramsNative.sources)
        .filter(([sourceId]) =>
          !sourceId.startsWith(PROGRAM_FRAME_PREFIX) &&
          !sourceId.startsWith(PREPARED_PROGRAM_FRAME_PREFIX)
        )
        .map(([sourceId, stats]) => [sourceId, stats.openCount])
    )
  };
}

export async function runDesktopNativeProof(durationMs = 30_000) {
  document.documentElement.dataset.desktopProof = 'loading';
  const startedAt = new Date().toISOString();
  try {
    autoRandom.set(false);
    intervalBeats.set(1);
    feel.set(0);
    const files = await fetchManifestClipFiles(8);
    if (files.length !== 8) throw new Error(`desktop proof requires 8 clips; received ${files.length}`);
    const loaded = await loadRackClipsFromFiles(files);
    if (loaded.loaded !== 8) throw new Error(`desktop proof loaded ${loaded.loaded}/8 clips`);
    const audio = await loadProofAudio();

    const readyNative = await waitForNativeSurfaces(120_000);

    await wait(5_000);
    const initialSurfaces = nativeSurfaces(readyNative);
    await tauriNativeSource.resetDecodeStats();
    autoRandom.set(true);
    const cadence = await sampleNativeCadence(durationMs);
    autoRandom.set(false);
    const native = await tauriNativeSource.getDecodeStats();
    const surfaces = nativeSurfaces(native);
    const render = webGpuEngine.getRenderDiagnostics();
    const swap = await verifyOneFrameEffectSwap();
    const report = {
      schemaVersion: DESKTOP_NATIVE_PROOF_SCHEMA_VERSION,
      runtime: DESKTOP_NATIVE_PROOF_RUNTIME,
      startedAt,
      completedAt: new Date().toISOString(),
      audio,
      clips: files.map((file) => ({ name: file.name, size: file.size, type: file.type })),
      rack: { top: [...get(rackTop)], bottom: [...get(rackBottom)] },
      cadence,
      native,
      initialSurfaces,
      surfaces,
      render: {
        pgm: render.pgm ?? null,
        previews: Object.fromEntries(Object.entries(render).filter(([id]) => id !== 'pgm'))
      },
      swap
    };
    const evaluation = evaluateDesktopNativeProof(report);
    const completedReport = { ...report, evaluation };
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_desktop_proof_report', { report: JSON.stringify(completedReport, null, 2) });
    document.documentElement.dataset.desktopProof = evaluation.passed ? 'complete' : 'failed';
    return completedReport;
  } catch (error) {
    autoRandom.set(false);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack ?? null : null;
    const native = await tauriNativeSource.getDecodeStats();
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_desktop_proof_report', {
      report: JSON.stringify({
        schemaVersion: DESKTOP_NATIVE_PROOF_SCHEMA_VERSION,
        runtime: DESKTOP_NATIVE_PROOF_RUNTIME,
        startedAt,
        failedAt: new Date().toISOString(),
        errorMessage,
        errorStack,
        native,
        nativeSurfaces: nativeSurfaces(native)
      }, null, 2)
    });
    document.documentElement.dataset.desktopProof = 'failed';
    throw error;
  }
}
