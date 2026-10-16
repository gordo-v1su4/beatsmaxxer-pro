import { get } from 'svelte/store';
import { audioEngine } from '$lib/audio';
import { serializeArrangement, parseArrangementFile, loadArrangementFile, arrangementSaveStatus } from '$lib/arrangement/persistence';
import { arrangementMode } from '$lib/arrangement/transportMode';
import { captureScene, recallScene } from '$lib/arrangement/sectionScenes';
import { applySectionBank, autoClips } from '$lib/stores/arrangement';
import { autoRandom, linearOrder, intervalBeats, feel, setClipOrder } from '$lib/stores/pgm';
import { rackTop, rackBottom, videoLayers, moduleParams, bypassed } from '$lib/stores/rack';
import { moduleTriggerSource } from '$lib/stores/midiTrigger';
import { timingSettings } from '$lib/stores/timing';
import { playbackWorkspace, viewMode } from '$lib/stores/rackUi';
import { transportDisplay } from '$lib/stores/transportDisplay';
import { loadedDemo, loadCompleteDemo, fetchDemoCatalog, workflowLoadStatus } from './demoWorkflow';
import { canPlaceInRow, getModuleDef } from '$lib/modules/catalog';
import { captureWorkflowSignals, parseWorkflowSignals, restoreWorkflowSignals } from './workflowSignals';

function validateModuleBank(bank: { top: string[]; bottom: string[] }) {
  const ids = [...bank.top, ...bank.bottom];
  if (new Set(ids).size !== ids.length) throw new Error('Invalid workflow module bank.');
  for (const row of ['top', 'bottom'] as const) for (const id of bank[row]) {
    const module = getModuleDef(id);
    if (!module || !canPlaceInRow(module, row)) throw new Error('Invalid workflow module bank.');
  }
}

export function serializeWorkflow() {
  const song = get(transportDisplay);
  if (!song.trackName || song.duration <= 0) throw new Error('Load a song before saving a workflow.');
  const doc = JSON.parse(serializeArrangement(song.trackName, song.duration));
  const scene = captureScene(get(videoLayers));
  doc.workflow = {
    version: 1, workspace: get(playbackWorkspace), signals: captureWorkflowSignals(),
    perform: { clipOrder: get(autoRandom) ? 'random' : get(linearOrder) ? 'linear' : 'hold', intervalBeats: get(intervalBeats), feel: get(feel), autoClips: get(autoClips) },
    demoId: loadedDemo?.generation === audioEngine.getUploadedTrackLoadGeneration() ? loadedDemo.id : undefined,
    live: { bank: { top: get(rackTop), bottom: get(rackBottom) }, timing: get(timingSettings),
      params: get(moduleParams), triggerSources: get(moduleTriggerSource), bypassed: get(bypassed),
      scene: { slots: Object.fromEntries(Object.entries(scene.slots).map(([slot, clip]) => [slot, clip ? { name: clip.name } : null])) } }
  };
  return JSON.stringify(doc, null, 2);
}

export function parseWorkflow(raw: string) {
  if (raw.length > 20 * 1024 * 1024) throw new Error('Workflow file is too large.');
  const doc = JSON.parse(raw), settings = doc.workflow;
  if (!settings || settings.version !== 1 || !['perform', 'timing'].includes(settings.workspace)
    || (settings.demoId !== undefined && settings.demoId !== 'redline-complete-v1')
    || settings.live?.timing?.version !== 1) throw new Error('Unsupported workflow file. Use Load Arrangement for an arrangement-only file.');
  const signals=parseWorkflowSignals(settings.signals);
  const perform = settings.perform;
  if (perform !== undefined && (!perform || !['hold', 'linear', 'random'].includes(perform.clipOrder)
    || ![1, 2, 4, 8, 16, 32].includes(perform.intervalBeats) || ![0, 1, 2].includes(perform.feel)
    || typeof perform.autoClips !== 'boolean')) throw new Error('Invalid workflow performance settings.');
  const bypass = settings.live.bypassed;
  if (bypass !== undefined && (!bypass || typeof bypass !== 'object' || Array.isArray(bypass)
    || Object.keys(bypass).length > 100 || Object.values(bypass).some(value => typeof value !== 'boolean'))) throw new Error('Invalid workflow bypass settings.');
  const parsed = parseArrangementFile(raw);
  // Reuse the established scene, bank, parameter and Timing validators.
  const live = parseArrangementFile(JSON.stringify({ ...doc, cuts: [], sections: [{ ...doc.sections[0], scene: settings.live.scene, bank: settings.live.bank, deckSnapshot: settings.live }] }));
  for (const section of [...parsed.sections, ...live.sections]) {
    validateModuleBank(section.bank);
    if (section.deckSnapshot) validateModuleBank(section.deckSnapshot.bank);
  }
  return { ...parsed, settings, signals, live: live.sections[0], raw };
}

