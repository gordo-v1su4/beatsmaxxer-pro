import { get } from 'svelte/store';
import { videoLayers } from '$lib/stores/rack';
import { timingSettings, timingStatus, timingLive, timingActive, timingSchedules, DEFAULT_TIMING_BUDGET_GIB, type TimingLive } from '$lib/stores/timing';
import { resolveTimingSignal, timingInput, timingSignalStatus, timingSignalGrid } from '$lib/stores/timingSignals';
import { analysisBeatGrid, analysisOnsets } from '$lib/stores/triggerLane';
import { midiChannels } from '$lib/stores/midiChannels';
import { audioEngine } from '$lib/audio';
import { buildTimingSchedule, sampleTimingSchedule, type TimingSignal, type TimingSchedule } from './triggers';
import type { ClipTiming } from './envelope';
import { defaultClipTiming } from './envelope';
import { ResidentFrameBank, ResidentMemoryBudget, ResidentCapacityError } from './ResidentFrameBank';
import { advanceClipTiming, timingOutputFrame } from './clock';
import { identifyInterpolation } from './interpolation';
import type { SpeedRampSourceState } from '$lib/runtime/speedramp';
import type { TimelineFrame } from '$lib/transport';
import type { TimingTexture } from './contracts';
import type { VideoLayer } from '$lib/engine/contracts';

/** Owns resident banks; AppLoop owns time and WebGpuEngine owns presentation. */
export class TimingRuntime {
  private banks = new Map<string, { source: VideoLayer; bank: ResidentFrameBank; clock: SpeedRampSourceState | null }>();
  private selected = new Map<string, TimingTexture>();
  private budget = new ResidentMemoryBudget(DEFAULT_TIMING_BUDGET_GIB * 2 ** 30);
  private device: GPUDevice | null = null;
  private active = false;
  private generation = 0;
  private queue: Promise<void> = Promise.resolve();
  private stopSources: (() => void) | null = null;
  private stopSettings: (() => void) | null = null;
  private lastOutput = -1;
  private lastSettings: unknown;
  private lastTransportGeneration = -1;
  private signalKey: unknown[] = [];
  private signal: TimingSignal | null = null;
  private plans = new Map<string,{config:ClipTiming;signal:TimingSignal;trigger:unknown;schedule:TimingSchedule}>();
  private defaults = new Map<string,ClipTiming>();
  private preloadHeight=0;

  readonly textureFor = (slot: string) => this.selected.get(slot) ?? null;

  setActive(active: boolean, device: GPUDevice | null) {
    if (device !== this.device) {
      this.dispose(); this.device = device;
    }
    if (active !== this.active) {
      // Returning from Perform joins the current song position; never replay a
      // potentially hour-long gap through the newly edited ramp on one frame.
      for (const entry of this.banks.values()) entry.clock = null;
      this.lastOutput = -1;
      this.active = active;
      timingActive.set(active);
    }
    if (!active || !device) return;
    if (!this.stopSources) this.stopSources = videoLayers.subscribe(() => this.reconcile());
    if (!this.stopSettings) this.stopSettings = timingSettings.subscribe(settings => {
      if (settings.budgetGiB*2**30 !== this.budget.limit || settings.preloadHeight!==this.preloadHeight) {
        this.clearBanks();
        this.preloadHeight=settings.preloadHeight;
        this.budget = new ResidentMemoryBudget(Math.floor(settings.budgetGiB*2**30));
        this.reconcile();
      }
    });
    this.reconcile();
  }

  private reconcile() {
    if (!this.device) return;
    const sources = get(videoLayers);
    for (const [slot, current] of this.banks) {
      if (sources[slot] !== current.source) {
        current.bank.dispose(); this.banks.delete(slot); this.selected.delete(slot);
        timingStatus.update(s => { const next = {...s}; delete next[slot]; return next; });
      }
    }
    if (!this.active) return;
    for (const [slot, source] of Object.entries(sources)) {
      if (!source || this.banks.has(slot)) continue;
      const entry = { source, bank: new ResidentFrameBank(this.device,this.budget), clock: null };
      this.banks.set(slot,entry);
      const generation = this.generation;
      const preloadHeight=this.preloadHeight;
      timingStatus.update(s => ({...s,[slot]:{state:'queued',frames:0,total:0,bytes:0}}));
      // Serial loading keeps GPU error scopes ordered and budget checks exact.
      this.queue = this.queue.catch(() => {}).then(async () => {
        if (generation !== this.generation || this.banks.get(slot) !== entry) return;
        try {
          await entry.bank.load(source.file ?? source.url, p => {
            if (generation === this.generation && this.banks.get(slot) === entry)
              timingStatus.update(s => ({...s,[slot]:{state:'loading',...p}}));
          },preloadHeight);
          if (generation !== this.generation || this.banks.get(slot) !== entry) { entry.bank.dispose(); return; }
          const stats = entry.bank.stats;
          const interpolationFactor = await identifyInterpolation(source.file ?? source.url, stats.fps);
          if (generation !== this.generation || this.banks.get(slot) !== entry) { entry.bank.dispose(); return; }
          timingStatus.update(s => ({...s,[slot]:{state:'ready',frames:stats.frames,total:stats.frames,bytes:stats.bytes,fps:stats.fps,interpolationFactor}}));
          this.lastOutput = -1;
        } catch (error) {
          if (generation === this.generation && this.banks.get(slot) === entry)
            timingStatus.update(s => ({...s,[slot]:{state:'error',frames:0,total:0,bytes:0,requiredBytes:error instanceof ResidentCapacityError ? error.requiredBytes : undefined,message:error instanceof Error ? error.message : String(error)}}));
        }
      });
    }
  }

