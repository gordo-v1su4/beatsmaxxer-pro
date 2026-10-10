import { afterEach, describe, expect, test } from 'vitest';
import { get } from 'svelte/store';
import { arrangement, cuts, resetArrangement } from '$lib/stores/arrangement';
import { serializeArrangement, parseArrangementFile } from '$lib/arrangement/persistence';
import { timingSettings } from '$lib/stores/timing';
afterEach(resetArrangement);
describe('portable arrangements',()=>{
  test('round trips exact landing times and settings without embedding media or blob URLs',()=>{
    resetArrangement();
    const scene={slots:{'top-0':{name:'clip.mp4',url:'blob:private'}}};
    arrangement.update(list=>list.map(s=>({...s,scene,deckSnapshot:{timing:get(timingSettings),bank:s.bank,scene}})));
    cuts.set([{step:4,slotIndex:3,timeSeconds:.5123}]);
    const raw=serializeArrangement('song.mp3',30);
    expect(raw).not.toContain('blob:');
    const restored=parseArrangementFile(raw);
    expect(restored.cuts).toEqual(get(cuts));
    expect(restored.sections[0].deckSnapshot?.timing.trigger.seed).toBe(get(timingSettings).trigger.seed);
    expect(restored.missing).toEqual(['clip.mp4']);
  });
  test('rejects malformed cuts and duplicate section IDs before mutating stores',()=>{
    resetArrangement();const raw=JSON.parse(serializeArrangement('song.mp3',30));
    raw.cuts=[{step:4,slotIndex:12}];expect(()=>parseArrangementFile(JSON.stringify(raw))).toThrow('Invalid recorded cut');
    raw.cuts=[];raw.sections.push(raw.sections[0]);expect(()=>parseArrangementFile(JSON.stringify(raw))).toThrow('Invalid arrangement section');
  });
});