export async function loadWorkflowFile(raw: string) {
  if (get(arrangementMode) !== 'live' || audioEngine.getState().playing) throw new Error('Stop playback and end REC/PLAY before loading a workflow.');
  const initial = parseWorkflow(raw); // Validate everything before replacing the take.
  const song = get(transportDisplay);
  if (initial.settings.demoId) {
    const manifest = await fetchDemoCatalog();
    if (manifest.id !== initial.settings.demoId || manifest.song.name !== initial.song.name) throw new Error('Workflow demo song does not match the published bundle.');
    await loadCompleteDemo(initial.settings.workspace, initial.song);
  } else if (song.trackName !== initial.song.name || Math.abs(song.duration - initial.song.duration) > .001) {
    throw new Error(`Load the matching song first: ${initial.song.name}. Workflow files reference your original media; they do not embed it.`);
  }
  // Resolve names again after the public demo has populated the clip library.
  const resolved = parseWorkflow(raw), snapshot = resolved.live.deckSnapshot!;
  if(resolved.signals)restoreWorkflowSignals(resolved.signals);
  loadArrangementFile(raw);
  timingSettings.set(snapshot.timing);
  if (snapshot.params) moduleParams.set(snapshot.params);
  if (snapshot.triggerSources) moduleTriggerSource.set(snapshot.triggerSources);
  if (resolved.settings.live.bypassed) bypassed.set(resolved.settings.live.bypassed);
  if (resolved.settings.perform) {
    const perform = resolved.settings.perform;
    setClipOrder(perform.clipOrder); intervalBeats.set(perform.intervalBeats); feel.set(perform.feel); autoClips.set(perform.autoClips);
  }
  applySectionBank(resolved.live);
  viewMode.set(resolved.settings.workspace);
  const emptySlots = Object.entries(snapshot.scene.slots).filter(([, clip]) => clip === null).map(([slot]) => slot);
  if (emptySlots.length) {
    const { mediaRuntime } = await import('$lib/runtime/media/MediaRuntime');
    await Promise.all(emptySlots.map(slot => mediaRuntime.removeModuleClip(slot)));
  }
  const recalled = await recallScene(snapshot.scene);
  const missing=[...new Set([...resolved.missing,...recalled.failed])];
  if (missing.length) arrangementSaveStatus.set(`Workflow loaded · relink missing clips: ${missing.join(', ')}`);
  const legacySignalsMissing=!resolved.signals&&!resolved.settings.demoId&&(resolved.settings.workspace==='timing'&&!['pgm','beat','continuous'].includes(snapshot.timing.trigger.source)||Object.values(snapshot.triggerSources??{}).includes('midi'));
  workflowLoadStatus.set(missing.length ? 'Workflow loaded · add missing originals to CLIPS, then load this workflow again' : legacySignalsMissing ? 'Workflow loaded · import matching MIDI or analysis; this older file has no trigger events' : 'Workflow loaded · sections, banks, cuts and settings restored');
  return resolved;
}

export function downloadWorkflow() {
  const blob = new Blob([serializeWorkflow()], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = 'beatsmaxxer.workflow.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  workflowLoadStatus.set('Workflow saved · original media is referenced, not embedded');
}
