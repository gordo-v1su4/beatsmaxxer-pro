import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { defaultClipTiming } from '$lib/runtime/timing/envelope';
import { beginTimingGesture, endTimingGesture, canUndoTiming, canRedoTiming, clipTiming, parseTimingSettings,
  redoTiming, resetTimingHistory, selectedTimingSlot, setClipTiming, timingEditorTab, timingSettings, toggleTimingBypass, undoTiming } from '$lib/stores/timing';

beforeEach(() => { resetTimingHistory(); timingSettings.set(parseTimingSettings(null)); selectedTimingSlot.set('top-0'); });
describe('Timing editing history and identity', () => {
  it('alternates all ten defaults across the row boundary while preserving explicit clip choices', () => {
    const slots=Array.from({length:10},(_,i)=>`${i<5?'top':'bottom'}-${i%5}`);
    expect(slots.map(slot=>clipTiming(slot).effect)).toEqual(['ramp','stutter','ramp','stutter','ramp','stutter','ramp','stutter','ramp','stutter']);
    setClipTiming('top-1',{...clipTiming('top-1'),effect:'ramp'});
    timingSettings.set(parseTimingSettings(JSON.stringify(get(timingSettings))));
    expect(clipTiming('top-1').effect).toBe('ramp');expect(clipTiming('bottom-0').effect).toBe('stutter');
  });
  it('undoes a complete drag once without changing unrelated clips or memory capacity', () => {
    setClipTiming('top-1', { ...defaultClipTiming(), effect: 'stutter' }); resetTimingHistory();
    const before=clipTiming('top-0'); beginTimingGesture('top-0');
    for(const y of [.2,.3,.4])setClipTiming('top-0',{...before,ramp:{...before.ramp,points:before.ramp.points.map(p=>p.id==='peak'?{...p,y}:p)}});
    endTimingGesture(); timingSettings.update(s=>({...s,budgetGiB:12}));
    expect(get(canUndoTiming)).toBe(true); undoTiming();
    expect(clipTiming('top-0')).toEqual(before); expect(get(canUndoTiming)).toBe(false);
    expect(clipTiming('top-1').effect).toBe('stutter'); expect(get(timingSettings).budgetGiB).toBe(12);
    redoTiming(); expect(clipTiming('top-0').ramp.points[1].y).toBe(.4);
  });
  it('tracks selected clips, undo and persisted bypass by effect rather than original slot type', () => {
    setClipTiming('bottom-4',{...defaultClipTiming(),effect:'stutter'});
    selectedTimingSlot.set('bottom-4');expect(get(timingEditorTab)).toBe('stutter');
    toggleTimingBypass('bottom-4');expect(get(timingEditorTab)).toBe('stutter');
    const saved=parseTimingSettings(JSON.stringify(get(timingSettings)));timingSettings.set(saved);
    toggleTimingBypass('bottom-4');expect(clipTiming('bottom-4').effect).toBe('stutter');
    selectedTimingSlot.set('top-0');expect(get(timingEditorTab)).toBe('ramp');
    undoTiming();expect(get(selectedTimingSlot)).toBe('bottom-4');expect(clipTiming('bottom-4').effect).toBe('off');
  });
  it('does not create a history entry for an untouched drag and clears redo after another edit', () => {
    beginTimingGesture();endTimingGesture();expect(get(canUndoTiming)).toBe(false);
    setClipTiming('top-0',{...defaultClipTiming(),effect:'stutter'});undoTiming();expect(get(canRedoTiming)).toBe(true);
    setClipTiming('top-0',{...defaultClipTiming(),effect:'off'});expect(get(canRedoTiming)).toBe(false);
  });
});
