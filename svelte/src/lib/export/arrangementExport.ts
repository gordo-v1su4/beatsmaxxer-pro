import { get, writable } from 'svelte/store';
import { finalizeRecording } from './finalizeRecording';
import { prepareNativeTimingTake } from './nativeTimingTake';
import { timingPreparationBlocked } from '$lib/runtime/timing/readiness';
import { timingStatus, timingCacheCapacity, timingSceneErrors } from '$lib/stores/timing';
import { applyTakeAt } from '$lib/arrangement/takeSnapshot';
import { primeTakePgmAt } from '$lib/arrangement/playbackCut';
import { audioEngine } from '$lib/audio';
import { webGpuEngine, PGM_MONITOR_ID } from '$lib/rendering/webgpu/WebGpuEngine';
import { audioTimeline } from '$lib/transport';
import { arrangementLoopRegion, type ArrangementLoopRegion } from '$lib/stores/arrangement';
import { transportDisplay } from '$lib/stores/transportDisplay';
import {
  arrangementMode,
  arrangementOverridden,
  setArrangementMode,
  type ArrangementMode,
} from '$lib/arrangement/transportMode';

/**
 * Export the arrangement to a video file — Ableton's Export Audio/Video, for
 * the program out.
 *
 * Realtime: the range plays in PLAY mode while the PGM canvas and the audio
 * mix are recorded together, so a 3-minute song takes 3 minutes. That is the
 * honest version — every effect, cut, scene recall and time-stretch is
 * Timing then decodes the original sources frame by frame against the saved
 * take, replacing preview pixels while retaining the captured audio clock.
 */
export type ExportRange = 'song' | 'loop';

export interface ExportOptions {
  range: ExportRange;
  fps: 24 | 30 | 60;
  resolveTimeline?:boolean;
}

export type ExportStatus =
  | { status: 'idle' }
  | { status: 'preparing'; totalSeconds:number }
  | { status: 'recording'; elapsedSeconds: number; totalSeconds: number }
  | { status: 'finalizing'; progress:number; fps:24|30|60 }
  | { status: 'error'; message: string };

export const exportState = writable<ExportStatus>({ status: 'idle' });
export const exportDownload=writable<{url:string;name:string}|null>(null);

/** Formats in preference order; the first the browser can record wins. */
const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
];

export function pickRecorderMime(isSupported: (mime: string) => boolean): string | null {
  return MIME_CANDIDATES.find((mime) => isSupported(mime)) ?? null;
}

/** Start/end seconds for a range. A loop range needs a real loop set. */
export function resolveExportRange(
  range: ExportRange,
  durationSeconds: number,
  loop: ArrangementLoopRegion | null,
): { startSeconds: number; endSeconds: number } | null {
  if (!Number.isFinite(durationSeconds) || !(durationSeconds > 0)) return null;
  if (range === 'loop') {
    if (!loop || !Number.isFinite(loop.startSeconds) || !Number.isFinite(loop.endSeconds)) return null;
    const startSeconds = Math.max(0, loop.startSeconds);
    const endSeconds = Math.min(loop.endSeconds, durationSeconds);
    return endSeconds > startSeconds ? { startSeconds, endSeconds } : null;
  }
  return { startSeconds: 0, endSeconds: durationSeconds };
}

