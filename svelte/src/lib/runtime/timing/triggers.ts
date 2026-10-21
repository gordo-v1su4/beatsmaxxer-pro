import { RACK_SLOT_COUNT } from '$lib/modules/rackSlots';
import { BeatGrid } from '$lib/transport/BeatGrid';
import { evaluateRamp, integratedRamp, type ClipTiming, type StutterConfig } from './envelope';
import { timeSamplerParamsFromControls } from '$lib/timesampler/integration';
import { nextGrooveBeat } from '$lib/runtime/groove';
import { compileSamplerPhrase, compileSamplerHit, type SamplerPhrase } from './sampler';

export const TRIGGER_SOURCES = [
  ['pgm','PGM SOURCE'], ['beat','BEAT GRID'], ['midi','MIDI NOTES'], ['mix-onsets','MIX ONSETS'],
  ['vocals-onsets','VOCAL ONSETS'], ['stem-onsets','STEM ONSETS'],
  ['vocals-activity','VOCAL PHRASE STARTS'], ['mix-loudness','RMS PEAKS'], ['continuous','CONTINUOUS']
] as const;
export type TimingTriggerSource = typeof TRIGGER_SOURCES[number][0];
export interface TimingTriggerConfig {
  source: TimingTriggerSource; channel: string; everyBeats: number; rampChance: number;
  stutterChance: number; gapSeconds: number; threshold: number; seed: number;
  density?: number; repeatStyle?: 'fixed' | 'energy';
}
export const defaultTimingTrigger = (): TimingTriggerConfig => ({source:'beat',channel:'all',everyBeats:4,rampChance:40,stutterChance:100,density:100,repeatStyle:'energy',gapSeconds:.12,threshold:.45,seed:42});
export interface TimingEvent { time: number; strength: number }
export interface TimingChannel { name: string; events: TimingEvent[] }
export interface TimingSignal { channels: TimingChannel[]; beats: readonly number[]; bpm: number; duration: number; label: string; missing?: string }
export interface TimingBurst {
  at: number; end: number; blockedUntil: number; source: number; exitSource: number;
  repeats: number[]; triggerIndex: number; triggerAt?: number; phrase?: SamplerPhrase;
}
export interface TimingSchedule { bursts: TimingBurst[]; initialSource: number; config: ClipTiming; duration: number }

/** Burst-relative boundaries. Swing is a 2:1 pair; dotted stretches each note by 1.5. */
export function stutterBoundaries(config: StutterConfig): number[] {
  const step = Math.max(.0625,config.division);
  return Array.from({length:Math.max(1,config.repeats)+1},(_,i)=>config.groove==='dotted'?i*step*1.5:
    config.groove==='swing'?(Math.floor(i/2)*2+(i%2?4/3:0))*step:i*step);
}
export function beatTime(beats: readonly number[], bpm: number, beat: number): number {
  if(beats.length<2)return beat*60/bpm;
  const i=Math.max(0,Math.min(beats.length-2,Math.floor(beat)));
  return beats[i]+(beat-i)*(beats[i+1]-beats[i]);
}
const wrap=(x:number,d:number)=>((x%d)+d)%d;

export function densityFloor(strengths: number[], density = 1) {
  if (density >= 1 || !strengths.length) return -Infinity;
  const sorted = [...strengths].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((1 - Math.max(0, density)) * sorted.length))];
}
export function energyRank(sorted: number[], value: number) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (sorted[mid] < value) lo = mid + 1; else hi = mid; }
  return sorted.length ? lo / sorted.length : 0;
}
export function burstShape(rank: number, step: number): number[] {
  if (rank < .35) return [0];
  if (rank < .65) return [0, step];
  if (rank < .85) return [0, step * 2 / 3, step * 4 / 3];
  if (rank < .95) return [0, step, step * 2, step * 3];
  return [0, step, step * 1.5, step * 2, step * 2.25, step * 2.5];
}

