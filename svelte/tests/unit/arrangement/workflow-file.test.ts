import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { get } from 'svelte/store';
import { audioEngine } from '$lib/audio';
import { arrangement, cuts, resetArrangement } from '$lib/stores/arrangement';
import { clipGroups } from '$lib/arrangement/clipGroups';
import { videoLayers, moduleParams, bypassed, midiLayers } from '$lib/stores/rack';
import { transportDisplay } from '$lib/stores/transportDisplay';
import { playbackWorkspace } from '$lib/stores/rackUi';
import { timingSettings } from '$lib/stores/timing';
import { autoRandom, linearOrder, intervalBeats, feel, setClipOrder } from '$lib/stores/pgm';
import { autoClips } from '$lib/stores/arrangement';
import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
import { listCatalog } from '$lib/modules/catalog';
import { workflowLoadStatus } from '$lib/runtime/demoWorkflow';
import { timingInput, resolveTimingSignal } from '$lib/stores/timingSignals';
import { midiChannels, activeChannelId, restoreMidiChannels } from '$lib/stores/midiChannels';
import { midiUiOpen } from '$lib/stores/rackUi';
import { triggerSource, triggerMidiModule } from '$lib/stores/triggerLane';
import { serializeWorkflow, parseWorkflow, loadWorkflowFile } from '$lib/runtime/workflowFile';

const display = get(transportDisplay), params = get(moduleParams), timing = get(timingSettings);
const workspace = get(playbackWorkspace);
const initialBypass = get(bypassed);
const originalSignals={input:get(timingInput),channels:get(midiChannels),active:get(activeChannelId),layers:get(midiLayers),open:get(midiUiOpen),source:get(triggerSource),module:get(triggerMidiModule)};
const performanceSettings = { random: get(autoRandom), linear: get(linearOrder), interval: get(intervalBeats), feel: get(feel), autoClips: get(autoClips) };
beforeEach(() => {
  resetArrangement(); clipGroups.set([]); videoLayers.set({});
  transportDisplay.update(value => ({ ...value, trackName: 'my-song.mp3', duration: 30 }));
  vi.spyOn(audioEngine, 'getState').mockReturnValue({ ...audioEngine.getState(), playing: false });
});
afterEach(() => {
  vi.restoreAllMocks(); resetArrangement(); clipGroups.set([]); videoLayers.set({});
  transportDisplay.set(display); moduleParams.set(params); timingSettings.set(timing); playbackWorkspace.set(workspace);
  autoRandom.set(performanceSettings.random); linearOrder.set(performanceSettings.linear); intervalBeats.set(performanceSettings.interval); feel.set(performanceSettings.feel); autoClips.set(performanceSettings.autoClips);
  bypassed.set(initialBypass);
  timingInput.set(originalSignals.input);restoreMidiChannels(originalSignals.channels,originalSignals.active);midiLayers.set(originalSignals.layers);midiUiOpen.set(originalSignals.open);triggerSource.set(originalSignals.source);triggerMidiModule.set(originalSignals.module);
});

test('workflow roundtrip preserves banks, cuts, workspace and live settings without embedding media', () => {
  playbackWorkspace.set('timing');
  const file = new File(['original video bytes'], 'my-clip.mp4');
  const scene = { slots: { 'top-0': { name: file.name, url: 'blob:private', file } } };
  videoLayers.set({ 'top-0': scene.slots['top-0'] } as never);
  clipGroups.set([{ id: 'verse', name: 'My verse bank', scene }]);
  arrangement.update(sections => sections.map(section => ({ ...section, clipGroupId: 'verse', scene })));
  cuts.set([{ step: 0, slotIndex: 0, timeSeconds: 0 }, { step: 16, slotIndex: 2, timeSeconds: 2 }]);
  const raw = serializeWorkflow(), parsed = parseWorkflow(raw);
  expect(parsed.settings.workspace).toBe('timing');
  expect(parsed.groups[0].name).toBe('My verse bank');
  expect(parsed.sections[0].clipGroupId).toBe('verse');
  expect(parsed.cuts).toEqual(get(cuts));
  expect(parsed.live.deckSnapshot?.timing).toMatchObject(get(timingSettings));
  expect(raw).not.toContain('blob:private'); expect(raw).not.toContain('original video bytes');
});

test('invalid live parameters fail before changing the current arrangement or song', async () => {
  const doc = JSON.parse(serializeWorkflow());
  doc.workflow.live.params = { speedramp: { mix: 'invalid' } };
  const before = get(arrangement), load = vi.spyOn(audioEngine, 'loadAudioFile');
  await expect(loadWorkflowFile(JSON.stringify(doc))).rejects.toThrow('Invalid take effect parameters');
  expect(get(arrangement)).toBe(before); expect(load).not.toHaveBeenCalled();
});