  retry(slot: string) {
    this.banks.get(slot)?.bank.dispose(); this.banks.delete(slot); this.selected.delete(slot); this.reconcile();
  }

  tick(frame: TimelineFrame) {
    if (!this.active) return;
    const settings = get(timingSettings);
    frame = timingOutputFrame(frame, settings.outputFps);
    const output = Math.floor(frame.positionSeconds*settings.outputFps+1e-6);
    let updateOutput = output !== this.lastOutput || settings !== this.lastSettings || frame.generation !== this.lastTransportGeneration;
    const key=[settings.trigger,get(timingInput),get(analysisBeatGrid),get(analysisOnsets),get(midiChannels),audioEngine.getUploadedTrackLoadGeneration(),frame.bpm/Math.max(.01,frame.playbackRate),Math.ceil((frame.positionSeconds+1)/300)];
    if(!this.signal||key.some((v,i)=>v!==this.signalKey[i])){
      updateOutput=true;
      this.signalKey=key;
      this.signal=resolveTimingSignal(settings.trigger,frame.bpm/Math.max(.01,frame.playbackRate),Math.ceil((frame.positionSeconds+1)/300)*300);
      timingSignalStatus.set({label:this.signal.label,missing:this.signal.missing,channels:this.signal.channels.map(c=>c.name)});
      timingSignalGrid.set({beats:this.signal.beats,bpm:this.signal.bpm});
    }
    const live: Record<string,TimingLive> = {};
    for (const [slot, entry] of this.banks) {
      if (!entry.bank.stats.ready) continue;
      if(!this.defaults.has(slot))this.defaults.set(slot,defaultClipTiming(slot));
      const config = settings.clips[slot] ?? this.defaults.get(slot)!;
      const seed = [...slot].reduce((n,c)=>n+c.charCodeAt(0),0);
      const slotIndex=Number(slot.split('-')[1])+(slot.startsWith('bottom')?5:0);
      let plan=this.plans.get(slot);
      if(!plan||plan.config!==config||plan.signal!==this.signal||plan.trigger!==settings.trigger||plan.schedule.duration!==entry.bank.duration){
        plan={config,signal:this.signal,trigger:settings.trigger,schedule:buildTimingSchedule(config,settings.trigger,this.signal,slotIndex,entry.bank.duration)};
        this.plans.set(slot,plan);
        timingSchedules.update(s=>({...s,[slot]:plan!.schedule.bursts}));
        updateOutput=true;
      }
      const continuous=settings.trigger.source==='continuous';
      const oldClock=continuous?advanceClipTiming(entry.clock,frame,config,entry.bank.duration,seed):null;
      if(oldClock)entry.clock=oldClock.state;else entry.clock=null;
      const clock=oldClock??sampleTimingSchedule(plan.schedule,frame.positionSeconds);
      if (updateOutput || !this.selected.has(slot)) {
        const resident = entry.bank.frameAt(clock.sourceSeconds);
        if (resident) this.selected.set(slot,{view:resident.view,pts:resident.pts,requestedSeconds:clock.sourceSeconds,width:entry.bank.width,height:entry.bank.height,effect:config.effect});
      }
      const musical=continuous?{state:'continuous' as const}:sampleTimingSchedule(plan.schedule,frame.positionSeconds);
      live[slot] = { sourceTimelineSeconds:clock.sourceTimelineSeconds, phase:clock.phase,rate:clock.rate,sourceSeconds:clock.sourceSeconds,pts:this.selected.get(slot)?.pts??0,
        state:musical.state,triggerTime:'triggerTime' in musical?musical.triggerTime:null,burstEnd:'burstEnd' in musical?musical.burstEnd:null,time:frame.positionSeconds,beat:frame.beatPosition };
    }
    if (updateOutput) timingLive.set(live);
    this.lastOutput = output; this.lastSettings = settings; this.lastTransportGeneration = frame.generation;
  }

  get diagnostics() { return { active:this.active,usedBytes:this.budget.used,budgetBytes:this.budget.limit,
    signal:this.signal?{label:this.signal.label,missing:this.signal.missing,channels:this.signal.channels.map(c=>({name:c.name,events:c.events.length}))}:null,
    schedules:Object.fromEntries([...this.plans].map(([slot,p])=>[slot,{bursts:p.schedule.bursts.length,first:p.schedule.bursts.slice(0,4)}])),
    slots:Object.fromEntries([...this.banks].map(([slot,e])=>[slot,e.bank.stats])),
    selected:Object.fromEntries([...this.selected].map(([slot,s])=>[slot,{pts:s.pts,requestedSeconds:s.requestedSeconds,effect:s.effect}])) }; }

  private clearBanks() {
    this.generation++;
    for (const entry of this.banks.values()) entry.bank.dispose();
    this.banks.clear(); this.selected.clear(); timingStatus.set({}); timingLive.set({}); this.lastOutput=-1;
    this.plans.clear();
    timingSchedules.set({});
  }
  dispose() {
    this.active=false; this.stopSources?.(); this.stopSources=null; this.stopSettings?.(); this.stopSettings=null;
    this.clearBanks(); this.device=null; timingActive.set(false);
  }
}
export const timingRuntime = new TimingRuntime();