export function exportFileName(mime: string, now = new Date()) {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `beatsmaxxer-${stamp}.${mime.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
}

let cancelRequested = false;
let finalizationController:AbortController|null=null;

export function cancelArrangementExport() {
  cancelRequested = true;
  finalizationController?.abort();
}

async function waitForProgramPaint(){
  if(typeof requestAnimationFrame!=='function')return;
  await new Promise<void>((resolve,reject)=>{
    const timeout=setTimeout(()=>cancelRequested?resolve():reject(new Error('Program monitor did not paint before recording.')),5000);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timeout);resolve();}));
  });
}

export async function startArrangementExport(options: ExportOptions): Promise<void> {
  const state=get(exportState);
  if(state.status==='recording'||state.status==='preparing'||state.status==='finalizing')return;
  const fail=(message:string)=>exportState.set({status:'error',message});
  if(get(timingPreparationBlocked))return fail('Finish preparing the timing clips before exporting.');
  const previousMode=get(arrangementMode);
  if(previousMode==='rec')return fail('Stop recording before exporting the take.');
  const display=get(transportDisplay),previousLoop=get(arrangementLoopRegion);
  const range=resolveExportRange(options.range,display.duration,previousLoop);
  if(!range)return fail(options.range==='loop'?'Set a LOOP range first.':'Load a song first.');
  // ARRANGE paints this monitor; its hidden main canvas may not feed captureStream.
  const canvas=webGpuEngine.getCanvas(PGM_MONITOR_ID)??webGpuEngine.getCanvas('pgm');
  if(!canvas||typeof canvas.captureStream!=='function')return fail('Program monitor is not available to record.');
  if(typeof MediaRecorder==='undefined')return fail('This browser cannot record video.');
  const mime=pickRecorderMime(m=>MediaRecorder.isTypeSupported(m));
  if(!mime)return fail('No supported video format for recording.');

  let audio:ReturnType<typeof audioEngine.createCaptureStream>=null;
  let video:MediaStream|null=null,recorder:MediaRecorder|null=null;
  let restoreLoop:(()=>void)|null=null,ownsTransport=false;
  let native:Awaited<ReturnType<typeof prepareNativeTimingTake>>=null;
  let playbackRate=1;
  const total=range.endSeconds-range.startSeconds;
  cancelRequested=false;
  exportState.set({status:'preparing',totalSeconds:total});
  const stopRecorder=async()=>{
    if(!recorder||recorder.state==='inactive')return;
    const current=recorder;
    await new Promise<void>((resolve,reject)=>{
      current.onstop=()=>resolve();
      try{current.stop();}catch(error){reject(error);}
    });
  };
  try{
    audio=audioEngine.createCaptureStream();
    if(!audio)throw new Error('Audio is not running yet — press play once, then export.');
    ownsTransport=true;
    audioEngine.stop('operator');
    restoreLoop=audioEngine.suspendTrackLooping();
    arrangementOverridden.set(false);
    // Preserve the live workspace captured by PLAY; do not exit and recapture it.
    const recalled=previousMode==='play'
      ? await applyTakeAt(range.startSeconds,display.bpm||120)
      : await setArrangementMode('play',range.startSeconds);
    if(recalled?.failed.length)throw new Error('Some take clips could not be prepared: '+recalled.failed.join(', '));
    const deadline=Date.now()+120000;
    while(get(timingPreparationBlocked)||get(timingCacheCapacity).pending>0){
      if(cancelRequested){exportState.set({status:'idle'});return;}
      const failed=Object.values(get(timingStatus)).find(s=>s.state==='error');
      if(failed)throw new Error(failed.message||'A take clip could not be prepared.');
      const sceneFailure=Object.entries(get(timingSceneErrors))[0];
      if(sceneFailure)throw new Error(`Could not prepare section clip ${sceneFailure[0]}: ${sceneFailure[1]}`);
      if(Date.now()>deadline)throw new Error('Take frame preparation timed out. Resolve clip errors before exporting.');
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    const sceneFailure=Object.entries(get(timingSceneErrors))[0];
    if(sceneFailure)throw new Error(`Could not prepare section clip ${sceneFailure[0]}: ${sceneFailure[1]}`);
    if(cancelRequested){exportState.set({status:'idle'});return;}
    arrangementLoopRegion.set(null);
    audioEngine.seek(range.startSeconds);
    primeTakePgmAt(range.startSeconds,display.bpm||120);
    await waitForProgramPaint();
    if(cancelRequested){exportState.set({status:'idle'});return;}
    video=canvas.captureStream(options.fps);
    const stream=new MediaStream([...video.getVideoTracks(),...audio.stream.getAudioTracks()]);
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:options.fps===60?16000000:10000000,audioBitsPerSecond:256000});
    const chunks:Blob[]=[];
    recorder.ondataavailable=event=>{if(event.data.size>0)chunks.push(event.data);};
    let recorderError:string|null=null;
    recorder.onerror=()=>{recorderError='Video recording failed. Try a supported browser or a smaller output.';};
    recorder.start(1000);
    await audioEngine.start();
    playbackRate=audioTimeline.getLastFrame?.()?.playbackRate??1;
    exportState.set({status:'recording',elapsedSeconds:0,totalSeconds:total});
    const done=await new Promise<'finished'|'cancelled'|'stalled'>((resolve)=>{
      let startedPlaying=false,settled=false;
      const finish=(outcome:'finished'|'cancelled'|'stalled')=>{
        if(settled)return;settled=true;clearInterval(timer);clearTimeout(startGuard);resolve(outcome);
      };
      const timer=setInterval(()=>{
        const position=audioTimeline.getPositionSeconds(),playing=get(transportDisplay).playing;
        if(playing)startedPlaying=true;
        exportState.set({status:'recording',elapsedSeconds:Math.max(0,Math.min(total,position-range.startSeconds)),totalSeconds:total});
        if(cancelRequested)finish('cancelled');
        else if(recorderError)finish('stalled');
        else if(position>=range.endSeconds)finish('finished');
        else if(startedPlaying&&!playing)finish('stalled');
      },50);
      const startGuard=setTimeout(()=>{if(!startedPlaying)finish('stalled');},4000);
    });
    await stopRecorder();
    if(done==='stalled')throw new Error(recorderError||'Playback stopped before the requested range finished. No partial export was saved.');
    if(done==='cancelled'){exportState.set({status:'idle'});return;}
    audioEngine.stop('operator');
    const recording=new Blob(chunks,{type:mime.split(';')[0]});
    if(!recording.size)throw new Error('The recorder returned an empty video.');
    finalizationController=new AbortController();
    exportState.set({status:'finalizing',progress:0,fps:options.fps});
    native=await prepareNativeTimingTake(range.startSeconds,range.endSeconds,display.bpm||120,playbackRate,finalizationController.signal);
    if(options.resolveTimeline&&!native)throw new Error('Resolve timeline export is available in Timing only.');
    const blob=await finalizeRecording(recording,options.fps,{signal:finalizationController.signal,
      nativeVideo:native?.video,
      onProgress:progress=>exportState.set({status:'finalizing',progress,fps:options.fps})});
    if(cancelRequested){exportState.set({status:'idle'});return;}
    const downloadable=options.resolveTimeline&&native
      ? await (await import('./resolveBundle')).resolveBundle(blob,native.video,options.fps,finalizationController.signal):blob;
    const url=URL.createObjectURL(downloadable),link=document.createElement('a');
    const name=options.resolveTimeline&&native?exportFileName(mime).replace(/\.[^.]+$/, '-resolve.zip'):exportFileName(mime);
    const previousDownload=get(exportDownload);if(previousDownload)URL.revokeObjectURL(previousDownload.url);
    exportDownload.set({url,name});
    link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
    exportState.set({status:'idle'});
  }catch(error){if(cancelRequested)exportState.set({status:'idle'});else fail(error instanceof Error?error.message:'Arrangement export failed.');}
  finally{
    native?.release();
    finalizationController=null;
    try{await stopRecorder();}catch{}
    video?.getTracks().forEach(track=>track.stop());
    audio?.release();
    if(ownsTransport){
      audioEngine.stop('operator');restoreLoop?.();arrangementLoopRegion.set(previousLoop);
      await setArrangementMode(previousMode,audioTimeline.getPositionSeconds());
    }
  }
}
