import {describe, expect, test} from 'vitest';
import {matchingPreset} from '$lib/modules/presetSelection';
import type {ModulePreset} from '$lib/modules/presets';
import {presetsForModule} from '$lib/modules/presets';
import {get} from 'svelte/store';
import {clearParams, moduleParams, resetRackParamHistory, updateParam, updateParams, undoRackParams, canUndo} from '$lib/stores/rack';
import {clipTiming, parseTimingSettings, resetTimingHistory, setClipTiming, timingSettings, undoTiming, canUndoTiming} from '$lib/stores/timing';

const presets: ModulePreset[] = [
  {n:'1', title:'Slow motion', set:{rate:25, mix:100}},
  {n:'2', title:'Double time', set:{rate:75, mix:100}},
];

describe('named preset state', () => {
  test('keeps its name after independent routing/density changes', () => {
    expect(matchingPreset({rate:25, mix:100, density:0, midiChannel:9}, presets)?.title).toBe('Slow motion');
  });

  test('becomes Custom when any owned parameter changes, including dry mix', () => {
    expect(matchingPreset({rate:50, mix:100}, presets)).toBeNull();
    expect(matchingPreset({rate:25, mix:0}, presets)).toBeNull();
  });

  test('derives preset state through the actual atomic rack preset and undo path', () => {
    clearParams();
    resetRackParamHistory();
    const before = structuredClone(get(moduleParams));
    const samplerPresets = presetsForModule('timesampler');
    updateParams('timesampler', samplerPresets[0].set);
    expect(matchingPreset(get(moduleParams).timesampler, samplerPresets)?.n).toBe('1');
    updateParam('timesampler', 'mix', 0);
    expect(matchingPreset(get(moduleParams).timesampler, samplerPresets)).toBeNull();
    undoRackParams();
    expect(matchingPreset(get(moduleParams).timesampler, samplerPresets)?.n).toBe('1');
    undoRackParams();
    expect(get(moduleParams)).toEqual(before);
    expect(get(canUndo)).toBe(false);
  });

  test('allows only floating-point noise and prefers an exact match', () => {
    const nearby: ModulePreset[] = [
      {n:'1', title:'First', set:{rate:25}},
      {n:'2', title:'Second', set:{rate:26}},
    ];
    expect(matchingPreset({rate:26}, nearby)?.n).toBe('2');
    expect(matchingPreset({rate:25 + 1e-8}, nearby)?.n).toBe('1');
    expect(matchingPreset({rate:24}, nearby)).toBeNull();
    expect(matchingPreset({rate:25 + 1e-4}, nearby)).toBeNull();
  });

  test.each([
    {module:'punch', index:1, key:'mix'},
    {module:'timesampler', index:0, key:'mode'},
    {module:'timesampler', index:0, key:'accent'},
    {module:'tapdelay', index:0, key:'feel'},
  ])('one-unit authored $module $key edit is Custom', ({module, index, key}) => {
    const choices = presetsForModule(module);
    const preset = choices[index];
    expect(matchingPreset({...preset.set, [key]:preset.set[key] + 1}, choices)).toBeNull();
  });

  test.each(['global', 'deck'] as const)('applies a complete Timing sampler preset as one undo in %s scope', scope => {
    timingSettings.set({...parseTimingSettings(null), scope});
    resetTimingHistory();
    const before = structuredClone(get(timingSettings));
    const config = clipTiming('top-1');
    const other = structuredClone(clipTiming('bottom-1'));
    const samplerPresets = presetsForModule('timesampler');
    setClipTiming('top-1', {...config, sampler:{...config.sampler, controls:{...config.sampler.controls, ...samplerPresets[1].set}}});
    expect(matchingPreset(clipTiming('top-1').sampler.controls, samplerPresets)?.n).toBe('2');
    if (scope === 'global') expect(matchingPreset(clipTiming('bottom-1').sampler.controls, samplerPresets)?.n).toBe('2');
    else expect(clipTiming('bottom-1')).toEqual(other);
    undoTiming();
    expect(clipTiming('top-1')).toEqual(config);
    expect(clipTiming('bottom-1')).toEqual(other);
    expect(get(timingSettings).budgetGiB).toBe(before.budgetGiB);
    expect(get(canUndoTiming)).toBe(false);
  });

  test('does not label missing, non-finite or empty values as a preset', () => {
    for (const params of [{rate:25}, {rate:NaN, mix:100}, {rate:Infinity, mix:100}]) {
      expect(matchingPreset(params, presets)).toBeNull();
    }
    expect(matchingPreset({}, [{n:'empty', title:'Empty', set:{}}])).toBeNull();
    expect(matchingPreset({rate:25, mix:100}, [])).toBeNull();
  });
});
