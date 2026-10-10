import { get, writable } from 'svelte/store';
import { arrangement, cuts, protectRestoredArrangement, type ArrangementSection, type Cut, type SectionScene } from '$lib/stores/arrangement';
import { audioEngine } from '$lib/audio';
import { videoLayers } from '$lib/stores/rack';
import { clipLibrary } from '$lib/stores/clipLibrary';
import { transportDisplay } from '$lib/stores/transportDisplay';
import { parseTimingSettings } from '$lib/stores/timing';
import { arrangementMode } from './transportMode';
import { clipGroups,type ClipGroup } from './clipGroups';

export const arrangementSaveStatus=writable('');
export const arrangementMissingClips=writable<string[]>([]);
const statusWithMissing=(message:string)=>get(arrangementMissingClips).length?`${message} · Missing clips: ${get(arrangementMissingClips).join(', ')}`:message;
export interface SavedArrangement { version: 1; song: { name: string; duration: number }; sections: unknown[]; cuts: Cut[]; clipGroups?:unknown[] }
const songKey=(name:string,duration:number)=>`beatsmaxxer.arrangement.v1:${name}:${duration.toFixed(3)}`;
const sceneNames=(scene:SectionScene|undefined)=>scene?{slots:Object.fromEntries(Object.entries(scene.slots).map(([slot,clip])=>[slot,clip?{name:clip.name}:null]))}:undefined;
export function serializeArrangement(name:string,duration:number):string {
  const sections=get(arrangement).map(s=>({...s,scene:sceneNames(s.scene),deckSnapshot:s.deckSnapshot?{
    ...s.deckSnapshot,scene:sceneNames(s.deckSnapshot.scene)}:undefined}));
  return JSON.stringify({version:1,song:{name,duration},sections,cuts:get(cuts),clipGroups:get(clipGroups).map(g=>({...g,scene:sceneNames(g.scene)}))},null,2);
}
function resolveScene(raw:unknown,missing:Set<string>):SectionScene|undefined {
  if(!raw||typeof raw!=='object'||!('slots' in raw))return undefined;
  const entries=Object.entries((raw as {slots:Record<string,unknown>}).slots??{});
  const slots:SectionScene['slots']={};
  for(const [slot,value] of entries){
    if(!/^(top|bottom)-[0-4]$/.test(slot))throw new Error('Invalid saved clip slot');
    if(value===null){slots[slot]=null;continue;}
    const name=(value as {name?:unknown})?.name;
    if(typeof name!=='string'||!name)throw new Error('Invalid saved clip name');
    const layer=Object.values(get(videoLayers)).find(l=>l?.name===name);
    const library=get(clipLibrary).find(c=>c.name===name);
    // The live slot may contain a generated ramp derivative with the same name.
    // Restore the original library source so each destination prepares its own variant.
    if(library)slots[slot]=library.source.kind==='file'?{name,url:'',file:library.source.file}:{name,url:library.source.url};
    else if(layer)slots[slot]={name,url:layer.url,file:layer.file};
    else {slots[slot]={name,url:''};missing.add(name);}
  }
  return {slots};
}
export function parseArrangementFile(raw:string) {
  const doc=JSON.parse(raw) as SavedArrangement;
  if(doc.version!==1||!doc.song||typeof doc.song.name!=='string'||!Number.isFinite(doc.song.duration)||doc.song.duration<=0
    ||!Array.isArray(doc.sections)||!doc.sections.length||doc.sections.length>500||!Array.isArray(doc.cuts)||doc.cuts.length>200000)throw new Error('Invalid arrangement file');
  const missing=new Set<string>(),ids=new Set<string>();
  if(doc.clipGroups!==undefined&&(!Array.isArray(doc.clipGroups)||doc.clipGroups.length>200))throw new Error('Invalid saved clip groups');
  const groupIds=new Set<string>();
  const groups:ClipGroup[]=(doc.clipGroups??[]).map(value=>{
    const g=value as ClipGroup;
    if(!g||typeof g.id!=='string'||!g.id||groupIds.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>80)throw new Error('Invalid saved clip group');
    groupIds.add(g.id);const scene=resolveScene(g.scene,missing);if(!scene)throw new Error('Invalid saved clip group');
    return {id:g.id,name:g.name,scene};
  });
  const validBank=(bank:ArrangementSection['bank'])=>bank&&Array.isArray(bank.top)&&Array.isArray(bank.bottom)&&bank.top.length>0&&bank.top.length<=5&&bank.bottom.length>0&&bank.bottom.length<=5&&[...bank.top,...bank.bottom].every(id=>typeof id==='string'&&!!id);
  const sections=doc.sections.map(value=>{
    const s=value as ArrangementSection;
    if(!s||typeof s.id!=='string'||ids.has(s.id)||typeof s.name!=='string'||!Number.isFinite(s.bars)||s.bars<=0
      ||!validBank(s.bank)||!Array.isArray(s.pattern)||s.pattern.length!==16
      ||[...s.bank.top,...s.bank.bottom].some(id=>typeof id!=='string')||s.pattern.some(v=>v!==null&&(!Number.isInteger(v)||v<0||v>9)))throw new Error('Invalid arrangement section');
    ids.add(s.id);
    if(s.clipGroupId!==undefined&&!groupIds.has(s.clipGroupId))throw new Error('Invalid assigned clip group');
    if(s.deckSnapshot&&(!validBank(s.deckSnapshot.bank)||s.deckSnapshot.timing?.version!==1))throw new Error('Invalid deck snapshot');
    // Analysis timestamps are rounded independently of the decoded audio length.
    for(const t of [s.timeStartS,s.timeEndS])if(t!==undefined&&(!Number.isFinite(t)||t<0||t>doc.song.duration+.05))throw new Error('Invalid section time');
    if(s.timeStartS!==undefined&&s.timeEndS!==undefined&&s.timeEndS<=s.timeStartS)throw new Error('Invalid section time');
    return {...s,scene:resolveScene(s.scene,missing),deckSnapshot:s.deckSnapshot?{...s.deckSnapshot,
      timing:parseTimingSettings(JSON.stringify(s.deckSnapshot.timing)),scene:resolveScene(s.deckSnapshot.scene,missing)??{slots:{}}}:undefined};
  });
  const cutList=doc.cuts.map(c=>{
    if(!c||!Number.isInteger(c.step)||c.step<0||!Number.isInteger(c.slotIndex)||c.slotIndex<0||c.slotIndex>9
      ||(c.timeSeconds!==undefined&&(!Number.isFinite(c.timeSeconds)||c.timeSeconds<0||c.timeSeconds>doc.song.duration)))throw new Error('Invalid recorded cut');
    return {step:c.step,slotIndex:c.slotIndex,...(c.timeSeconds===undefined?{}:{timeSeconds:c.timeSeconds})};
  });
  return {song:doc.song,sections,cuts:cutList,groups,missing:[...missing]};
}
export function loadArrangementFile(raw:string) {
  if(get(arrangementMode)!=='live')throw new Error('End REC or PLAY before loading an arrangement.');
  const doc=parseArrangementFile(raw),song=get(transportDisplay);
  if(!song.trackName||song.duration<=0||doc.song.name!==song.trackName||Math.abs(doc.song.duration-song.duration)>.001)throw new Error(`Load the matching song first: ${doc.song.name} (${doc.song.duration.toFixed(3)}s)`);
  protectRestoredArrangement();
  arrangementMissingClips.set(doc.missing);
  clipGroups.set(doc.groups);
  arrangement.set(doc.sections);cuts.set(doc.cuts);
  arrangementSaveStatus.set(doc.missing.length?`Missing clips: ${doc.missing.join(', ')}`:'Arrangement loaded');
  return doc;
}
export function downloadArrangement() {
  const song=get(transportDisplay);
  const blob=new Blob([serializeArrangement(song.trackName,song.duration)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`${song.trackName.replace(/[^a-z0-9_-]/gi,'_')||'song'}.arrangement.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function installArrangementPersistence() {
  let key='',generation=-1,loading=false,timer:ReturnType<typeof setTimeout>|undefined;
  const save=()=>{
    if(loading||!key)return;
    clearTimeout(timer);
    timer=setTimeout(()=>{
      const song=get(transportDisplay);
      if(!song.trackName||song.duration<=0||songKey(song.trackName,song.duration)!==key||audioEngine.getUploadedTrackLoadGeneration()!==generation)return;
      try{localStorage.setItem(key,serializeArrangement(song.trackName,song.duration));arrangementSaveStatus.set(statusWithMissing('Auto-saved in this browser'));}
      catch{arrangementSaveStatus.set('Browser storage is full or unavailable. Download the arrangement.');}
    },250);
  };
  const stops=[transportDisplay.subscribe(song=>{
    const next= song.trackName&&song.duration>0?songKey(song.trackName,song.duration):'';
    const nextGeneration=audioEngine.getUploadedTrackLoadGeneration();
    if(next===key&&generation===nextGeneration)return;
    clearTimeout(timer);key=next;generation=nextGeneration;
    arrangementMissingClips.set([]);
    if(!key){arrangementSaveStatus.set('');return;}
    loading=true;clipGroups.set([]);
    try{const saved=localStorage.getItem(key);if(saved)loadArrangementFile(saved);}
    catch(e){arrangementSaveStatus.set(e instanceof Error?e.message:String(e));}
    loading=false;
  }),arrangement.subscribe(save),cuts.subscribe(save),clipGroups.subscribe(save),videoLayers.subscribe(reconnect),clipLibrary.subscribe(reconnect)];
  function reconnect(){
    if(!get(arrangementMissingClips).length||get(arrangementMode)!=='live')return;
    const missing=new Set<string>();let changed=false;
    const reconnectScene=(scene:SectionScene|undefined)=>{
      if(!scene)return scene;
      const slots={...scene.slots};
      for(const [slot,clip] of Object.entries(slots)){
        if(!clip||clip.file||clip.url)continue;
        const resolved=resolveScene({slots:{[slot]:{name:clip.name}}},missing)?.slots[slot];
        if(resolved&&(resolved.file||resolved.url)){slots[slot]=resolved;changed=true;}
      }
      return {slots};
    };
    const sections=get(arrangement).map(s=>({...s,scene:reconnectScene(s.scene),deckSnapshot:s.deckSnapshot?{...s.deckSnapshot,scene:reconnectScene(s.deckSnapshot.scene)!}:undefined}));
    const groups=get(clipGroups).map(g=>({...g,scene:reconnectScene(g.scene)!}));
    arrangementMissingClips.set([...missing]);
    if(changed){arrangement.set(sections);clipGroups.set(groups);}
    arrangementSaveStatus.set(statusWithMissing('Arrangement loaded'));
  }
  return ()=>{clearTimeout(timer);for(const stop of stops)stop();};
}
