/** Attach to the real Tauri WebView; never substitutes Chrome or a CPU renderer.
 * Launch the desktop with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9633,
 * load a representative workflow and start playback, then run this script.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { connectCdp } from './cdp';
import { createSourceFrameCadence } from '../src/lib/qa/sourceFrameCadence';

const port = Number(process.env.DESKTOP_CDP_PORT ?? 9633);
const durationMs = Number(process.env.DESKTOP_SAMPLE_MS ?? 15000);
const allowSceneChanges = process.env.DESKTOP_ALLOW_SCENE_CHANGES === '1';
const output = resolve(process.env.DESKTOP_REPORT ?? '.artifacts/desktop-playback.json');
const session = await connectCdp(port);
try {
  const response: any = await session.send('Runtime.evaluate', {
    expression: `(${async function sample(ms: number,createCadence:typeof createSourceFrameCadence) {
      const w = window as any;
      if (!w.__TAURI_INTERNALS__ || !w.__BMX_QA__) throw new Error('Requires the native Tauri app and its QA diagnostics');
      const qa = w.__BMX_QA__, { videoPool, audioEngine } = qa.getEngine();
      if (!audioEngine.getState().playing) throw new Error('Start playback before sampling');
      if (qa.timingSnapshot().workspace !== 'perform') throw new Error('This gate measures Perform live decode; resident Timing needs its own frame-selection gate');
      const initial = qa.eightVideoSnapshot();
      if (initial.slots.length !== 12 || initial.decoderCount !== 12) throw new Error('Requires a loaded twelve-slot rack');
      const startedAt=performance.now();
      const stats = initial.slots.map((slot: any) => ({
        slot: slot.canvasId, module: slot.moduleId, video: videoPool.get(slot.canvasId),
        cadence:createCadence(startedAt),callback: 0,
        resident:false, sourceFrameId:null as number|null,
        droppedBefore: slot.droppedVideoFrames, dropped:0, swaps:0, active: true, gaps:[] as any[]
      }));
      let frames = 0, maxRafGapMs = 0, previousRaf: number | null = null, raf = 0;
      const watch = (s: any, video: HTMLVideoElement) => {
        const decoded = (now: number, metadata: VideoFrameCallbackMetadata) => {
          if (!s.active || s.video !== video) return;
          if(s.resident){s.callback=video.requestVideoFrameCallback(decoded);return;}
          const gap=s.cadence.frame(now);
            if (gap > 150 && s.gaps.length < 100) s.gaps.push({gap, at:qa.arrangementSnapshot().time,
              media:metadata.mediaTime, swaps:s.swaps, rate:video.playbackRate, seeking:video.seeking});
          s.callback = video.requestVideoFrameCallback(decoded);
        };
        s.callback = video.requestVideoFrameCallback(decoded);
      };
      const tick = (now: number) => {
        frames++; if (previousRaf !== null) maxRafGapMs = Math.max(maxRafGapMs, now - previousRaf);
        const diagnostics=qa.getEngine().webGpuEngine.getRenderDiagnostics();
        for (const s of stats) {
          const render=diagnostics[s.slot];
          s.resident=render?.samplePath==='resident-frame-bank';
          if(s.resident&&render.sourceFrameId!==s.sourceFrameId){
            const gap=s.cadence.frame(now);
            if(gap>150&&s.gaps.length<100)s.gaps.push({gap,at:qa.arrangementSnapshot().time,media:render.sourceFramePts,resident:true});
            s.sourceFrameId=render.sourceFrameId;
          }
          const current = videoPool.get(s.slot);
          if (current && current !== s.video) {
            s.video.cancelVideoFrameCallback(s.callback);
            s.dropped += Math.max(0, s.video.getVideoPlaybackQuality().droppedVideoFrames - s.droppedBefore);
            s.video = current; s.swaps++;
            s.droppedBefore = current.getVideoPlaybackQuality().droppedVideoFrames;
            watch(s, current);
          }
        }
        previousRaf = now; raf = requestAnimationFrame(tick);
      };
      for (const s of stats) watch(s, s.video);
      raf = requestAnimationFrame(tick);
      await new Promise(resolve => setTimeout(resolve, ms));
      cancelAnimationFrame(raf);
      const endedAt=performance.now();
      const final = qa.eightVideoSnapshot();
      for (const s of stats) { s.active = false; s.video.cancelVideoFrameCallback(s.callback); }
      return {
        durationMs: ms, frames, maxRafGapMs, native: true,
        slots: stats.map((s: any) => {
          const end = final.slots.find((v: any) => v.canvasId === s.slot);
          const sameVideo = s.swaps === 0;
          return { slot:s.slot, module:s.module, sameVideo, swaps:s.swaps, ...s.cadence.finish(endedAt),gaps:s.gaps,
            droppedFrames:s.dropped + Math.max(0, (end?.droppedVideoFrames ?? s.droppedBefore) - s.droppedBefore),
            samplePath:end?.render?.samplePath ?? 'missing-source',
            // STUTTER deliberately holds decoded video. Ramps may slow the
            // source cadence; neither exemption applies to ordinary effects.
            intentionalHold:s.module === 'tapdelay', maxAllowedGapMs:s.module === 'speedramp' ? 250 : 150 };
        }),
        decoderCount:final.decoderCount, timingActive:qa.timingSnapshot().active,
        timingPending:qa.timingSnapshot().capacity.pending,
        sampler:qa.performSamplerSnapshot()
      };
    }.toString()})(${durationMs},${createSourceFrameCadence.toString()})`,
    awaitPromise:true, returnByValue:true
  }, durationMs + 20000);
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  const report = response.result?.value;
  if (!report || !Array.isArray(report.slots)) throw new Error('Playback sampling returned no serializable slot report');
  const failures = report.slots.filter((s: any) => !['external-texture','cached-video-texture','resident-frame-bank'].includes(s.samplePath) || (!allowSceneChanges && !s.sameVideo) || (!s.intentionalHold && (s.callbacks < 2 || s.maxGapMs > s.maxAllowedGapMs)));
  report.pass = failures.length === 0 && report.decoderCount === 12 && report.timingActive === false && report.timingPending === 0 && report.sampler.assets.every((asset:any)=>!asset.loading&&!asset.error);
  mkdirSync(dirname(output), {recursive:true}); writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({pass:report.pass, report:output, maxRafGapMs:report.maxRafGapMs,
    failures:failures.map(({slot,module,maxGapMs,sameVideo}:any)=>({slot,module,maxGapMs,sameVideo}))}, null, 2));
  if (!report.pass) process.exitCode = 1;
} finally { session.close(); }
