import { expect, test } from 'vitest';
import { evaluateAcceptance, scoreProgramCuts } from '../../../src/lib/qa/benchmark/acceptance';

test('a smooth preview cannot pass the scored-run acceptance gate', () => {
  expect(evaluateAcceptance({completed:true,elapsed:30,invalid:[],decks:[],programSummary:{cuts:0,onTimePercent:100}}).passed).toBe(false);
});

test('skipped program triggers remain in the denominator after a display stall', () => {
  const summary=scoreProgramCuts([0,.1,.2], [
    {beat:0,submitted:.01,ready:true},
    {beat:2,submitted:.21,ready:true}
  ], .3, 1/60);
  expect(summary).toEqual({cuts:3,missedCuts:1,lateCuts:0,onTimeCuts:2,onTimePercent:200/3});
});

test('completed timing still fails with a cache miss or sustained source error', () => {
  const report={completed:true,elapsed:120,invalid:[],decks:[{cuts:80,onTimePercent:100,presentationUpdates:2000,longestExcessSourceErrorSeconds:0,stats:{cacheMisses:0}}],programSummary:{cuts:100,onTimePercent:100}};
  expect(evaluateAcceptance(report).passed).toBe(true);
  expect(evaluateAcceptance({...report,decks:[{...report.decks[0],longestExcessSourceErrorSeconds:.11}]}).passed).toBe(false);
  expect(evaluateAcceptance({...report,decks:[{...report.decks[0],stats:{cacheMisses:1}}]}).passed).toBe(false);
  expect(evaluateAcceptance({...report,invalid:['hidden tab']}).passed).toBe(false);
});