/** Only eligible burst starts may take PGM; seed makes random cuts replayable. */
export function programTimeline(schedules: readonly TimingBurst[][], order:'balanced'|'random'='balanced', seed=42) {
  const bursts = schedules.flatMap((list, deck) => list.map(b => ({ at: b.at, end: b.end, deck })))
    .sort((a, b) => a.at - b.at || a.deck - b.deck);
  const shown = schedules.map(() => -Infinity), out: { at: number; deck: number }[] = [];
  let busyUntil = -Infinity;
  let randomState=seed>>>0;
  for (let i = 0; i < bursts.length;) {
    let j = i + 1;
    while (j < bursts.length && bursts[j].at - bursts[i].at < 1e-3) j++;
    const candidates=bursts.slice(i,j);
    i = j;
    if (candidates[0].at < busyUntil - 1e-9) continue;
    let b=candidates.reduce((best,c)=>shown[c.deck]<shown[best.deck]?c:best);
    if(order==='random'){
      const different=candidates.filter(c=>c.deck!==out.at(-1)?.deck);
      const eligible=different.length?different:candidates;
      randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;
      b=eligible[Math.floor(randomState/4294967296*eligible.length)];
    }
    out.push({ at: b.at, deck: b.deck }); shown[b.deck] = b.at; busyUntil = b.end;
  }
  return out;
}

/** Compile on edits/input changes, never on each frame. Finite bursts coalesce overlapping triggers. */
export function buildTimingSchedule(config: ClipTiming, trigger: TimingTriggerConfig, signal: TimingSignal, slot: number, duration: number): TimingSchedule {
  const initialSource=slot*duration/RACK_SLOT_COUNT;
  const schedule:TimingSchedule={bursts:[],initialSource,config,duration};
  if(config.effect==='off'||signal.missing)return schedule;
  const grid=new BeatGrid(signal.beats,signal.bpm);
  const timeAtBeat=(beat:number)=>beatTime(grid.beats,signal.bpm,beat);
  if(config.effect==='timesampler' && trigger.source==='continuous')return schedule;
  const channel=trigger.channel==='all'?signal.channels[slot%Math.max(1,signal.channels.length)]:signal.channels.find(c=>c.name===trigger.channel);
  const events=trigger.source==='beat'
    ? Array.from({length:Math.min(200000,Math.ceil(grid.sample(signal.duration).beatPosition/trigger.everyBeats)+1)},(_,i)=>({time:beatTime(signal.beats,signal.bpm,i*trigger.everyBeats),strength:1}))
    : channel?.events??[];
  let randomState=(trigger.seed+slot*997)>>>0;
  const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
  const density=Math.max(.1,Math.min(1,(trigger.density??100)/100));
  const sorted=events.map(e=>e.strength).sort((a,b)=>a-b);
  const floor=densityFloor(sorted,density);
  const chance=config.effect==='ramp'?trigger.rampChance/100:config.effect==='timesampler'?(config.sampler.controls.chance??60)/100:1;
  const rampArea=config.effect==='ramp'?integratedRamp(config.ramp,1):0;
  let last:TimingBurst|undefined;
  const restart=config.effect==='timesampler'&&config.sampler.behavior!=='continuous'&&config.sampler.retrigger==='restart';
  for(const [index,event] of events.entries()){
    if(event.time<0||event.time>signal.duration||event.strength<=0||event.strength<floor||event.strength<trigger.threshold)continue;
    if(last&&event.time<last.blockedUntil-1e-8&&(!restart||event.time>=last.end-1e-8))continue;
    // Match the R&D LCG sequence for ramps; 100% stutter consumes its first draw for the slice.
    if(chance<=0 || (chance<1 && random()>chance))continue;
    const at=event.time;
    const source=last?last.exitSource+at-last.end:initialSource+at;
    const startBeat=grid.sample(at).beatPosition;
    if(config.effect==='timesampler'){
      if(config.sampler.behavior!=='continuous'){
        const launch=Math.ceil((startBeat-1e-8)/config.sampler.launchBeats)*config.sampler.launchBeats;
        const landing=grid.transportSecondsAtBeat(launch);
        if(duration<=0)continue;
        // Several notes waiting for the same boundary cause one launch, not stacked restarts.
        if(last&&landing<=last.at+1e-8)continue;
        const phrase=config.sampler.behavior==='hit'
          ?compileSamplerHit(config.sampler,duration,landing,initialSource+landing,index,trigger.seed+slot*997)
          :compileSamplerPhrase(config.sampler,duration,grid,launch);
        if(restart&&last&&last.end>landing){
          last.end=landing;last.blockedUntil=landing;
          last.repeats=[...last.repeats.filter(t=>t<landing),landing];
        }
        last={at:phrase.at,triggerAt:at,end:phrase.end,blockedUntil:phrase.end+trigger.gapSeconds+(1-density)*2*60/signal.bpm,
          source:phrase.segments[0].source,exitSource:initialSource+phrase.end,repeats:[...phrase.segments.map(s=>s.at),phrase.end],triggerIndex:index,phrase};
        schedule.bursts.push(last);continue;
      }
      const params=timeSamplerParamsFromControls(config.sampler.controls,duration,config.sampler.groove==='swing'?1:config.sampler.groove==='dotted'?2:0);
      const boundary=nextGrooveBeat(startBeat+1e-7,params.jumpSizeBeats,params.feel??0);
      const landing=timeAtBeat(boundary),end=timeAtBeat(nextGrooveBeat(boundary+1e-7,params.jumpSizeBeats,params.feel??0));
      last={at:landing,triggerAt:at,end,blockedUntil:end+trigger.gapSeconds,
        source,exitSource:source+end-at,repeats:[landing,end],triggerIndex:index};
      schedule.bursts.push(last);continue;
    }
    const dynamic=trigger.repeatStyle==='energy';
    const offsets=dynamic?burstShape(energyRank(sorted,event.strength),config.stutter.division):stutterBoundaries(config.stutter);
    const repeats:number[]=[];
    if(config.effect==='stutter')for(const [i,offset] of offsets.entries()){
      const time=i===0?at:beatTime(signal.beats,signal.bpm,startBeat+offset);
      if(!dynamic||!repeats.length||time-repeats.at(-1)!>=1/30-1e-9)repeats.push(time);
    }
    // The accepted ZigSwap ramp uses song BPM for its finite period.
    const choices=config.ramp.cycleChoices?.filter(n=>Number.isFinite(n)&&n>=.125&&n<=32);
    const cycleBeats=config.effect==='ramp'&&config.ramp.cycleMode==='random'
      ? (choices?.length?choices:[1,2,4,8])[Math.floor(random()*(choices?.length||4))] : config.ramp.cycleBeats;
    const end=config.effect==='ramp'?at+cycleBeats*60/signal.bpm:dynamic
      ? repeats.at(-1)!+(repeats.length>1?repeats.at(-1)!-repeats.at(-2)!:.5*60/signal.bpm):repeats.at(-1)!;
    if(config.effect==='stutter'&&dynamic)repeats.push(end);
    const anchor=config.effect==='stutter'&&config.stutter.mode==='jump'?Math.floor(random()*config.stutter.slices)*duration/config.stutter.slices:source;
    const exitSource=config.effect==='ramp'?anchor+rampArea*(end-at):
      config.stutter.mode==='hold'?anchor:anchor+end-repeats[repeats.length-2];
    last={at,end,blockedUntil:end+trigger.gapSeconds+(1-density)*2*60/signal.bpm,source:anchor,exitSource,repeats,triggerIndex:index};
    schedule.bursts.push(last);
  }
  return schedule;
}

