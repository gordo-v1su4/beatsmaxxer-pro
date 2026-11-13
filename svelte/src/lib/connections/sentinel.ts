import { get, writable } from 'svelte/store';
import { audioTimeline, type TimelineFrame } from '$lib/transport/AudioTimeline';
import { audioEngine } from '$lib/audio';
import { timingInput } from '$lib/stores/timingSignals';
import { midiChannels } from '$lib/stores/midiChannels';
import { analysisOnsets } from '$lib/stores/triggerLane';
import { tauriInvoke } from '$lib/platform/tauriInvoke';
import type { TimingChannel } from '$lib/runtime/timing/triggers';
import { defaultLightTarget, LightEventCursor, lightEvents } from './sentinelEvents';

export const sentinelChannels=writable<TimingChannel[]>([]);
type Preferences={inputs:string[];targets:number[];settings:{threshold:number;gapMs:number;decayMs:number}};
const preferenceKey='beatsmaxxer.sentinel.inputs.v1';
let saved:Partial<Preferences>={};
if(typeof window!=='undefined')try{saved=JSON.parse(localStorage.getItem(preferenceKey)??'{}');}catch{/* Use defaults for invalid saved preferences. */}
const six=<T>(items:T[]|undefined,fallback:T)=>Array.from({length:6},(_,i)=>items?.[i]??fallback);
export const sentinelInputs=writable(six(saved.inputs,''));
export const sentinelTargets=writable(six(saved.targets,0));
export const sentinelSettings=writable({threshold:.2,gapMs:90,decayMs:220,...saved.settings});
let inputsConfigured=Array.isArray(saved.inputs);
function savePreferences(){if(typeof window!=='undefined')try{localStorage.setItem(preferenceKey,JSON.stringify({inputs:get(sentinelInputs),targets:get(sentinelTargets),settings:get(sentinelSettings)}));}catch{/* Playback remains available if storage is full. */}}
sentinelInputs.subscribe(savePreferences);sentinelTargets.subscribe(savePreferences);sentinelSettings.subscribe(savePreferences);
export const sentinelStatus=writable({enabled:false,packets:0,counts:[] as number[],levels:[] as number[],bpm:0,position:0,message:'OFF'});
let stop: (()=>void)|null=null;
let models:LightEventCursor[]=[];
let cachedChannels:TimingChannel[]=[];
let cachedInputs:string[]=[];
let cachedTargets:number[]=[];
let groupCounts=[0,0,0,0,0];
let previousCounts:number[]=[];
const session=1+Math.floor(Math.random()*8000000);
let sequence=0;
let sourceGeneration=-1;
let inflight=false;
let pending:number[]|null=null;

function refreshChannels() {
  const input=get(timingInput);
  const valid=input?.generation===audioEngine.getUploadedTrackLoadGeneration();
  const channels=valid && input.midi.length ? input.midi : get(midiChannels).map(c=>({name:c.name,events:c.notes?.map(n=>({time:n.time,strength:n.velocity/127}))??c.onsets.map(time=>({time,strength:1}))}));
  const all=[...channels,{name:'Mix onsets (Essentia)',events:get(analysisOnsets).map(time=>({time,strength:1}))}];
  sentinelChannels.set(all);
  if(!inputsConfigured&&channels.length){
    inputsConfigured=true;
    const selected=six(channels.slice(0,6).map(channel=>channel.name),'');
    sentinelInputs.set(selected);sentinelTargets.set(selected.map(defaultLightTarget));
  }
}
timingInput.subscribe(refreshChannels);
midiChannels.subscribe(refreshChannels);
analysisOnsets.subscribe(refreshChannels);

async function sendLatest(values:number[]) {
  pending=values;
  if(inflight)return;
  inflight=true;
  try {
    while(pending) {
      const next=pending; pending=null;
      await tauriInvoke('sentinel_send',{values:next});
      sentinelStatus.update(s=>({...s,packets:s.packets+1,message:s.enabled?'SENDING · receiver status is shown in Sentinel':'OFF'}));
    }
  } catch(error) {
    pending=null;
    stop?.(); stop=null;
    sentinelStatus.update(s=>({...s,enabled:false,message:String(error)}));
  } finally {inflight=false;}
}

function framePacket(frame:TimelineFrame):number[] {
  const available=get(sentinelChannels),inputs=get(sentinelInputs),targets=get(sentinelTargets),settings=get(sentinelSettings);
  const channels=inputs.map(name=>available.find(channel=>channel.name===name)??{name,events:[]});
  if(sourceGeneration!==audioEngine.getUploadedTrackLoadGeneration()) {
    sourceGeneration=audioEngine.getUploadedTrackLoadGeneration();
    models=[];
  }
  if(models.length!==channels.length || available!==cachedChannels || inputs!==cachedInputs || targets!==cachedTargets) {
    cachedChannels=available;cachedInputs=inputs;cachedTargets=targets;
    models=channels.map(channel=>new LightEventCursor(lightEvents(channel.events)));
    previousCounts=models.map(()=>0);
  }
  const wall=performance.now()/1000;
  models.forEach(model=>model.sample(frame.positionSeconds,frame.generation,frame.playing,wall,settings.threshold,settings.gapMs/1000,settings.decayMs/1000));
  const state=audioEngine.getState();
  const bpm=Math.max(20,Math.min(300,state.bpm));
  const energy=frame.playing?Math.min(1,Math.max(0,state.amplitude)):0;
  const values=[session,++sequence,frame.generation,frame.positionSeconds,bpm,frame.beatPosition,frame.playing?1:0,energy,frame.playbackRate];
  for(let group=1;group<=5;group++) {
    let phase=1,envelope=0;
    models.forEach((model,index)=>{
      if(targets[index]!==group)return;
      groupCounts[group-1]+=Math.max(0,model.count-(previousCounts[index]??0));
      if(model.envelope*(1-model.phase)>envelope){envelope=model.envelope*(1-model.phase);phase=model.phase;}
    });
    values.push(groupCounts[group-1],phase,envelope);
  }
  previousCounts=models.map(model=>model.count);
  sentinelStatus.update(s=>({...s,counts:models.map(m=>m.count),levels:models.map(m=>m.envelope*(1-m.phase)),bpm,position:frame.positionSeconds}));
  return values;
}
export function enableSentinel(enabled:boolean) {
  stop?.();stop=null;
  sentinelStatus.update(s=>({...s,enabled,message:enabled?'STARTING':'OFF'}));
  if(enabled) {
    refreshChannels();models=[];
    stop=audioTimeline.subscribe(frame=>{void sendLatest(framePacket(frame));},100);
    const current=audioTimeline.getLastFrame();if(current)void sendLatest(framePacket(current));
  } else {
    const frame=audioTimeline.getLastFrame();
    if(frame) {const packet=framePacket({...frame,playing:false});void sendLatest(packet);}
  }
}
