import {test,expect} from 'vitest';
import {FrameScore} from '../../../src/lib/qa/benchmark/scoring';
test('late superseded frames are rejected and missed cuts stay in the denominator',()=>{
  const score=new FrameScore([{id:0,at:0,source:0,pattern:'quarter',stress:false,surprise:false,beat:0},{id:1,at:.5,source:5,pattern:'quarter',stress:false,surprise:false,beat:1}],10,24);
  expect(score.observe(.02,0,0,1/24)).toBe(true);
  expect(score.observe(.52,0,.5,1/24)).toBe(false);
  expect(score.summary(1,1/60).missedCuts).toBe(1);
});
test('repeated stutter source frames count as successful cuts, not missed frames',()=>{
  const events=[0,.25,.5,.75].map((at,id)=>({id,at,source:2,pattern:'stutter4',stress:false,surprise:false,beat:id/2}));
  const score=new FrameScore(events,10,24);
  for(const event of events)score.observe(event.at+.01,event.id,2,1/24);
  expect(score.summary(1,1/60).onTimePercent).toBe(100);
  expect(score.summary(1,1/60).missedCuts).toBe(0);
});

test('source tolerance uses the measured display interval, not a fixed 60 Hz', () => {
  const event = {id:0, at:0, source:0, pattern:'quarter', stress:false, surprise:false, beat:0};
  const fastDisplay = new FrameScore([event], 10, 24);
  expect(fastDisplay.observe(.1, 0, .115, 1/24, 1/120)).toBe(false);
  const slowDisplay = new FrameScore([event], 10, 24);
  expect(slowDisplay.observe(.1, 0, .125, 1/24, 1/30)).toBe(true);
});
