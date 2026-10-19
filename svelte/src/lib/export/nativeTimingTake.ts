import {get} from 'svelte/store';
import {BeatGrid,audioTimeline,type TimelineFrame} from '$lib/transport';
import {audioEngine} from '$lib/audio';
import {applyTakeAt} from '$lib/arrangement/takeSnapshot';
import {primeTakePgmAt} from '$lib/arrangement/playbackCut';
import {currentRackSlotForModule} from '$lib/stores/rack';
import {pgmSource} from '$lib/stores/pgm';
import {analysisBeatGrid} from '$lib/stores/triggerLane';
import {playbackWorkspace} from '$lib/stores/rackUi';
import {timingCacheCapacity,timingSceneErrors,timingStatus} from '$lib/stores/timing';
import {timingPreparationBlocked} from '$lib/runtime/timing/readiness';
import {timingRuntime} from '$lib/runtime/timing/TimingRuntime';
import {NativeTimingVideo} from './nativeTimingVideo';

/** Step the same saved take/Timing runtime; the UI's stopped rAF cannot advance it. */
export async function prepareNativeTimingTake(start:number,end:number,bpm:number,rate:number,signal:AbortSignal){
  if(get(playbackWorkspace)!=='timing')return null;
  const session=timingRuntime.beginNativeExport();
  const base=audioTimeline.getLastFrame();
  const grid=new BeatGrid(get(analysisBeatGrid),bpm/Math.max(.01,rate));
  const generation=(base?.generation??0)+1;
  let index=0;
  const video=new NativeTimingVideo(async timestamp=>{
    signal.throwIfAborted();
    const position=Math.max(start,Math.min(end-1e-6,start+timestamp*rate));
    audioEngine.seek(position);
    const recalled=await applyTakeAt(position,bpm);
    if(recalled?.failed.length)throw new Error('An original take clip could not be recalled.');
    const deadline=Date.now()+120000;
    while(get(timingPreparationBlocked)||get(timingCacheCapacity).pending>0){
      signal.throwIfAborted();
      const failure=Object.values(get(timingStatus)).find(s=>s.state==='error');
      const sceneFailure=Object.entries(get(timingSceneErrors))[0];
      if(failure||sceneFailure)throw new Error(failure?.message??`Take source ${sceneFailure[0]} is unavailable.`);
      if(Date.now()>deadline)throw new Error('Native take preparation timed out.');
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    primeTakePgmAt(position,bpm);
    const slot=currentRackSlotForModule(get(pgmSource));
    if(!slot)throw new Error('The take has no program source at this position.');
    const fixed=position*60;
    const frame:TimelineFrame={...grid.sample(position),frameId:++index,audioFrameId:index,contextTimeSeconds:timestamp,
      positionSeconds:position,transportSeconds:position,playbackRate:rate,playing:true,generation,reason:'seek',
      bpm,fixedStepSeconds:1/60,fixedStepIndex:Math.floor(fixed),fixedStepPhase:fixed-Math.floor(fixed),deterministicSeed:0,events:[]};
    return session.sample(frame,slot);
  },signal);
  try{await video.prepare();return {video,release:()=>{video.dispose();session.release();}};}
  catch(error){video.dispose();session.release();throw error;}
}
