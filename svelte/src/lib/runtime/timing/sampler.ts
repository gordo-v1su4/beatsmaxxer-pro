import { LiveScheduleRuntime, timeSamplerParamsFromControls } from '$lib/timesampler/integration';
import { createTimeSamplerState, reduceTimeSampler } from '$lib/timesampler/reducer';
import type { TimeSamplerTransportSample } from '$lib/timesampler/types';
import { BeatGrid, type TimelineFrame, type TransportEvent, type TransportSample } from '$lib/transport';
import type { SamplerConfig } from './envelope';
import type { TimingSchedule, TimingSignal, TimingTriggerConfig } from './triggers';

export interface SamplerPhrase {
  at:number; end:number; controls:Record<string,number>;
  segments:{at:number;source:number;limit:number;floor?:number;slice:number;slices:number;rate:number}[];
}

/** A note owns one source region for its complete traversal, independent of the song playhead. */
export function compileSamplerHit(config:SamplerConfig,duration:number,at:number,normal:number,triggerIndex:number,seed:number):SamplerPhrase {
  const params=timeSamplerParamsFromControls(config.controls,duration);
  const count=params.sliceCount,length=duration/count;
  const anchor=Math.min(count-1,Math.floor(((normal%duration)+duration)%duration/length));
  let slice=anchor;
  if(params.mode==='RND')slice=((Math.imul(seed+triggerIndex,1664525)+1013904223)>>>0)%count;
  if(params.mode==='STEP3'||params.mode==='STEP5')slice=(anchor+(triggerIndex%2?Math.ceil(triggerIndex/2)*(params.mode==='STEP3'?3:5):0))%count;
  const floor=slice*length,limit=(slice+1)*length,leg=length/params.playbackRate;
  const phrase:SamplerPhrase={at,end:at,controls:{...config.controls},segments:[]};
  for(let loop=0;loop<params.loopCount;loop++){
    const directions=params.mode==='PONG'?[1,-1]:[params.mode==='REV'?-1:1];
    for(const direction of directions){
      phrase.segments.push({at:phrase.end,source:direction>0?floor:Math.max(floor,limit-1e-6),floor,limit,slice,slices:count,rate:direction*params.playbackRate});
      phrase.end+=leg;
    }
  }
  return phrase;
}

/** A finite comparison phrase runs the same reducer; it never interrupts itself. */
export function compileSamplerPhrase(config:SamplerConfig,duration:number,grid:BeatGrid,startBeat:number):SamplerPhrase {
  const params=timeSamplerParamsFromControls(config.controls,duration,config.groove==='swing'?1:config.groove==='dotted'?2:0);
  const sample=(beat:number):TimeSamplerTransportSample=>{
    const time=grid.transportSecondsAtBeat(beat);
    return {...grid.sample(time),transportSeconds:time,playing:true,discontinuityGeneration:0,
      audioOutputTimeSeconds:time,performanceTimeSeconds:time,presentationTimeSeconds:time,
      transportSecondsAtBeat:b=>grid.transportSecondsAtBeat(b)};
  };
  let result=createTimeSamplerState(sample(startBeat),params);
  const steps=(['PONG','STEP3','STEP5'].includes(params.mode)?Math.max(1,2*(params.sliceCount-1)):params.sliceCount)*params.loopCount;
  const phrase:SamplerPhrase={at:grid.transportSecondsAtBeat(startBeat),end:0,controls:{...config.controls},segments:[]};
  for(let step=0;step<steps;step++){
    const out=result.output;
    phrase.segments.push({at:result.nextState.sourceAnchorTransportSeconds,source:out.sourceTimestampSeconds,
      limit:(out.activeSlice+1)*duration/out.effectiveSliceCount,slice:out.activeSlice,slices:out.effectiveSliceCount,rate:out.targetPlaybackRate});
    phrase.end=grid.transportSecondsAtBeat(result.nextState.nextBoundaryBeat);
    if(step<steps-1)result=reduceTimeSampler(result.nextState,sample(result.nextState.nextBoundaryBeat),[],params);
  }
  return phrase;
}

export function sampleSamplerPhrase(phrase:SamplerPhrase,time:number) {
  let lo=0,hi=phrase.segments.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(phrase.segments[mid].at<=time+1e-9)lo=mid+1;else hi=mid;}
  const index=Math.max(0,lo-1),segment=phrase.segments[index];
  return {...segment,source:Math.max(segment.floor??0,Math.min(segment.limit,segment.source+Math.max(0,time-segment.at)*segment.rate)),
    jump:index,accentTime:index>0?segment.at:null};
}

/** Triggered regions use resident source frames; continuous sequencing retains the Perform runtime. */
export class TimingTimeSampler {
  private readonly runtime = new LiveScheduleRuntime();
  private previous: TransportSample | null = null;
  private gridSignal: TimingSignal | null = null;
  private grid = new BeatGrid([],120);
  private phrase:SamplerPhrase|null=null;
  private phraseGeneration=-1;
  private phraseSchedule:TimingSchedule|null=null;
  private phraseTime:number|null=null;
  private armedAt=-Infinity;
  private trace:{normal:number;source:number}[]=[];