/** Binary-search source mapping also reconstructs exactly on seeks and section loops. */
export function sampleTimingSchedule(schedule: TimingSchedule, time: number) {
  const {bursts,config,duration}=schedule;
  let lo=0,hi=bursts.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(bursts[mid].at<=time)lo=mid+1;else hi=mid;}
  const burst=bursts[lo-1];
  let target=schedule.initialSource+time,rate=1,phase=0;
  let state:'waiting'|'burst'|'gap'='waiting';
  if(burst){
    target=burst.exitSource+time-burst.end;
    if(time<burst.end){
      state='burst';phase=(time-burst.at)/(burst.end-burst.at);
      if(config.effect==='ramp'){
        rate=evaluateRamp(config.ramp,phase);
        target=burst.source+integratedRamp(config.ramp,phase)*(burst.end-burst.at);
      }else if(config.effect==='stutter'){
        let r=0;while(r<burst.repeats.length-2&&burst.repeats[r+1]<=time+1e-9)r++;
        target=burst.source+(config.stutter.mode==='hold'?0:time-burst.repeats[r]);
        rate=config.stutter.mode==='hold'?0:1;
      }
    }else if(time<burst.blockedUntil)state='gap';
  }
  return {sourceTimelineSeconds:target,sourceSeconds:duration>0?wrap(target,duration):0,rate,phase,state,triggerTime:burst?.at??null,burstEnd:burst?.end??null};
}
