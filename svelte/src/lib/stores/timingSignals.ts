import { get, writable } from 'svelte/store';
import { audioEngine } from '$lib/audio';
import { parseMidi } from '$lib/audio/MidiParser';
import { analysisBeatGrid, analysisOnsets } from './triggerLane';
import { midiChannels } from './midiChannels';
import type { TimingChannel, TimingEvent, TimingSignal, TimingTriggerConfig } from '$lib/runtime/timing/triggers';

type Feature = 'onsets'|'activity'|'loudness';
export interface TimingInput {
  generation:number; name:string; sourceSha256?:string; bpm:number; beats:number[]; duration:number;
  midi:TimingChannel[]; features:Record<string,Record<Feature,TimingEvent[]>>;
}
export const timingInput=writable<TimingInput|null>(null);
export const timingSignalStatus=writable<{label:string;missing?:string;channels:string[]}>({label:'BEAT GRID',channels:[]});
export const timingSignalGrid=writable<{beats:readonly number[];bpm:number}>({beats:[],bpm:128});
const events=(raw:unknown):TimingEvent[]=>Array.isArray(raw)?raw.filter(e=>e&&Number.isFinite(e.time)&&e.time>=0&&Number.isFinite(e.strength)).map(e=>({time:e.time,strength:Math.max(0,Math.min(1,e.strength))})).sort((a,b)=>a.time-b.time):[];
const hash=async(bytes:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');

/** Import the existing R&D file format with its actual companion song, never by filename guess. */
export async function loadTimingBundle(analysis:unknown,midi:unknown,song:File){
  const a=analysis as Record<string,any>,m=midi as Record<string,any>|null;
  const sha=await hash(await song.arrayBuffer());
  if(!a||a.version!==1||sha!==a.sourceSha256||(m&&sha!==m.sourceSha256))throw new Error('Timing data does not match the selected song SHA-256. Select its original audio.');
  if(!Array.isArray(a.beats)||a.beats.length<2||a.beats.some((b:number,i:number)=>!Number.isFinite(b)||b<0||(i>0&&b<=a.beats[i-1]))||!Number.isFinite(a.bpm)||a.bpm<=0||!Number.isFinite(a.duration)||a.duration<=0)throw new Error('Invalid timing beat grid');
  const features:TimingInput['features']={};
  for(const [name,raw] of Object.entries(a.features??{})){
    const f=raw as Record<string,unknown>;
    features[name]={onsets:events(f.onsets),activity:events(f.activity),loudness:events(f.loudness)};
  }
  const channels:TimingChannel[]=(m?.stems??[]).map((s:any)=>({name:String(s.name),events:events(s.notes?.map((n:any)=>({time:n.time,strength:n.velocity/127})))}));
  await audioEngine.loadAudioFile(song,{hostedAnalysis:false});
  audioEngine.applyPreparedRhythm({bpm:a.bpm,beats:a.beats,duration:a.duration,onsets:features.mix?.onsets.map(e=>e.time)??[]});
  timingInput.set({generation:audioEngine.getUploadedTrackLoadGeneration(),name:song.name,sourceSha256:sha,bpm:a.bpm,beats:a.beats,duration:a.duration,midi:channels,features});
}
export async function loadRedlineTimingReference(){
  const base='/benchmark-fixtures/benchmark/';
  const responses=await Promise.all(['redline-analysis.json','redline-midi.json','redline.mp3'].map(n=>fetch(base+n)));
  if(responses.some(r=>!r.ok))throw new Error('Saved Redline files are unavailable on this server. Import the matching data and song.');
  await loadTimingBundle(await responses[0].json(),await responses[1].json(),new File([await responses[2].blob()],'Redline · saved R&D song.mp3',{type:'audio/mpeg'}));
}
export async function importTimingFiles(files:File[]){
  const json=files.filter(f=>/\.json$/i.test(f.name));
  const song=files.find(f=>/\.(mp3|wav|m4a|ogg|flac)$/i.test(f.name));
  if(json.length){
    const docs=await Promise.all(json.map(f=>f.text().then(JSON.parse)));
    const a=docs.find(d=>d.features),m=docs.find(d=>d.stems);
    if(!a||!song)throw new Error('Select the analysis JSON and its matching song together; MIDI JSON is optional.');
    return loadTimingBundle(a,m??null,song);
  }
  const midis=files.filter(f=>/\.midi?$/i.test(f.name));
  if(!midis.length)throw new Error('Select MIDI files, or saved analysis JSON plus its song.');
  const generation=audioEngine.getUploadedTrackLoadGeneration(), state=audioEngine.getState();
  const channels:TimingChannel[]=await Promise.all(midis.map(async file=>{const data=parseMidi(await file.arrayBuffer());return {name:file.name,events:events(data.notes.map(n=>({time:n.time,strength:n.velocity/127})))};}));
  if(generation!==audioEngine.getUploadedTrackLoadGeneration())throw new Error('Song changed during import. Import the MIDI again.');
  if(!channels.some(c=>c.events.length))throw new Error('No note-on events in the selected MIDI.');
  const existing=get(timingInput);
  timingInput.set(existing?.generation===generation?{...existing,midi:channels}:{generation,name:state.trackName||'MIDI · song-relative',bpm:state.bpm,beats:[...get(analysisBeatGrid)],duration:Math.max(state.duration,...channels.flatMap(c=>c.events.map(e=>e.time)))+1,midi:channels,features:{}});
}

/** Returns stable input-array identities so the renderer can cache compiled schedules. */
export function resolveTimingSignal(trigger:TimingTriggerConfig,sourceBpm:number,horizon:number):TimingSignal {
  const input=get(timingInput),state=audioEngine.getState();
  const valid=input?.generation===audioEngine.getUploadedTrackLoadGeneration()&&state.usingUploadedTrack;
  const data=valid?input:null;
  const signal:TimingSignal={channels:[],beats:data?.beats??get(analysisBeatGrid),bpm:data?.bpm??sourceBpm,duration:Math.max(state.duration||horizon,1),label:data?.name??state.trackName??'BEAT GRID'};
  if(trigger.source==='continuous'||trigger.source==='beat')return signal;
  if(trigger.source==='midi'){
    signal.channels=data?.midi.length?data.midi:get(midiChannels).map(c=>({name:c.name,events:c.notes?c.notes.map(n=>({time:n.time,strength:n.velocity/127})):c.onsets.map(time=>({time,strength:1}))}));
  }else{
    const feature:Feature=trigger.source.endsWith('activity')?'activity':trigger.source.endsWith('loudness')?'loudness':'onsets';
    const names=trigger.source==='stem-onsets'?Object.keys(data?.features??{}).filter(n=>n!=='mix'):[trigger.source.startsWith('vocals')?'vocals':'mix'];
    signal.channels=names.map(name=>({name,events:data?.features[name]?.[feature]??[]}));
    if(trigger.source==='mix-onsets'&&!signal.channels.some(c=>c.events.length))signal.channels=[{name:'mix',events:get(analysisOnsets).map(time=>({time,strength:1}))}];
  }
  if(!signal.channels.some(c=>c.events.length))signal.missing='NO MATCHING DATA · IMPORT MIDI OR ANALYSIS + SONG';
  else if(trigger.channel!=='all'&&!signal.channels.some(c=>c.name===trigger.channel))signal.missing='SELECT AN AVAILABLE CHANNEL';
  return signal;
}