  sample(frame: TimelineFrame, config: SamplerConfig, signal: TimingSignal,
    trigger: TimingTriggerConfig, schedule: TimingSchedule, duration: number) {
    if(this.gridSignal!==signal){this.gridSignal=signal;this.grid=new BeatGrid(signal.beats,signal.bpm);}
    const musical=this.grid.sample(frame.positionSeconds);
    const transport:TransportSample={...musical,transportSeconds:frame.positionSeconds,
      audioOutputTimeSeconds:frame.contextTimeSeconds,performanceTimeSeconds:frame.contextTimeSeconds,
      presentationTimeSeconds:frame.positionSeconds,playing:frame.playing,discontinuityGeneration:frame.generation,
      transportSecondsAtBeat:beat=>this.grid.transportSecondsAtBeat(beat)};
    const wrap=(time:number)=>duration>0?((time%duration)+duration)%duration:0;
    const normal=wrap(schedule.initialSource+frame.positionSeconds);
    if(config.behavior!=='continuous'){
      const discontinuity=this.phraseGeneration!==frame.generation;
      if(discontinuity)this.armedAt=-Infinity;
      else if(this.phraseSchedule!==schedule&&this.phraseTime!==null)this.armedAt=this.phraseTime;
      this.phraseSchedule=schedule;
      this.phraseTime=frame.positionSeconds;
      let lo=0,hi=schedule.bursts.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if((schedule.bursts[mid].triggerAt??schedule.bursts[mid].at)<=frame.positionSeconds)lo=mid+1;else hi=mid;}
      const queued=schedule.bursts[lo-1];
      lo=0;hi=schedule.bursts.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(schedule.bursts[mid].at<=frame.positionSeconds)lo=mid+1;else hi=mid;}
      const found=schedule.bursts[lo-1];
      const candidate=found&&(found.triggerAt??found.at)>=this.armedAt?found:undefined;
      this.phraseGeneration=frame.generation;
      if(discontinuity)this.phrase=null;
      const interrupted=config.retrigger==='restart'&&candidate&&candidate.at<=frame.positionSeconds&&candidate.at>(this.phrase?.at??Infinity);
      if(!this.phrase||interrupted||frame.positionSeconds>=this.phrase.end||frame.positionSeconds<this.phrase.at){
        this.phrase=candidate&&candidate.at<=frame.positionSeconds&&candidate.end>frame.positionSeconds?candidate.phrase??null:null;
      }
      const phrase=this.phrase;
      const out=phrase?sampleSamplerPhrase(phrase,frame.positionSeconds):null;
      return {sourceTimelineSeconds:out?.source??schedule.initialSource+frame.positionSeconds,
        sourceSeconds:out?Math.max(0,Math.min(duration-1e-6,out.source)):normal,phase:out?out.slice/out.slices:0,rate:out?.rate??1,
        state:out?'burst' as const:'waiting' as const,triggerTime:phrase?.at??null,burstEnd:phrase?.end??null,
        samplerAccentTime:out?.accentTime??null,samplerSlice:out?.slice??-1,samplerSlices:out?.slices??config.controls.slices,
        samplerJump:out?.jump??0,samplerControls:phrase?.controls??config.controls,samplerNormal:normal,
        samplerQueuedAt:queued&&(queued.triggerAt??queued.at)>=this.armedAt&&queued.at>frame.positionSeconds?queued.at:null,
        samplerTrace:phrase?phrase.segments.filter(s=>s.at<=frame.positionSeconds).slice(-16).map(s=>({normal:wrap(schedule.initialSource+s.at),source:s.source})):[]};
    }
    this.phrase=null;
    this.phraseGeneration=-1;
    this.phraseTime=null;
    this.runtime.configureTimeSampler({controls:config.controls,sourceDurationSeconds:duration,
      sourceKey:'timing-source',feel:config.groove==='swing'?1:config.groove==='dotted'?2:0});
    const events:TransportEvent[]=[];
    if(transport.playing && this.previous?.discontinuityGeneration===transport.discontinuityGeneration && transport.transportSeconds>=this.previous.transportSeconds){
      const from=this.previous.transportSeconds,to=transport.transportSeconds;
      let lo=0,hi=schedule.bursts.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if((schedule.bursts[mid].triggerAt??schedule.bursts[mid].at)<=from)lo=mid+1;else hi=mid;}
      for(let i=lo;i<schedule.bursts.length;i++){
        const burst=schedule.bursts[i],at=burst.triggerAt??burst.at;
        if(at>to)break;
        events.push({type:trigger.source==='midi'||trigger.source==='beat'||trigger.source==='pgm'?'midi-trigger':'onset-trigger',transportSeconds:at,sequence:i});
      }
    }
    const previousFrame=this.runtime.getFrame();
    if(this.previous?.discontinuityGeneration!==transport.discontinuityGeneration)this.trace=[];
    this.previous=transport;
    const result=this.runtime.advance(transport,events),out=result.timeSampler;
    if(!previousFrame||previousFrame.timeSampler.jumpGeneration!==out.jumpGeneration)this.trace=[...this.trace.slice(-15),{normal,source:out.sourceTimestampSeconds}];
    return {sourceTimelineSeconds:out.sourceTimestampSeconds,sourceSeconds:Math.max(0,Math.min(duration-1e-6,out.sourceTimestampSeconds)),
      phase:out.activeSlice/Math.max(1,out.effectiveSliceCount),rate:out.targetPlaybackRate,state:'continuous' as const,
      triggerTime:result.accent?.transportSeconds??null,burstEnd:null,samplerAccentTime:result.accent?.transportSeconds??null,
      samplerSlice:out.activeSlice,samplerSlices:out.effectiveSliceCount,samplerJump:out.jumpGeneration,
      samplerControls:config.controls,samplerNormal:normal,samplerTrace:this.trace};
  }
}
