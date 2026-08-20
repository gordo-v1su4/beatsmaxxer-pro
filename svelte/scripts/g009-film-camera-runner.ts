import { dispatchUserGesture, evalPage, navigateAndReady, withChrome } from './cdp.ts';
import { MODULE_PRESETS } from '../src/lib/modules/presets';
import { SHADER_EFFECT_MODE } from '../src/lib/rendering/webgpu/shaders/moduleFx.wgsl';

const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR ?? `${import.meta.dir}/../.artifacts`;

/** Default-rack film + camera modules for G009. */
const G009_MODULES = ['leak', 'punch', 'mirror', 'shake', 'orbit', 'prism'] as const;

type PresetReport = {
  moduleId: string;
  presetId: string;
  presetTitle: string;
  passed: boolean;
  expectedMode: number;
  effectMode?: number;
  effectModuleId?: string;
  hasVideo?: number;
  samplePath?: string;
  mix?: number;
  uniformHash?: number;
  beatMoved: boolean;
  params: Record<string, number>;
};

await withChrome('g009-film-camera', 9962, async (session) => {
  await navigateAndReady(session, QA_URL);
  await evalPage(session, `window.__BMX_QA__?.waitForClips?.(8, 45000)`, 55_000);
  await dispatchUserGesture(session);
  for (let attempt = 0; attempt < 3; attempt++) {
    await evalPage(session, `window.__BMX_QA__?.startTransport?.()`, 25_000);
    const playing = await evalPage<boolean>(session, 'window.__BMX_QA__?.snapshot?.()?.playing', 10_000);
    if (playing) break;
    await dispatchUserGesture(session);
    await Bun.sleep(500);
  }
  await evalPage(session, `window.__BMX_QA__?.waitForPlaying?.(15000)`, 20_000);

  const reports: PresetReport[] = [];

  for (const moduleId of G009_MODULES) {
    const expectedMode = SHADER_EFFECT_MODE[moduleId];
    const presets = MODULE_PRESETS[moduleId] ?? [];
    for (const preset of presets) {
      const presetId = `preset:${moduleId}:${preset.n}`;
      await evalPage(session, `window.__BMX_QA__?.applyVisualProofItem(${JSON.stringify(presetId)})`, 20_000);
      await evalPage(session, `window.__BMX_QA__?.cutEightVideoPgm(${JSON.stringify(moduleId)}, 250)`, 20_000);

      const report = await evalPage<PresetReport>(
        session,
        `(async () => {
          const qa = window.__BMX_QA__;
          const moduleId = ${JSON.stringify(moduleId)};
          const presetId = ${JSON.stringify(presetId)};
          const presetTitle = ${JSON.stringify(preset.title)};
          const expectedMode = ${expectedMode};
          const beat0 = qa.snapshot().beat;
          await new Promise((r) => setTimeout(r, 900));
          const snap = qa.snapshot();
          const pgm = snap.render?.pgm ?? {};
          const mix = snap.params?.[moduleId]?.mix;
          const videoOk =
            pgm.hasVideo === 1 ||
            pgm.samplePath === 'external-texture' ||
            pgm.samplePath === 'cached-video-texture';
          const modeOk = pgm.effectMode === expectedMode && pgm.effectModuleId === moduleId;
          const beatMoved = Number(snap.beat) > Number(beat0);
          return {
            moduleId,
            presetId,
            presetTitle,
            passed: videoOk && modeOk && beatMoved && Number(mix) > 0,
            expectedMode,
            effectMode: pgm.effectMode,
            effectModuleId: pgm.effectModuleId,
            hasVideo: pgm.hasVideo,
            samplePath: pgm.samplePath,
            mix,
            uniformHash: pgm.uniformHash,
            beatMoved,
            params: snap.params?.[moduleId] ?? {}
          };
        })()`,
        15_000
      );
      reports.push(report);
    }
  }

  const byModule = Object.fromEntries(
    G009_MODULES.map((moduleId) => [
      moduleId,
      {
        total: reports.filter((r) => r.moduleId === moduleId).length,
        passed: reports.filter((r) => r.moduleId === moduleId && r.passed).length
      }
    ])
  );

  const report = {
    passed: reports.every((r) => r.passed),
    modules: G009_MODULES,
    presetCount: reports.length,
    passedCount: reports.filter((r) => r.passed).length,
    byModule,
    presets: reports
  };

  await Bun.write(`${ARTIFACT_DIR}/g009-film-camera-report.json`, JSON.stringify(report, null, 2));
  session.close();

  if (!report.passed) {
    const failed = reports.filter((r) => !r.passed).map((r) => `${r.presetId} (${r.presetTitle})`);
    throw new Error(`G009 film/camera gate failed (${failed.length}/${reports.length}): ${failed.join(', ')}`);
  }

  console.log(
    'G009 film/camera PASSED',
    G009_MODULES.map((id) => `${id} ${byModule[id].passed}/${byModule[id].total}`).join(' | ')
  );
});
