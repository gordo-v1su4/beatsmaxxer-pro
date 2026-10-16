import { get, writable } from 'svelte/store';
import { audioEngine } from '$lib/audio';
import { addClipsToLibrary } from '$lib/stores/clipLibrary';
import { rackTop, rackBottom, moduleParams, bypassed, midiLayers } from '$lib/stores/rack';
import { viewMode, midiUiOpen } from '$lib/stores/rackUi';
import { restoreMidiChannels } from '$lib/stores/midiChannels';
import { triggerSource, triggerMidiModule } from '$lib/stores/triggerLane';
import { timingSettings, parseTimingSettings } from '$lib/stores/timing';
import { loadTimingBundle } from '$lib/stores/timingSignals';
import { normalizeStructureAnalysis } from '$lib/audio/structureNormalize';
import { arrangement, cuts, applySectionBank, applyStructureToArrangement, autoClips, activeSectionIndex, DEFAULT_ARRANGEMENT, protectRestoredArrangement, resetArrangement, type SectionScene } from '$lib/stores/arrangement';
import { waitForArrangementRestore } from '$lib/arrangement/persistence';
import { clipGroups } from '$lib/arrangement/clipGroups';
import { recallScene } from '$lib/arrangement/sectionScenes';
import { arrangementMode } from '$lib/arrangement/transportMode';
import { listCatalog } from '$lib/modules/catalog';
import { setClipOrder, intervalBeats, feel, commitPgmCut } from '$lib/stores/pgm';
import { moduleTriggerSource } from '$lib/stores/midiTrigger';
import { parsePublishedDemoManifest, type DemoManifest, type DemoAsset } from './demoManifest';

export const workflowLoadStatus = writable('');
export let loadedDemo: { id: string; generation: number } | undefined;
let catalog: DemoManifest | undefined;
export async function fetchDemoCatalog() {
  const response = await fetch('/demo-media/manifest.json');
  if (!response.ok) throw new Error('The demo media is unavailable. Try again shortly.');
  return catalog = parsePublishedDemoManifest(await response.json());
}
async function downloadAsset(asset: DemoAsset) {
  const response = await fetch(asset.path);
  if (!response.ok) throw new Error(`Could not load ${asset.name}. Retry the workflow.`);
  const bytes = await response.arrayBuffer();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (bytes.byteLength !== asset.size || digest !== asset.sha256) throw new Error(`Demo file failed verification: ${asset.name}`);
  return new File([bytes], asset.name, { type: asset.type });
}

