import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { LiveScheduleRuntime } from '$lib/timesampler/integration';
import { BeatGrid, type TimelineFrame, type TransportSample } from '$lib/transport';
import { timeSamplerParamsFromControls } from '$lib/timesampler/integration';
import { defaultClipTiming } from '$lib/runtime/timing/envelope';
import { TimingTimeSampler, compileSamplerPhrase, sampleSamplerPhrase } from '$lib/runtime/timing/sampler';
import { buildTimingSchedule, defaultTimingTrigger } from '$lib/runtime/timing/triggers';
import { clipTiming, parseTimingSettings, redoTiming, resetTimingHistory, setClipTiming, setTimingScope, timingSettings, toggleTimingBypass, undoTiming } from '$lib/stores/timing';

describe('Timing uses the original Perform Timesampler', () => {
  const signal={label:'MIDI',bpm:120,beats:Array.from({length:100},(_,i)=>i*.5+i*i*.0002),duration:30,channels:[{name:'vocals',events:[{time:.1,strength:1},{time:1.1,strength:1},{time:3,strength:1}]}]};
  const grid=new BeatGrid(signal.beats,120);
  const frame=(time:number,generation=0):TimelineFrame=>({...grid.sample(time),positionSeconds:time,transportSeconds:time,frameId:Math.round(time*60),audioFrameId:0,contextTimeSeconds:time,playbackRate:1,playing:true,generation,reason:'initial',bpm:120,fixedStepSeconds:1/120,fixedStepIndex:Math.floor(time*120),fixedStepPhase:time*120%1,deterministicSeed:42,events:[]});
  const transport=(f:TimelineFrame):TransportSample=>({...grid.sample(f.positionSeconds),transportSeconds:f.positionSeconds,audioOutputTimeSeconds:f.contextTimeSeconds,performanceTimeSeconds:f.contextTimeSeconds,presentationTimeSeconds:f.positionSeconds,playing:f.playing,discontinuityGeneration:f.generation,transportSecondsAtBeat:b=>grid.transportSecondsAtBeat(b)});
  it('defaults to triggered samples and stays at normal speed when no trigger passes',()=>{
    const config=defaultClipTiming();config.effect='timesampler';
    expect(config.sampler.behavior).toBe('hit');
    config.sampler.controls.chance=0;
    const trigger={...defaultTimingTrigger(),source:'midi' as const,threshold:0};
    const schedule=buildTimingSchedule(config,trigger,signal,0,8),runtime=new TimingTimeSampler();
    for(const time of [0,.1,.5,1,3]){
      const out=runtime.sample(frame(time),config.sampler,signal,trigger,schedule,8);
      expect(out.sourceSeconds).toBeCloseTo(time,9);expect(out.rate).toBe(1);expect(out.state).toBe('waiting');
    }
  });
  it('plays one captured slice backward only after its trigger, then resumes the normal playhead',()=>{
    const config=defaultClipTiming();config.effect='timesampler';config.sampler.behavior='hit';
    config.sampler.controls={...config.sampler.controls,mode:1,slices:4,loops:1,rate:100,chance:100};
    const musical={...signal,beats:[],channels:[{name:'vocals',events:[{time:.1,strength:1}]}]};
    const trigger={...defaultTimingTrigger(),source:'midi' as const,threshold:0};
    const schedule=buildTimingSchedule(config,trigger,musical,0,8),runtime=new TimingTimeSampler();
    expect(schedule.bursts.map(b=>[b.at,b.end])).toEqual([[.5,1.5]]);
    const sample=(time:number)=>runtime.sample(frame(time),config.sampler,musical,trigger,schedule,8);
    expect(sample(.25).sourceSeconds).toBeCloseTo(.25,9);
    expect(sample(.5).sourceSeconds).toBeCloseTo(2,5);
    expect(sample(.75).sourceSeconds).toBeCloseTo(1.5,5);
    expect(sample(1).sourceSeconds).toBeCloseTo(1,5);
    expect(sample(1.5).sourceSeconds).toBeCloseTo(1.5,9);
  });
  it('plays a ping-pong slice forward and backward and makes slow speed last longer',()=>{
    const config=defaultClipTiming();config.effect='timesampler';config.sampler.behavior='hit';
    config.sampler.controls={...config.sampler.controls,mode:2,slices:4,loops:1,rate:100,chance:100};
    const musical={...signal,beats:[],channels:[{name:'vocals',events:[{time:.1,strength:1}]}]};
    const trigger={...defaultTimingTrigger(),source:'midi' as const,threshold:0};
    const schedule=buildTimingSchedule(config,trigger,musical,0,8),phrase=schedule.bursts[0].phrase!;
    expect(phrase.end).toBe(2.5);
    expect(sampleSamplerPhrase(phrase,1).source).toBeCloseTo(1,5);
    expect(sampleSamplerPhrase(phrase,1.75).source).toBeCloseTo(1.5,5);
    config.sampler.controls.rate=0;
    expect(buildTimingSchedule(config,trigger,musical,0,8).bursts[0].end).toBe(16.5);
  });
  it('does not invent a past activation when trigger chance is raised during normal playback',()=>{
    const config=defaultClipTiming();config.effect='timesampler';config.sampler.controls={...config.sampler.controls,chance:0};
    const musical={...signal,beats:[],channels:[{name:'vocals',events:[.1,3.1].map(time=>({time,strength:1}))}]};
    const trigger={...defaultTimingTrigger(),source:'midi' as const,threshold:0};
    const before=buildTimingSchedule(config,trigger,musical,0,8),runtime=new TimingTimeSampler();
    runtime.sample(frame(1),config.sampler,musical,trigger,before,8);
    config.sampler.controls.chance=100;
    const after=buildTimingSchedule(config,trigger,musical,0,8);
    expect(runtime.sample(frame(1.1),config.sampler,musical,trigger,after,8).state).toBe('waiting');
    expect(runtime.sample(frame(3.2),config.sampler,musical,trigger,after,8).samplerQueuedAt).toBe(3.5);
    expect(runtime.sample(frame(3.5),config.sampler,musical,trigger,after,8).state).toBe('burst');
  });
  it('ignores retriggers until the entire ping-pong motion and every loop have finished',()=>{
    const config=defaultClipTiming();config.effect='timesampler';
    config.sampler.controls={...config.sampler.controls,mode:2,slices:8,loops:2,rate:100,chance:100};
    const musical={...signal,beats:[],channels:[{name:'vocals',events:[.1,.2,.7,1,2.4,2.55,3.1].map(time=>({time,strength:1}))}]};
    const trigger={...defaultTimingTrigger(),source:'midi' as const,threshold:0,gapSeconds:.2};
    const schedule=buildTimingSchedule(config,trigger,musical,0,8),runtime=new TimingTimeSampler();
    expect(schedule.bursts.map(b=>[b.triggerAt,b.at,b.end])).toEqual([[.1,.5,2.5],[3.1,3.5,5.5]]);
    for(const time of [.5,.75,1,1.25,1.5,1.75,2,2.25,2.49]){
      const actual=runtime.sample(frame(time),config.sampler,musical,trigger,schedule,8);
      expect(actual.triggerTime).toBe(.5);expect(actual.burstEnd).toBe(2.5);
      expect(actual.sourceSeconds).toBeCloseTo(sampleSamplerPhrase(schedule.bursts[0].phrase!,time).source,9);
    }
    expect(runtime.sample(frame(2.5),config.sampler,musical,trigger,schedule,8).state).toBe('waiting');
    expect(runtime.sample(frame(3.2),config.sampler,musical,trigger,schedule,8).samplerQueuedAt).toBe(3.5);
  });
  it('can toggle from finishing the loop to interrupting it on the next accepted MIDI trigger',()=>{
    const config=defaultClipTiming();config.effect='timesampler';
    config.sampler.controls={...config.sampler.controls,mode:1,slices:4,loops:2,rate:100,chance:100};
    const musical={...signal,beats:[],channels:[{name:'vocals',events:[.1,.7,.8].map(time=>({time,strength:1}))}]};
    const trigger={...defaultTimingTrigger(),source:'midi' as const,threshold:0,gapSeconds:.2};
    expect(config.sampler.retrigger).toBe('finish');
    expect(buildTimingSchedule(config,trigger,musical,0,8).bursts.map(b=>b.at)).toEqual([.5]);
    config.sampler.retrigger='restart';
    const schedule=buildTimingSchedule(config,trigger,musical,0,8),runtime=new TimingTimeSampler();
    expect(schedule.bursts.map(b=>[b.at,b.end])).toEqual([[.5,1],[1,3]]);
    expect(runtime.sample(frame(.5),config.sampler,musical,trigger,schedule,8).triggerTime).toBe(.5);
    expect(runtime.sample(frame(.9),config.sampler,musical,trigger,schedule,8).triggerTime).toBe(.5);
    expect(runtime.sample(frame(1),config.sampler,musical,trigger,schedule,8).triggerTime).toBe(1);
    expect(runtime.sample(frame(1.01),config.sampler,musical,trigger,schedule,8).sourceSeconds).toBeCloseTo(1.98,5);
    for(const time of [1.25,.75,1.25]){
      const seek=new TimingTimeSampler().sample(frame(time,7),config.sampler,musical,trigger,schedule,8);
      expect(seek.triggerTime).toBe(time<1?.5:1);
    }
    const toggled=new TimingTimeSampler();
    toggled.sample(frame(.5),config.sampler,musical,trigger,schedule,8);
    config.sampler.retrigger='finish';
    const finish=buildTimingSchedule(config,trigger,musical,0,8);
    toggled.sample(frame(.75),config.sampler,musical,trigger,finish,8);
    expect(toggled.sample(frame(1.25),config.sampler,musical,trigger,finish,8).triggerTime).toBe(.5);
  });
  for (const mode of [0,1,2,3,4,5]) for (const groove of ['straight','swing','dotted'] as const) {
    it(`matches the standalone runtime for mode ${mode}, ${groove}, loops, rates and delayed frames`,()=>{
      const config=defaultClipTiming();config.effect='timesampler';config.sampler.behavior='continuous';config.sampler.groove=groove;
      config.sampler.controls={...config.sampler.controls,mode,slices:4,loops:2,rate:62};
      const trigger={...defaultTimingTrigger(),source:'continuous' as const};
      const schedule=buildTimingSchedule(config,trigger,signal,0,12),actual=new TimingTimeSampler(),reference=new LiveScheduleRuntime();
      reference.configureTimeSampler({controls:config.sampler.controls,sourceDurationSeconds:12,sourceKey:'timing-source',feel:groove==='swing'?1:groove==='dotted'?2:0});
      for(const time of [0,.1,.5,.53,1,2,3,4,7,9]){
        const f=frame(time),out=reference.advance(transport(f),[]),sample=actual.sample(f,config.sampler,signal,trigger,schedule,12);
        expect(sample.sourceTimelineSeconds).toBeCloseTo(out.timeSampler.sourceTimestampSeconds,9);
        expect(sample.samplerSlice).toBe(out.timeSampler.activeSlice);
        expect(sample.samplerJump).toBe(out.timeSampler.jumpGeneration);
        expect(sample.samplerAccentTime).toBe(out.accent?.transportSeconds??null);
      }
    });
  }
  it('queues live mode, division and loop edits exactly as Perform, while rate changes immediately',()=>{
    const config=defaultClipTiming();config.effect='timesampler';
    config.sampler.behavior='continuous';
    const trigger={...defaultTimingTrigger(),source:'continuous' as const},schedule=buildTimingSchedule(config,trigger,signal,0,12);
    const actual=new TimingTimeSampler(),reference=new LiveScheduleRuntime();
    for(const [time,generation] of [[0,0],[.13,0],[.49,0],[.51,0],[1.1,0],[2.4,0],[8,1],[1,2]]){
      if(time===.13)config.sampler.controls={...config.sampler.controls,mode:1,size:90,loops:4,rate:100,accent:1};
      reference.configureTimeSampler({controls:config.sampler.controls,sourceDurationSeconds:12,sourceKey:'timing-source',feel:0});
      const f=frame(time,generation),expected=reference.advance(transport(f),[]),out=actual.sample(f,config.sampler,signal,trigger,schedule,12);
      expect(out.sourceTimelineSeconds).toBeCloseTo(expected.timeSampler.sourceTimestampSeconds,9);
      expect(out.samplerSlice).toBe(expected.timeSampler.activeSlice);
      expect(out.rate).toBe(expected.timeSampler.targetPlaybackRate);
      if(time===.13){expect(out.samplerSlice).toBe(0);expect(out.rate).toBe(2);}
    }
  });
  it('uses the actual module defaults and unchanged control mapping',()=>{
    const config=defaultClipTiming().sampler;
    expect(config.controls).toMatchObject({mode:0,size:50,slices:8,loops:1,rate:43,accent:0,chance:60,mix:60});
    expect(timeSamplerParamsFromControls(config.controls,12)).toMatchObject({jumpSizeBeats:1,playbackRate:1.0025,loopCount:1,accentMode:'LUM'});
  });
  it('routes selected MIDI notes to the unchanged event scheduler at their original timestamp',()=>{
    const config=defaultClipTiming();config.effect='timesampler';
    config.sampler.behavior='continuous';
    const trigger={...defaultTimingTrigger(),source:'midi' as const,channel:'vocals',threshold:0,gapSeconds:0};
    const schedule=buildTimingSchedule(config,trigger,signal,0,12),actual=new TimingTimeSampler(),reference=new LiveScheduleRuntime();
    expect(schedule.bursts[0].triggerAt).toBe(.1);
    reference.configureTimeSampler({controls:config.sampler.controls,sourceDurationSeconds:12,sourceKey:'timing-source',feel:0});
    let previous=0;
    for(const time of [0,.11,.52,1.11,1.6,3.1,3.6]){
      const events=schedule.bursts.filter(b=>(b.triggerAt??b.at)>previous&&(b.triggerAt??b.at)<=time).map((b,i)=>({type:'midi-trigger' as const,sequence:i,transportSeconds:b.triggerAt??b.at}));
      const expected=reference.advance(transport(frame(time)),events),out=actual.sample(frame(time),config.sampler,signal,trigger,schedule,12);
      expect(out.sourceTimelineSeconds).toBeCloseTo(expected.timeSampler.sourceTimestampSeconds,9);
      expect(out.samplerSlice).toBe(expected.timeSampler.activeSlice);previous=time;
    }
  });
  it('keeps sequencing without trigger data, and clamps the last frame of an exhausted slice',()=>{
    const config=defaultClipTiming();config.effect='timesampler';config.sampler.behavior='continuous';config.sampler.controls={...config.sampler.controls,mode:1,size:90,rate:100};
    const trigger={...defaultTimingTrigger(),source:'continuous' as const},schedule=buildTimingSchedule(config,trigger,signal,0,8),actual=new TimingTimeSampler();
    actual.sample(frame(0),config.sampler,signal,trigger,schedule,8);
    const held=actual.sample(frame(1),config.sampler,signal,trigger,schedule,8);
    expect(held.sourceTimelineSeconds).toBe(8);expect(held.sourceSeconds).toBeGreaterThan(7.99);
    expect(actual.sample(frame(4),config.sampler,signal,trigger,schedule,8).samplerJump).toBeGreaterThan(0);
  });
  it('applies Timing sensitivity to the frequency of eligible MIDI and audio triggers',()=>{
    const config=defaultClipTiming();config.effect='timesampler';config.sampler.controls.chance=0;
    expect(buildTimingSchedule(config,{...defaultTimingTrigger(),source:'mix-onsets'},signal,0,12).bursts).toHaveLength(0);
    expect(buildTimingSchedule(config,{...defaultTimingTrigger(),source:'midi'},signal,0,12).bursts).toHaveLength(0);
    config.sampler.controls.chance=100;
    expect(buildTimingSchedule(config,{...defaultTimingTrigger(),source:'mix-onsets'},signal,0,12).bursts.length).toBeGreaterThan(0);
    expect(buildTimingSchedule(config,{...defaultTimingTrigger(),source:'midi'},signal,0,12).bursts.length).toBeGreaterThan(0);
  });
  it('quantizes a whole phrase to beats or bars, ignores busy notes, then returns to normal playback',()=>{
    const config=defaultClipTiming();config.effect='timesampler';config.sampler.behavior='phrase';
    config.sampler.controls={...config.sampler.controls,slices:4,rate:43,chance:100};
    const musical={...signal,beats:[],channels:[{name:'vocals',events:[.1,.2,.3,1,3.1].map(time=>({time,strength:1}))}]};
    const trigger={...defaultTimingTrigger(),source:'midi' as const,threshold:0,gapSeconds:.5};
    const schedule=buildTimingSchedule(config,trigger,musical,0,12);
    expect(schedule.bursts.map(b=>b.at)).toEqual([.5,3.5]);
    expect(schedule.bursts.map(b=>b.end)).toEqual([2.5,5.5]);
    const runtime=new TimingTimeSampler();
    expect(runtime.sample(frame(.2),config.sampler,musical,trigger,schedule,12).sourceSeconds).toBeCloseTo(.2);
    expect(runtime.sample(frame(.5),config.sampler,musical,trigger,schedule,12).sourceSeconds).toBe(0);
    expect(runtime.sample(frame(1),config.sampler,musical,trigger,schedule,12).sourceSeconds).toBe(3);
    const normal=runtime.sample(frame(2.7),config.sampler,musical,trigger,schedule,12);
    expect(normal.state).toBe('waiting');expect(normal.sourceSeconds).toBeCloseTo(2.7,9);
    config.sampler.launchBeats=4;
    expect(buildTimingSchedule(config,trigger,musical,0,12).bursts[0].at).toBe(2);
  });
  it('keeps the active phrase locked when controls change and reconstructs it on export seeks',()=>{
    const config=defaultClipTiming();config.effect='timesampler';config.sampler.behavior='phrase';config.sampler.controls={...config.sampler.controls,slices:4,chance:100};
    const musical={...signal,beats:[]},trigger={...defaultTimingTrigger(),source:'midi' as const,threshold:0};
    const before=buildTimingSchedule(config,trigger,musical,0,12),actual=new TimingTimeSampler();
    actual.sample(frame(.5),config.sampler,musical,trigger,before,12);
    config.sampler.controls={...config.sampler.controls,mode:1};
    const after=buildTimingSchedule(config,trigger,musical,0,12);
    expect(actual.sample(frame(1),config.sampler,musical,trigger,after,12).sourceSeconds).toBe(3);
    const fresh=new TimingTimeSampler();
    for(const at of [1.2,.7,1.2]){
      const expected=sampleSamplerPhrase(after.bursts[0].phrase!,at);
      expect(fresh.sample(frame(at,Math.round(at*10)),config.sampler,musical,trigger,after,12).sourceSeconds).toBeCloseTo(expected.source,9);
    }
  });
  it('compiles the phrase using the original reducer for all grooves and exposes actual boundary shifts',()=>{
    const config=defaultClipTiming().sampler;config.controls={...config.controls,slices:4,size:30};
    const straight=compileSamplerPhrase(config,12,new BeatGrid([],120),0);
    config.groove='swing';const swing=compileSamplerPhrase(config,12,new BeatGrid([],120),0);
    expect(straight.segments.map(s=>s.at)).toEqual([0,.25,.5,.75]);
    [0,1/3,.5,5/6].forEach((at,i)=>expect(swing.segments[i].at).toBeCloseTo(at,9));
    expect(sampleSamplerPhrase(swing,.3).slice).toBe(0);
    expect(sampleSamplerPhrase(swing,.34).slice).toBe(1);
  });
  it('round-trips settings, bypass and undo across global and per-video scopes',()=>{
    timingSettings.set(parseTimingSettings(null));resetTimingHistory();
    const config={...clipTiming('top-1'),effect:'timesampler' as const};
    config.sampler={...config.sampler,controls:{...config.sampler.controls,mode:3,loops:4,rate:81,accent:1}};
    setClipTiming('top-1',config);
    expect(clipTiming('bottom-4').sampler.controls).toEqual(config.sampler.controls);
    toggleTimingBypass('top-1');
    timingSettings.set(parseTimingSettings(JSON.stringify(get(timingSettings))));
    toggleTimingBypass('top-1');expect(clipTiming('top-1').effect).toBe('timesampler');
    setTimingScope('deck');setClipTiming('top-1',config);resetTimingHistory();
    setClipTiming('top-1',{...clipTiming('top-1'),sampler:{...config.sampler,controls:{...config.sampler.controls,mode:2}}});
    undoTiming();expect(clipTiming('top-1').sampler.controls.mode).toBe(3);
    redoTiming();expect(clipTiming('top-1').sampler.controls.mode).toBe(2);
    const restored=parseTimingSettings(JSON.stringify(get(timingSettings)));
    expect(restored.clips['top-1'].sampler).toEqual(clipTiming('top-1').sampler);
  });
  it('migrates old settings and rejects invalid sampler values without losing the workspace',()=>{
    const restored=parseTimingSettings(JSON.stringify({version:1,clips:{'top-1':{effect:'stutter'},'bottom-1':{effect:'timesampler',sampler:{controls:{rate:Infinity,loops:-4,slices:500,mode:900}}}}}));
    expect(restored.clips['top-1'].effect).toBe('stutter');
    expect(restored.clips['top-1'].sampler.controls.slices).toBe(8);
    expect(restored.clips['bottom-1'].sampler.controls).toMatchObject({rate:43,loops:1,slices:64,mode:5});
  });
});
