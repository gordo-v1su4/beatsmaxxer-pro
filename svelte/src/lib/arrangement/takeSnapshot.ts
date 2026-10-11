import { get } from 'svelte/store';
import { arrangement, sectionStarts, activeSectionIndex, arrangementRecording, type ArrangementSection, applySectionBank, enterSection } from '$lib/stores/arrangement';
import { recordingTakeSerial } from './recorder';
import { timingSettings, type TimingSettings } from '$lib/stores/timing';
import { rackTop, rackBottom, videoLayers, moduleParams } from '$lib/stores/rack';
import { moduleTriggerSource, type ModuleTriggerSource } from '$lib/stores/midiTrigger';
import { pgmSource, commitPgmCut } from '$lib/stores/pgm';
import { playbackWorkspace } from '$lib/stores/rackUi';
import { analysisBeatGrid } from '$lib/stores/triggerLane';
import { captureScene, recallScene } from './sectionScenes';
import { resolveSectionBounds, sectionIndexAtSeconds } from './sectionBounds';
import type { SectionScene } from '$lib/stores/arrangement';

export interface DeckSnapshot { timing: TimingSettings; bank: ArrangementSection['bank']; scene: SectionScene;
  params?:Record<string,Record<string,number>>; triggerSources?:Record<string,ModuleTriggerSource> }
let live: (DeckSnapshot & {pgm:string}) | null = null;
let applied: string | null = null;

function applyParameters(params:Record<string,Record<string,number>>) {
  const next=structuredClone(params),current=get(moduleParams);
  // FIRE is an event counter, not a setting. Recall must not manufacture fires.
  for(const [id,values] of Object.entries(next)) {
    if(current[id]?.trig!==undefined)values.trig=current[id].trig;
    else delete values.trig;
  }
  moduleParams.set(next);
}

export function rememberLiveWorkspace() {
  if (live) return;
  live = { timing: structuredClone(get(timingSettings)), bank: { top: [...get(rackTop)], bottom: [...get(rackBottom)] },
    scene: captureScene(get(videoLayers)), pgm: get(pgmSource),params:structuredClone(get(moduleParams)),triggerSources:{...get(moduleTriggerSource)} };
  applied = null;
}
export function restoreLiveWorkspace() {
  if (!live) return;
  const previous = live; live = null; applied = null;
  timingSettings.set(previous.timing);
  if(previous.params)applyParameters(previous.params);
  if(previous.triggerSources)moduleTriggerSource.set(previous.triggerSources);
  applySectionBank({ bank: previous.bank } as ArrangementSection);
  commitPgmCut(previous.pgm);
  void recallScene(previous.scene).catch(() => {});
}
export function captureTakeSection(positionSeconds: number, bpm: number, expectedSectionId?: string) {
  const sections = get(arrangement);
  const bounds = resolveSectionBounds(sections, get(sectionStarts), get(analysisBeatGrid), bpm);
  const index = sectionIndexAtSeconds(bounds, positionSeconds);
  if (index < 0 || (expectedSectionId && sections[index].id !== expectedSectionId)) return;
  const snapshot: DeckSnapshot = { timing: structuredClone(get(timingSettings)),
    bank: { top: [...get(rackTop)], bottom: [...get(rackBottom)] }, scene: captureScene(get(videoLayers)),
    params:structuredClone(get(moduleParams)),triggerSources:{...get(moduleTriggerSource)} };
  arrangement.update(list => list.map((s,i) => i === index ? { ...s, deckSnapshot: snapshot } : s));
  return sections[index];
}
export async function captureRecalledTakeSection(section: ArrangementSection, positionSeconds: number, bpm: number) {
  const pass = recordingTakeSerial;
  await enterSection(section);
  // A late recall must never write into a later section or a replacement take.
  if (!get(arrangementRecording) || recordingTakeSerial !== pass
    || get(arrangement)[get(activeSectionIndex)]?.id !== section.id) return;
  captureTakeSection(positionSeconds, bpm, section.id);
}
export function applyTakeSection(section: ArrangementSection) {
  if (section.id === applied) return;
  applied = section.id;
  const snapshot = section.deckSnapshot;
  if (!snapshot) return;
  if(snapshot.params)applyParameters(snapshot.params);
  if(snapshot.triggerSources)moduleTriggerSource.set({...snapshot.triggerSources});
  if (get(playbackWorkspace) === 'timing') {
    const current=get(timingSettings);
    // Cache size/resolution and output FPS belong to the current device/project,
    // not a section's musical take. Old takes must not allocate an old budget.
    timingSettings.set({...structuredClone(snapshot.timing),budgetGiB:current.budgetGiB,preloadHeight:current.preloadHeight,outputFps:current.outputFps});
  }
  applySectionBank({ ...section, bank: snapshot.bank });
  return recallScene(snapshot.scene);
}
export function applyTakeAt(positionSeconds: number, bpm: number) {
  const sections=get(arrangement);
  const bounds=resolveSectionBounds(sections,get(sectionStarts),get(analysisBeatGrid),bpm);
  const index=sectionIndexAtSeconds(bounds,positionSeconds);
  if(index>=0)return applyTakeSection(sections[index]);
}