/** One public bundle, using the same original media, scene recall and take model as user workflows. */
export async function loadCompleteDemo(workspace: 'perform' | 'timing' = 'perform', expectedSong?: { name: string; duration: number }) {
  if (get(arrangementMode) !== 'live') throw new Error('End REC or PLAY before loading a workflow.');
  if (audioEngine.getState().playing) throw new Error('Stop playback before loading a workflow.');
  workflowLoadStatus.set('Loading demo files…');
  try {
    const manifest = catalog ?? await fetchDemoCatalog();
    const assets = [manifest.song, manifest.analysis, manifest.midi, manifest.structure, ...manifest.clips];
    let finished = 0;
    // Limit simultaneous downloads and keep progress tied to verified files.
    const files: File[] = [];
    for (let i = 0; i < assets.length; i += 3) {
      files.push(...await Promise.all(assets.slice(i, i + 3).map(async asset => {
        const file = await downloadAsset(asset);
        workflowLoadStatus.set(`Loading demo · ${++finished}/${assets.length} files`);
        return file;
      })));
    }
    const [song, analysisFile, midiFile, structureFile, ...clips] = files;
    const analysis = JSON.parse(await analysisFile.text()), midi = JSON.parse(await midiFile.text());
    const structure = JSON.parse(await structureFile.text());
    if (analysis.sourceSha256 !== manifest.song.sha256 || midi.sourceSha256 !== manifest.song.sha256 || structure.sourceSha256 !== manifest.song.sha256) throw new Error('Demo analysis does not match its song.');
    if (expectedSong) {
      const decoded = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(await song.arrayBuffer());
      if (song.name !== expectedSong.name || Math.abs(decoded.duration - expectedSong.duration) > .001) throw new Error('Workflow demo song does not match the published bundle.');
    }
    analysis.structure = structure.result.structure;
    // All bytes are verified before replacing the current song/take.
    workflowLoadStatus.set('Building demo arrangement…');
    const bank = structuredClone(DEFAULT_ARRANGEMENT[0].bank);
    const modules = listCatalog();
    moduleParams.set(Object.fromEntries(modules.map(def => [def.id, { ...def.params }])));
    const triggerSources = Object.fromEntries(modules.map(def => [def.id, 'audio' as const]));
    moduleTriggerSource.set(triggerSources);
    // A demo replaces the previous song's MIDI routing too. Timing imports its
    // matching Redline events below, independently of Perform's card channels.
    restoreMidiChannels([], null); midiLayers.set({}); midiUiOpen.set(false);
    triggerSource.set('audio'); triggerMidiModule.set(null);
    bypassed.set(Object.fromEntries(modules.map(def => [def.id, false])));
    setClipOrder('random'); intervalBeats.set(4); feel.set(0);
    applySectionBank({ ...DEFAULT_ARRANGEMENT[0], bank });
    viewMode.set(workspace);
    const timing = parseTimingSettings(null);
    // All ten originals also appear in Ramp slots across the two banks.
    // Keep their 96 FPS frame cache within an 8 GiB demo budget.
    timing.preloadHeight = 270; timing.budgetGiB = 8; timing.outputFps = 24;
    timing.trigger = { ...timing.trigger, source: 'midi', channel: 'all', threshold: 0, density: 65, rampChance: 40, repeatStyle: 'energy', gapSeconds: .18, seed: 42 };
    timingSettings.set(timing);
    await loadTimingBundle(analysis, midi, song);
    await addClipsToLibrary(clips);
    await waitForArrangementRestore(audioEngine.getUploadedTrackLoadGeneration(),song.name);
    // Posters and song metadata may yield to autosave. The explicit demo owns
    // its layout after that restore; clear its protection before reseeding.
    resetArrangement();
    applyStructureToArrangement(normalizeStructureAnalysis(analysis.structure).sections, analysis.beats, analysis.bpm);
    const slots = [...get(rackTop).map((_, i) => `top-${i}`), ...get(rackBottom).map((_, i) => `bottom-${i}`)];
    const scene = (offset: number): SectionScene => ({ slots: Object.fromEntries(slots.map((slot, i) => {
      const file = clips[offset + i % 5]; return [slot, { name: file.name, url: '', file }];
    })) });
    const groups = [{ id: 'demo-verse', name: 'Verse · Bank A', scene: scene(0) }, { id: 'demo-chorus', name: 'Chorus · Bank B', scene: scene(5) }];
    clipGroups.set(groups);
    const params = structuredClone(get(moduleParams));
    const sections = get(arrangement).map(section => {
      const chorus = section.kind === 'chorus' || section.kind === 'hook' || /chorus|hook/i.test(section.name);
      const group = groups[chorus ? 1 : 0];
      return { ...section, bank: structuredClone(bank), clipGroupId: group.id, scene: group.scene,
        deckSnapshot: { timing: structuredClone(timing), bank: structuredClone(bank), scene: group.scene, params: structuredClone(params), triggerSources: { ...triggerSources } } };
    });
    if (!sections.some(s => s.clipGroupId === groups[1].id)) throw new Error('Demo has no chorus sections.');
    protectRestoredArrangement(); arrangement.set(sections);
    cuts.set((analysis.beats as number[]).flatMap((time, beat) => {
      if (time >= audioEngine.getState().duration) return [];
      const section = sections.find(s => time >= (s.timeStartS ?? 0) && time < (s.timeEndS ?? Infinity));
      const interval = section?.clipGroupId === groups[1].id ? 2 : 4;
      return beat % interval === 0 ? [{ step: beat * 4, slotIndex: Math.floor(beat / interval) % 10, timeSeconds: time }] : [];
    }));
    autoClips.set(true); activeSectionIndex.set(0);
    const recalled = await recallScene(sections[0].scene!);
    if (recalled.failed.length) throw new Error(`Demo clips did not load: ${recalled.failed.join(', ')}`);
    commitPgmCut(bank.top[0]);
    loadedDemo = { id: manifest.id, generation: audioEngine.getUploadedTrackLoadGeneration() };
    workflowLoadStatus.set(`${manifest.title} · ${sections.length} sections · 2 clip banks · ${workspace === 'timing' ? 'loaded; Ramp preparation may still be running' : 'ready'}`);
    return manifest;
  } catch (error) {
    workflowLoadStatus.set(error instanceof Error ? error.message : String(error)); throw error;
  }
}
