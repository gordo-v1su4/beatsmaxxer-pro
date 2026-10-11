import { loadRedlineTimingReference } from '$lib/stores/timingSignals';
import { timingSettings, readTimingPreset, effectiveClipTiming } from '$lib/stores/timing';
import { get } from 'svelte/store';
import { activeRackSlotIds } from '$lib/stores/rack';
import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
import { videoPool } from '$lib/media/VideoPool';
import { viewMode } from '$lib/stores/rackUi';
import { fetchManifestClipFiles } from '$lib/media/loadRackClips';
import { audioEngine } from '$lib/audio';
import { addClipsToLibrary } from '$lib/stores/clipLibrary';

/** Prepared song, MIDI and analysis share a verified SHA; never rerun analysis. */
export async function loadSavedRedlinePreset(preparedClips = true) {
  audioEngine.stop('operator');
  viewMode.set('timing');
  timingSettings.update(s => ({ ...s, scope: 'global', master: undefined, clips: {}, deckTriggers: {},
    preloadHeight: 540, outputFps: 24, trigger: { ...s.trigger, source: 'midi', channel: 'all',
      rampChance: 40, density: 70, repeatStyle: 'energy', threshold: 0, gapSeconds: .12, seed: 42 } }));
  const saved=readTimingPreset();
  if(saved)timingSettings.set(saved);
  await loadRedlineTimingReference();
  const names=Array.from({length:8},(_,i)=>`deck-${i+1}-720.mp4`);
  if(preparedClips)names.push(...[1,4,6,8].map(id=>`deck-${id}-720-rife4.mp4`));
  const prepared = preparedClips
    ? await Promise.all(names.map(async name => {
      const response = await fetch(`/benchmark-fixtures/benchmark/${name}`);
      if (!response.ok) throw new Error(`Saved clip unavailable: ${name}`);
      return new File([await response.blob()], name, { type: 'video/mp4' });
    })) : undefined;
  const slots=activeRackSlotIds();
  const files=prepared ? slots.map((slot,i)=>{
    const id=i%8+1;
    const variant=prepared.find(file=>file.name===`deck-${id}-720-rife4.mp4`);
    return effectiveClipTiming(get(timingSettings),slot).effect==='ramp'&&variant ? variant : prepared[id-1];
  }) : await fetchManifestClipFiles(10);
  const results=await Promise.all(slots.map((slot,i)=>mediaRuntime.registerModuleFileClip(slot,files[i])));
  videoPool.tick(false);
  await addClipsToLibrary(prepared??files);
  const loaded=results.filter(result=>result.status==='success').length;
  if (loaded !== 10) throw new Error(`Saved preset loaded ${loaded}/10 decks. Check clip errors before playing.`);
}
