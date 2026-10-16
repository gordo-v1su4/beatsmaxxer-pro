import { afterEach, expect, test, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { get } from 'svelte/store';
import { loadCompleteDemo, fetchDemoCatalog } from '$lib/runtime/demoWorkflow';
import { audioEngine } from '$lib/audio';
import { arrangement } from '$lib/stores/arrangement';
import { moduleParams } from '$lib/stores/rack';
import * as manifestParser from '$lib/runtime/demoManifest';
import * as signals from '$lib/stores/timingSignals';
import * as library from '$lib/stores/clipLibrary';
import * as persistence from '$lib/arrangement/persistence';
import * as scenes from '$lib/arrangement/sectionScenes';
import { midiLayers } from '$lib/stores/rack';
import { midiUiOpen } from '$lib/stores/rackUi';
import { midiChannels, activeChannelId, restoreMidiChannels } from '$lib/stores/midiChannels';
import { triggerSource, triggerMidiModule } from '$lib/stores/triggerLane';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
test('a demo workflow with the wrong decoded song duration preserves the current take', async () => {
  vi.spyOn(manifestParser, 'parsePublishedDemoManifest').mockImplementation(manifestParser.parseDemoManifest);
  const files = new Map<string, string>();
  const asset = (name: string, bytes: string, ext: string) => {
    const sha256 = createHash('sha256').update(bytes).digest('hex'), path = `/demo-media/${sha256}.${ext}`;
    files.set(path, bytes);
    return { name, path, sha256, size: Buffer.byteLength(bytes), type: 'application/octet-stream' };
  };
  const song = asset('redline.mp3', 'song bytes', 'mp3');
  const json = JSON.stringify({ sourceSha256: song.sha256 });
  const manifest = { version: 1, id: 'redline-complete-v1', title: 'Demo', song,
    analysis: asset('analysis.json', json, 'json'), midi: asset('midi.json', json, 'json'), structure: asset('structure.json', json, 'json'),
    clips: Array.from({ length: 10 }, (_, i) => asset(`clip ${i}.mp4`, `clip ${i}`, 'mp4')) };
  vi.stubGlobal('fetch', vi.fn(async (path: string) => new Response(path === '/demo-media/manifest.json' ? JSON.stringify(manifest) : files.get(path))));
  vi.stubGlobal('OfflineAudioContext', class { async decodeAudioData() { return { duration: 183 }; } });
  const load = vi.spyOn(audioEngine, 'loadAudioFile'), before = get(arrangement), params = get(moduleParams);
  await expect(loadCompleteDemo('perform', { name: song.name, duration: 30 })).rejects.toThrow('Workflow demo song does not match');
  expect(get(arrangement)).toBe(before); expect(get(moduleParams)).toBe(params); expect(load).not.toHaveBeenCalled();
});

test('the complete Perform demo replaces stale custom MIDI routing without erasing its matching Timing events',async()=>{
  vi.spyOn(manifestParser,'parsePublishedDemoManifest').mockImplementation(manifestParser.parseDemoManifest);
  const files=new Map<string,string>();
  const asset=(name:string,bytes:string,ext:string)=>{
    const sha256=createHash('sha256').update(bytes).digest('hex'),path=`/demo-media/${sha256}.${ext}`;files.set(path,bytes);
    return {name,path,sha256,size:Buffer.byteLength(bytes),type:'application/octet-stream'};
  };
  const song=asset('redline.mp3','song bytes','mp3'),beats=Array.from({length:60},(_,i)=>i/2);
  const analysis={sourceSha256:song.sha256,beats,bpm:120};
  const structure={sourceSha256:song.sha256,result:{structure:{sections:[{start:0,end:15,label:'verse'},{start:15,end:30,label:'chorus'}]}}};
  const manifest={version:1,id:'redline-complete-v1',title:'Demo',song,analysis:asset('analysis.json',JSON.stringify(analysis),'json'),midi:asset('midi.json',JSON.stringify({sourceSha256:song.sha256}),'json'),structure:asset('structure.json',JSON.stringify(structure),'json'),clips:Array.from({length:10},(_,i)=>asset(`clip ${i}.mp4`,`clip ${i}`,'mp4'))};
  vi.stubGlobal('fetch',vi.fn(async(path:string)=>new Response(path==='/demo-media/manifest.json'?JSON.stringify(manifest):files.get(path))));
  await fetchDemoCatalog();
  const notes=[{time:1,note:60,velocity:100}];
  restoreMidiChannels([{id:'midi-old',name:'OLD SONG',onsets:[1],noteCount:1,duration:30,firstOnset:1,color:'#5fb8ff',notes}],'midi-old');
  midiLayers.set({transition:{name:'old.mid',notes,duration:30}});midiUiOpen.set(true);triggerSource.set('midi');triggerMidiModule.set('transition');
  vi.spyOn(audioEngine,'getState').mockReturnValue({...audioEngine.getState(),playing:false,duration:30});
  vi.spyOn(signals,'loadTimingBundle').mockImplementation(async()=>{signals.timingInput.set({generation:audioEngine.getUploadedTrackLoadGeneration(),name:song.name,bpm:120,beats,duration:30,features:{},midi:[{name:'REDLINE',events:[{time:2,strength:1}]}]});});
  vi.spyOn(library,'addClipsToLibrary').mockResolvedValue([]);
  vi.spyOn(persistence,'waitForArrangementRestore').mockResolvedValue();
  vi.spyOn(scenes,'recallScene').mockResolvedValue({failed:[]} as never);
  await loadCompleteDemo('perform');
  expect(get(triggerSource)).toBe('audio');expect(get(triggerMidiModule)).toBeNull();expect(get(midiChannels)).toEqual([]);expect(get(activeChannelId)).toBeNull();
  expect(get(midiLayers)).toEqual({});expect(get(midiUiOpen)).toBe(false);
  expect(get(signals.timingInput)?.midi[0].events).toEqual([{time:2,strength:1}]);
  expect(get(arrangement).map(section=>section.clipGroupId)).toEqual(['demo-verse','demo-chorus']);
});
