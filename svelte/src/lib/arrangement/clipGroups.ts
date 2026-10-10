import { get,writable } from 'svelte/store';
import { arrangement,autoClips,selectedArrangementSections,activeSectionIndex,type SectionScene } from '$lib/stores/arrangement';
import { videoLayers } from '$lib/stores/rack';
import { timingSettings } from '$lib/stores/timing';
import { captureScene } from './sectionScenes';
import { arrangementMode } from './transportMode';
import type { LibraryClip } from '$lib/stores/clipLibrary';

export interface ClipGroup { id:string; name:string; scene:SectionScene }
export const clipGroups=writable<ClipGroup[]>([]);
export const clipGroupDrag=writable<{id:string;x:number;y:number}|null>(null);
const copyScene=(scene:SectionScene):SectionScene=>({slots:Object.fromEntries(Object.entries(scene.slots).map(([slot,clip])=>[slot,clip?{...clip}:null]))});
export function addClipGroup(capture=false){
  if(get(arrangementMode)!=='live')return;
  const id=crypto.randomUUID(),groups=get(clipGroups);
  const group={id,name:`Section ${groups.length+1}`,scene:capture?captureScene(get(videoLayers)):{slots:{}}};
  clipGroups.set([...groups,group]);return id;
}
function updateGroup(id:string,update:(group:ClipGroup)=>ClipGroup){
  if(get(arrangementMode)!=='live')return;
  let updated:ClipGroup|undefined;
  clipGroups.update(groups=>groups.map(g=>g.id===id?(updated=update(g)):g));
  if(!updated)return;
  const scene=updated.scene;
  arrangement.update(sections=>sections.map(s=>s.clipGroupId===id?{...s,scene:copyScene(scene),deckSnapshot:s.deckSnapshot?{...s.deckSnapshot,scene:copyScene(scene)}:undefined}:s));
}
export function renameClipGroup(id:string,name:string){const clean=name.trim().slice(0,80);if(clean)updateGroup(id,g=>({...g,name:clean}));}
export function captureClipGroup(id:string){updateGroup(id,g=>({...g,scene:captureScene(get(videoLayers))}));}
export function setClipGroupClip(id:string,slot:string,clip:LibraryClip){
  if(!/^(top|bottom)-[0-4]$/.test(slot))return;
  const source=clip.source.kind==='file'?{name:clip.name,url:'',file:clip.source.file}:{name:clip.name,url:clip.source.url};
  updateGroup(id,g=>({...g,scene:{slots:{...g.scene.slots,[slot]:source}}}));
}
export function assignClipGroup(groupId:string,sectionId:string){
  if(get(arrangementMode)!=='live')return;
  const group=get(clipGroups).find(g=>g.id===groupId);if(!group)return;
  arrangement.update(sections=>sections.map(s=>{
    if(s.id!==sectionId)return s;
    const scene=copyScene(group.scene);
    return {...s,clipGroupId:groupId,scene,deckSnapshot:{...(s.deckSnapshot??{timing:structuredClone(get(timingSettings)),bank:s.bank}),scene:copyScene(scene)}};
  }));
  autoClips.set(true);
}
export function assignClipGroupToSelection(id:string){
  const sections=get(arrangement),selected=get(selectedArrangementSections);
  for(const index of selected.size?selected:[get(activeSectionIndex)])if(sections[index])assignClipGroup(id,sections[index].id);
}
