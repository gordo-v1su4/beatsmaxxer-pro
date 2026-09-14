import { describe, expect, it } from 'vitest';
import { parseTimingSettings } from '$lib/stores/timing';
import { ResidentMemoryBudget } from '$lib/runtime/timing/ResidentFrameBank';
import { defaultClipTiming } from '$lib/runtime/timing/envelope';

// Actual frame counts of the ten QA 1280x720 RGBA resident banks.
const frames = [340,352,345,219,346,319,361,361,361,361];
describe('Timing capacity across new browser origins and old saved settings', () => {
  it('fits all ten QA clips with fresh-origin defaults', () => {
    const settings = parseTimingSettings(null);
    const budget = new ResidentMemoryBudget(settings.budgetGiB * 2**30);
    expect(() => frames.forEach(n => budget.claim(n * 1280 * 720 * 4))).not.toThrow();
  });
  it('migrates the legacy 8 GiB default without discarding clip edits', () => {
    const clip = defaultClipTiming('top-0'); clip.ramp.cycleBeats = 12;
    const settings = parseTimingSettings(JSON.stringify({version:1,budgetGiB:8,outputFps:30,clips:{'top-0':clip}}));
    expect(settings.budgetGiB).toBe(12);
    expect(settings.outputFps).toBe(30);
    expect(settings.clips['top-0'].ramp.cycleBeats).toBe(12);
  });
  it('preserves non-default legacy caps and explicit caps saved after migration', () => {
    for (const budgetGiB of [.25,4,12,20]) {
      expect(parseTimingSettings(JSON.stringify({version:1,budgetGiB})).budgetGiB).toBe(budgetGiB);
    }
    const settings = parseTimingSettings(null); settings.budgetGiB = 8;
    expect(parseTimingSettings(JSON.stringify(settings)).budgetGiB).toBe(8);
  });
});
