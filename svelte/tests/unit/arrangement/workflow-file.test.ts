import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { get } from 'svelte/store';
import { audioEngine } from '$lib/audio';
import { arrangement, cuts, resetArrangement } from '$lib/stores/arrangement';
import { clipGroups } from '$lib/arrangement/clipGroups';
import { videoLayers, moduleParams, bypassed } from '$lib/stores/rack';
import { transportDisplay } from '$lib/stores/transportDisplay';
import { playbackWorkspace } from '$lib/stores/rackUi';
import { timingSettings } from '$lib/stores/timing';
import { autoRandom, linearOrder, intervalBeats, feel, setClipOrder } from '$lib/stores/pgm';
import { autoClips } from '$lib/stores/arrangement';
import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
import { listCatalog } from '$lib/modules/catalog';
import { workflowLoadStatus } from '$lib/runtime/demoWorkflow';
import { serializeWorkflow, parseWorkflow, loadWorkflowFile } from '$lib/runtime/workflowFile';

const display = get(transportDisplay), params = get(moduleParams), timing = get(timingSettings);
const workspace = get(playbackWorkspace);
const initialBypass = get(bypassed);
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