test('a user-media workflow requests its matching song without destroying the current take', async () => {
  const raw = serializeWorkflow(), before = get(arrangement);
  transportDisplay.update(value => ({ ...value, trackName: 'different-song.mp3' }));
  await expect(loadWorkflowFile(raw)).rejects.toThrow('Load the matching song first');
  expect(get(arrangement)).toBe(before);
});

test('restores performance controls and explicitly empty live slots', async () => {
  setClipOrder('linear'); intervalBeats.set(8); feel.set(2); autoClips.set(false);
  bypassed.set({ ...get(bypassed), speedramp: true });
  const raw = serializeWorkflow();
  setClipOrder('random'); intervalBeats.set(1); feel.set(0); autoClips.set(true);
  bypassed.set({ ...get(bypassed), speedramp: false });
  const clear = vi.spyOn(mediaRuntime, 'removeModuleClip').mockResolvedValue();
  await loadWorkflowFile(raw);
  expect(get(linearOrder)).toBe(true); expect(get(autoRandom)).toBe(false);
  expect(get(intervalBeats)).toBe(8); expect(get(feel)).toBe(2); expect(get(autoClips)).toBe(false);
  expect(get(bypassed).speedramp).toBe(true);
  expect(clear).toHaveBeenCalledTimes(10);
});

test('rejects invalid performance controls before replacing the current take', async () => {
  const doc = JSON.parse(serializeWorkflow()), before = get(arrangement);
  doc.workflow.perform.intervalBeats = -1;
  await expect(loadWorkflowFile(JSON.stringify(doc))).rejects.toThrow('Invalid workflow performance settings');
  expect(get(arrangement)).toBe(before);
});

test.each(['live', 'section', 'take'])('rejects unknown modules in the %s bank before replacing work', async target => {
  const doc = JSON.parse(serializeWorkflow()), before = get(arrangement);
  doc.sections[0].deckSnapshot = structuredClone(doc.workflow.live);
  const bank = target === 'live' ? doc.workflow.live.bank : target === 'section' ? doc.sections[0].bank : doc.sections[0].deckSnapshot.bank;
  bank.top[0] = 'nonexistent-module';
  await expect(loadWorkflowFile(JSON.stringify(doc))).rejects.toThrow('Invalid workflow module bank');
  expect(get(arrangement)).toBe(before);
});

test.each(['wrong-row', 'duplicate'])('rejects a %s module assignment without replacing work', async kind => {
  const doc = JSON.parse(serializeWorkflow()), before = get(arrangement), bank = doc.workflow.live.bank;
  bank.top[0] = kind === 'duplicate' ? bank.top[1] : listCatalog().find(module => module.row === 'bottom')!.id;
  await expect(loadWorkflowFile(JSON.stringify(doc))).rejects.toThrow('Invalid workflow module bank');
  expect(get(arrangement)).toBe(before);
});

test('missing live-only originals instruct users to reimport after adding media', async () => {
  videoLayers.set({ 'top-0': { name: 'missing.mp4', url: 'blob:original' } } as never);
  const raw = serializeWorkflow(); videoLayers.set({});
  vi.spyOn(mediaRuntime, 'removeModuleClip').mockResolvedValue();
  vi.spyOn(mediaRuntime, 'registerModuleClip').mockResolvedValue({ status: 'failed', error: 'missing', previous: null });
  await loadWorkflowFile(raw);
  expect(get(workflowLoadStatus)).toContain('add missing originals to CLIPS, then load this workflow again');
});

test.each(['section','bank'])('reports an original missing only from a later %s',async where=>{
  const scene={slots:{'top-0':{name:'later.mp4',url:''}}};
  if(where==='section')arrangement.update(sections=>[...sections,{...sections[0],id:'later-section',name:'Later section',scene}]);
  else clipGroups.set([{id:'later',name:'Later bank',scene}]);
  const raw=serializeWorkflow();
  vi.spyOn(mediaRuntime,'removeModuleClip').mockResolvedValue();
  await loadWorkflowFile(raw);
  expect(get(workflowLoadStatus)).toContain('add missing originals to CLIPS');
});

