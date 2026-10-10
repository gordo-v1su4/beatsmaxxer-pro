import { describe, expect, test } from 'vitest';
import { burstShape, densityFloor, buildTimingSchedule, defaultTimingTrigger, programTimeline } from '$lib/runtime/timing/triggers';
import { defaultClipTiming } from '$lib/runtime/timing/envelope';
import { midiEnvelopeEnergy } from '$lib/stores/timingSignals';
import { timingSettings, setTimingTrigger, setTimingScope, undoTiming, redoTiming, resetTimingHistory, parseTimingSettings, effectiveClipTiming } from '$lib/stores/timing';
import { get } from 'svelte/store';

describe('Timing musical density', () => {
  test('defaults to energy repeats and preserves an explicit fixed choice',()=>{
    expect(defaultTimingTrigger().repeatStyle).toBe('energy');
    expect(parseTimingSettings(null).trigger.repeatStyle).toBe('energy');
    expect(parseTimingSettings(JSON.stringify({version:1,trigger:{}})).trigger.repeatStyle).toBe('energy');
    expect(parseTimingSettings(JSON.stringify({version:1,trigger:{repeatStyle:'fixed'}})).trigger.repeatStyle).toBe('fixed');
  });
  test('defaults to shared global parameters without overwriting individual effect types',()=>{
    const settings=parseTimingSettings(null);
    expect(settings.scope).toBe('global');
    settings.master={...defaultClipTiming('top-0'),effect:'stutter'};
    settings.master.stutter.repeats=7;
    expect(effectiveClipTiming(settings,'top-0').stutter.repeats).toBe(7);
    expect(effectiveClipTiming(settings,'top-0').effect).toBe('ramp');
    expect(effectiveClipTiming(settings,'top-1').effect).toBe('stutter');
    expect(effectiveClipTiming(settings,'bottom-4').stutter.repeats).toBe(7);
    const modular={...settings,scope:'deck' as const};
    expect(effectiveClipTiming(modular,'top-0').effect).toBe('ramp');
    expect(effectiveClipTiming(modular,'top-1').stutter.repeats).toBe(4);
  });
  const signal = { label: 'notes', bpm: 120, beats: [], duration: 100,
    channels: [{ name: 'drums', events: Array.from({ length: 10 }, (_, i) => ({ time: i * 3, strength: (i + 1) / 10 })) }] };
  const config = defaultClipTiming('top-1');
  const trigger = { ...defaultTimingTrigger(), source: 'midi' as const, threshold: 0, gapSeconds: 0 };
  test('40% keeps exactly the loudest four triggers, identically on repeat', () => {
    expect(densityFloor(signal.channels[0].events.map(e => e.strength), .4)).toBe(.7);
    const plan = buildTimingSchedule(config, { ...trigger, density: 40 }, signal, 0, 10);
    expect(plan.bursts.map(b => b.at)).toEqual([18, 21, 24, 27]);
    expect(buildTimingSchedule(config, { ...trigger, density: 40 }, signal, 0, 10)).toEqual(plan);
  });
  test('energy shapes progress from a hit through ratchet', () => {
    expect([0,.4,.7,.9,.99].map(rank => burstShape(rank,.5).length)).toEqual([1,2,3,4,6]);
    expect(burstShape(.7,.5)).toEqual([0,1/3,2/3]);
  });
  test('fast ratchets measure spacing from the last retained repeat',()=>{
    const notes={label:'fast attacks',bpm:180,beats:[],duration:70,channels:[{name:'vocals',events:Array.from({length:20},(_,i)=>({time:i*3,strength:i===19?1:.1}))}]};
    const clip=defaultClipTiming('top-1');clip.stutter.division=.125;
    const plan=buildTimingSchedule(clip,{...defaultTimingTrigger(),source:'midi',threshold:0,gapSeconds:0},notes,0,10);
    const last=plan.bursts.at(-1)!;
    expect(last.repeats).toHaveLength(4);
    [0,1/24,1/12,1/8].forEach((offset,i)=>expect(last.repeats[i]-last.at).toBeCloseTo(offset,8));
  });
  test('MIDI energy reads the attack peak over 100ms and trigger edits undo', () => {
    expect(midiEnvelopeEnergy({ intervalSeconds: .05, values: [.1,.2,.8,.2] },0)).toBeCloseTo(.85);
    expect(midiEnvelopeEnergy(undefined,0)).toBe(1);
    setTimingScope('global');resetTimingHistory();
    const previous=get(timingSettings).trigger;
    setTimingTrigger({density:40,repeatStyle:'energy'});
    expect(get(timingSettings).trigger.density).toBe(40);
    undoTiming();expect(get(timingSettings).trigger).toEqual(previous);
    redoTiming();expect(get(timingSettings).trigger.repeatStyle).toBe('energy');
  });
  test('program waits for the current burst and rotates tied decks', () => {
    const p = buildTimingSchedule(config, trigger, signal, 0, 10);
    const overlapping = { ...p.bursts[0], at: .1, end: 2 };
    const timeline = programTimeline([p.bursts, p.bursts, [overlapping]]);
    expect(timeline.slice(0, 3)).toEqual([{ at: 0, deck: 0 }, { at: 3, deck: 1 }, { at: 6, deck: 0 }]);
    expect(timeline.some(c => c.at === .1)).toBe(false);
    const sparse = buildTimingSchedule(config, { ...trigger, density: 40 }, signal, 0, 10);
    expect(programTimeline([sparse.bursts]).length).toBeLessThan(programTimeline([p.bursts]).length);
  });
});
