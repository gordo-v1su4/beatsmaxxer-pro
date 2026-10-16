import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { get } from 'svelte/store';
import { arrangement, cuts, resetArrangement, applyStructureToArrangement } from '$lib/stores/arrangement';
import { arrangementMissingClips, arrangementSaveStatus, installArrangementPersistence, loadArrangementFile, parseArrangementFile, serializeArrangement, waitForArrangementRestore } from '$lib/arrangement/persistence';
import { transportDisplay } from '$lib/stores/transportDisplay';
import { clipLibrary } from '$lib/stores/clipLibrary';
import { videoLayers } from '$lib/stores/rack';
import { audioEngine } from '$lib/audio';

const initialDisplay = get(transportDisplay);
let stop: (()=>void) | undefined;
let storage: Map<string,string>;
let generation: number;
const key=(name='song.mp3',duration=30)=>`beatsmaxxer.arrangement.v1:${name}:${duration.toFixed(3)}`;
const setSong=(name='song.mp3',duration=30)=>transportDisplay.update(s=>({...s,trackName:name,duration}));

beforeEach(()=>{
  vi.useFakeTimers();
  generation=1;storage=new Map();
  vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)});
  vi.spyOn(audioEngine,'getUploadedTrackLoadGeneration').mockImplementation(()=>generation);
  transportDisplay.set(initialDisplay);resetArrangement();clipLibrary.set([]);
  arrangementMissingClips.set([]);
});
afterEach(()=>{
  stop?.();stop=undefined;vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();
  transportDisplay.set(initialDisplay);resetArrangement();clipLibrary.set([]);
});

describe('arrangement persistence lifecycle',()=>{
  test('explicit workflow replacement waits for delayed metadata and supersedes a protected autosave',async()=>{
    arrangement.update(list=>list.map(section=>({...section,name:'Old saved verse'})));
    storage.set(key(),serializeArrangement('song.mp3',30));resetArrangement();
    setSong('',0);stop=installArrangementPersistence();
    let ready=false;
    const restored=waitForArrangementRestore(generation,'song.mp3').then(()=>{ready=true;});
    await Promise.resolve();expect(ready).toBe(false);
    setSong();await restored;
    expect(get(arrangement)[0].name).toBe('Old saved verse');
    resetArrangement();
    applyStructureToArrangement([{start:0,end:15,label:'verse',duration:15,energy:1},{start:15,end:30,label:'chorus',duration:15,energy:1}],[],120);
    expect(get(arrangement).some(section=>section.kind==='chorus')).toBe(true);
    await expect(waitForArrangementRestore(generation,'song.mp3')).resolves.toBeUndefined();
  });
  test('an unready song restore times out rather than silently replacing unknown state',async()=>{
    setSong('',0);stop=installArrangementPersistence();
    const pending=expect(waitForArrangementRestore(generation,'song.mp3',100)).rejects.toThrow('Song metadata');
    await vi.advanceTimersByTimeAsync(100);await pending;
  });
  test('restores original library media instead of a same-name interpolated live ramp',()=>{
    const original=new File(['original 24 FPS media'],'clip.mp4');
    const interpolated=new File(['derived 96 FPS media'],'clip.mp4');
    arrangement.update(list=>list.map(section=>({...section,scene:{slots:{
      'top-0':{name:original.name,url:'',file:original},
      'bottom-0':{name:original.name,url:'',file:original},
    }}})));
    const raw=serializeArrangement('song.mp3',30);
    clipLibrary.set([{id:'original',name:original.name,source:{kind:'file',file:original}}] as never);
    videoLayers.set({'top-0':{name:original.name,url:'blob:derived',file:interpolated}} as never);
    try{
      const restored=parseArrangementFile(raw).sections[0].scene!;
      expect(restored.slots['top-0']?.file).toBe(original);
      expect(restored.slots['bottom-0']?.file).toBe(original);
    }finally{videoLayers.set({});}
  });

  test('a pending autosave cannot write into the previous song after replacement or removal',()=>{
    setSong();stop=installArrangementPersistence();
    cuts.set([{step:4,slotIndex:2,timeSeconds:.5}]);
    generation++;setSong('other.mp3',40);
    cuts.set([{step:8,slotIndex:5,timeSeconds:1}]);
    vi.advanceTimersByTime(250);
    expect(storage.has(key())).toBe(false);
    expect(JSON.parse(storage.get(key('other.mp3',40))!).cuts[0].slotIndex).toBe(5);
    cuts.set([{step:12,slotIndex:7,timeSeconds:1.5}]);setSong('',0);
    vi.advanceTimersByTime(250);
    expect(JSON.parse(storage.get(key('other.mp3',40))!).cuts[0].slotIndex).toBe(5);
  });
  test('same-song reload restores the take again and late analysis does not erase it',()=>{
    cuts.set([{step:4,slotIndex:3,timeSeconds:.5123}]);
    storage.set(key(),serializeArrangement('song.mp3',30));resetArrangement();
    setSong();stop=installArrangementPersistence();
    expect(get(cuts)[0].slotIndex).toBe(3);
    applyStructureToArrangement([{start:0,end:30,label:'verse',duration:30,energy:1}],[],120);
    expect(get(cuts)[0].timeSeconds).toBe(.5123);
    resetArrangement();generation++;setSong();
    expect(get(cuts)[0].slotIndex).toBe(3);
  });
  test('matching file name with a different length is rejected before mutation',()=>{
    const raw=serializeArrangement('song.mp3',30);setSong('song.mp3',45);
    const before=get(arrangement);
    expect(()=>loadArrangementFile(raw)).toThrow('matching song');
    expect(get(arrangement)).toBe(before);
  });
  test('missing clips remain warned after autosave and reconnect to media loaded later',()=>{
    arrangement.update(list=>list.map(s=>({...s,scene:{slots:{'top-0':{name:'later.mp4',url:''}}}})));
    storage.set(key(),serializeArrangement('song.mp3',30));resetArrangement();
    setSong();stop=installArrangementPersistence();vi.advanceTimersByTime(250);
    expect(get(arrangementSaveStatus)).toContain('Missing clips: later.mp4');
    clipLibrary.set([{id:'later',name:'later.mp4',source:{kind:'url',url:'https://example.test/later.mp4'}}] as never);
    expect(get(arrangement)[0].scene?.slots['top-0']?.url).toBe('https://example.test/later.mp4');
    expect(get(arrangementMissingClips)).toEqual([]);
    vi.advanceTimersByTime(250);
    expect(get(arrangementSaveStatus)).not.toContain('Missing clips');
  });
  test('preserves a rounded analysis end within 50ms of the decoded song duration',()=>{
    const raw=JSON.parse(serializeArrangement('song.mp3',182.879979));
    raw.sections[0].timeStartS=181.04;raw.sections[0].timeEndS=182.91;
    expect(parseArrangementFile(JSON.stringify(raw)).sections[0].timeEndS).toBe(182.91);
    raw.sections[0].timeEndS=200;
    expect(()=>parseArrangementFile(JSON.stringify(raw))).toThrow('Invalid section time');
  });
});