test('custom workflows restore actual Timing and Perform MIDI events after a new song generation',async()=>{
  const notes=[{time:1,note:60,velocity:100},{time:2,note:64,velocity:80}],events=[{time:1,strength:.8},{time:2,strength:.6}];
  const generation=audioEngine.getUploadedTrackLoadGeneration();
  timingInput.set({generation,name:'my-song.mp3',bpm:120,beats:[0,.5,1],duration:30,midi:[{name:'KICK',events}],features:{mix:{onsets:events,activity:[],loudness:[]}}});
  restoreMidiChannels([{id:'midi-42',name:'KICK',onsets:[1,2],noteCount:2,duration:30,firstOnset:1,color:'#5fb8ff',notes}],'midi-42');
  midiLayers.update(layers=>({...layers,transition:{name:'kick.mid',notes,duration:30}}));midiUiOpen.set(true);triggerSource.set('midi');triggerMidiModule.set('transition');
  const raw=serializeWorkflow();
  timingInput.set(null);restoreMidiChannels([],null);midiLayers.set({});midiUiOpen.set(false);triggerSource.set('audio');triggerMidiModule.set(null);
  vi.spyOn(audioEngine,'getUploadedTrackLoadGeneration').mockReturnValue(generation+1);
  vi.mocked(audioEngine.getState).mockReturnValue({...audioEngine.getState(),usingUploadedTrack:true});
  vi.spyOn(mediaRuntime,'removeModuleClip').mockResolvedValue();
  await loadWorkflowFile(raw);
  expect(get(timingInput)?.generation).toBe(generation+1);expect(get(timingInput)?.midi[0].events).toEqual(events);
  expect(resolveTimingSignal({...get(timingSettings).trigger,source:'midi'},120,30).channels[0].events).toEqual(events);
  expect(get(midiLayers).transition?.notes).toEqual(notes);expect(get(midiChannels)[0].notes).toEqual(notes);
  expect(get(activeChannelId)).toBe('midi-42');expect(get(midiUiOpen)).toBe(true);expect(get(triggerSource)).toBe('midi');expect(get(triggerMidiModule)).toBe('transition');
});

test('invalid embedded events preserve the current take',async()=>{
  const doc=JSON.parse(serializeWorkflow()),before=get(arrangement);
  doc.workflow.signals.timing={name:'my-song.mp3',bpm:120,duration:30,beats:[0,1],features:{},midi:[{name:'KICK',events:[{time:1,strength:10}]}]};
  await expect(loadWorkflowFile(JSON.stringify(doc))).rejects.toThrow('Invalid workflow trigger data');expect(get(arrangement)).toBe(before);
});

test('workflow preserves exact source rhythm and audio controls despite display tempo rounding',async()=>{
  const sound={...audioEngine.getSoundTouchState(),tempo:1.35,pitchSemitones:2,keySemitones:-3,analysisKeyIndex:7,volume:.42};
  vi.spyOn(audioEngine,'getSoundTouchState').mockReturnValue(sound);
  vi.mocked(audioEngine.getState).mockReturnValue({...audioEngine.getState(),bpm:169,duration:30});
  vi.spyOn(audioEngine,'getAnalysisBpm').mockReturnValue(125.39);
  vi.spyOn(audioEngine,'getBeatGrid').mockReturnValue([0,.4785,.957]);
  vi.spyOn(audioEngine,'getAnalysisOnsets').mockReturnValue([1,2]);
  const raw=serializeWorkflow(),doc=parseWorkflow(raw);
  expect(doc.signals?.rhythm?.bpm).toBe(125.39);
  const rhythm=vi.spyOn(audioEngine,'applyPreparedRhythm').mockImplementation(()=>{});
  const cancelAnalysis=vi.spyOn(audioEngine,'cancelPendingAnalysis');
  const tempo=vi.spyOn(audioEngine,'setTempo').mockImplementation(()=>{});
  const pitch=vi.spyOn(audioEngine,'setPitch').mockImplementation(()=>{});
  const volume=vi.spyOn(audioEngine,'setVolume').mockImplementation(()=>{});
  const key=vi.spyOn(audioEngine,'nudgeKey').mockImplementation(()=>{});
  vi.mocked(audioEngine.getSoundTouchState).mockReturnValue({...sound,keySemitones:0});
  vi.spyOn(mediaRuntime,'removeModuleClip').mockResolvedValue();
  await loadWorkflowFile(raw);
  expect(cancelAnalysis).toHaveBeenCalledOnce();
  expect(cancelAnalysis.mock.invocationCallOrder[0]).toBeLessThan(rhythm.mock.invocationCallOrder[0]);
  expect(rhythm).toHaveBeenCalledWith({bpm:125.39,beats:[0,.4785,.957],onsets:[1,2],duration:30,keyIndex:7});
  expect(tempo).toHaveBeenCalledWith(1.35);expect(pitch).toHaveBeenCalledWith(2);expect(volume).toHaveBeenCalledWith(.42);expect(key).toHaveBeenCalledWith(-3);
});

test('older custom MIDI workflows explicitly request missing trigger imports',async()=>{
  const doc=JSON.parse(serializeWorkflow());delete doc.workflow.signals;
  doc.workflow.live.triggerSources={transition:'midi'};
  vi.spyOn(mediaRuntime,'removeModuleClip').mockResolvedValue();
  await loadWorkflowFile(JSON.stringify(doc));
  expect(get(workflowLoadStatus)).toContain('import matching MIDI or analysis');
});
