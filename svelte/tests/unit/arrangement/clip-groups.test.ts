import { afterEach,beforeEach,expect,test } from 'vitest';
import { get } from 'svelte/store';
import { arrangement,resetArrangement,captureSectionScene,clearSectionScene } from '$lib/stores/arrangement';
import { clipGroups,addClipGroup,setClipGroupClip,assignClipGroup,captureClipGroup } from '$lib/arrangement/clipGroups';
import { videoLayers } from '$lib/stores/rack';
import { serializeArrangement,parseArrangementFile } from '$lib/arrangement/persistence';
import { setArrangementMode } from '$lib/arrangement/transportMode';
const layers=get(videoLayers);
beforeEach(()=>{resetArrangement();clipGroups.set([]);setArrangementMode('live',0);});
afterEach(()=>{setArrangementMode('live',0);resetArrangement();clipGroups.set([]);videoLayers.set(layers);});
test('one reusable group fills several song sections, with matching clips and independent section snapshots',()=>{
  const first=get(arrangement)[0];arrangement.set([first,{...first,id:'chorus-2'}]);
  const id=addClipGroup()!;
  const file=new File(['video'],'chorus.mp4');
  setClipGroupClip(id,'top-0',{id:'clip',name:file.name,source:{kind:'file',file}} as never);
  assignClipGroup(id,first.id);assignClipGroup(id,'chorus-2');
  const sections=get(arrangement);
  expect(sections.map(s=>s.clipGroupId)).toEqual([id,id]);
  expect(sections[0].scene?.slots['top-0']?.file).toBe(file);
  expect(sections[1].scene).not.toBe(sections[0].scene);
  expect(sections[1].deckSnapshot?.scene.slots['top-0']?.file).toBe(file);
  expect(get(clipGroups)).toHaveLength(1);
});
test('capture updates the existing group and linked sections without creating another group',()=>{
  const id=addClipGroup()!;assignClipGroup(id,get(arrangement)[0].id);
  videoLayers.set({'top-0':{name:'rack.mp4',url:'blob:rack'}} as never);captureClipGroup(id);
  expect(get(clipGroups)).toHaveLength(1);expect(get(arrangement)[0].scene?.slots['top-0']?.name).toBe('rack.mp4');
  const raw=serializeArrangement('song.mp3',30);expect(raw).not.toContain('blob:');
  const saved=parseArrangementFile(raw);expect(saved.groups[0].name).toBe('Section 1');expect(saved.sections[0].clipGroupId).toBe(id);
});
test('REC and PLAY lock group edits and assignments',()=>{
  const id=addClipGroup()!;const before=get(clipGroups);
  for(const mode of ['rec','play'] as const){setArrangementMode(mode,0);expect(addClipGroup()).toBeUndefined();captureClipGroup(id);assignClipGroup(id,get(arrangement)[0].id);}
  expect(get(clipGroups)).toBe(before);expect(get(arrangement)[0].clipGroupId).toBeUndefined();
});
test('REC and PLAY preserve section clip snapshots when capture or clear is requested',()=>{
  videoLayers.set({'top-0':{name:'original.mp4',url:'blob:original'}} as never);
  captureSectionScene(0);
  for(const mode of ['rec','play'] as const){
    setArrangementMode(mode,0);
    const before=get(arrangement);
    videoLayers.set({'top-0':{name:'replacement.mp4',url:'blob:replacement'}} as never);
    captureSectionScene(0);clearSectionScene(0);
    expect(get(arrangement)).toBe(before);
    setArrangementMode('live',0);
  }
});
