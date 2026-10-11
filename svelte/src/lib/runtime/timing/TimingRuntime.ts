import { get } from 'svelte/store';
import { videoLayers, currentRackModuleForSlot, currentRackSlotForModule } from '$lib/stores/rack';
import { pgmSource, queuedPgmSource, manualCutRequests, PGM_LAUNCH_QUANTIZE_BEATS, commitPgmCut } from '$lib/stores/pgm';
import { arrangementMode } from '$lib/arrangement/transportMode';
import { timingSettings, timingStatus, timingLive, timingActive, timingSchedules, timingSceneStatus, timingCacheCapacity, timingSceneErrors, DEFAULT_TIMING_BUDGET_GIB, type TimingLive } from '$lib/stores/timing';
import { arrangement, cuts, type Cut, type SceneClip } from '$lib/stores/arrangement';
import { resolveTimingSignal, timingInput, timingSignalStatus, timingSignalGrid } from '$lib/stores/timingSignals';
import { analysisBeatGrid, analysisOnsets } from '$lib/stores/triggerLane';
import { midiChannels } from '$lib/stores/midiChannels';
import { audioEngine } from '$lib/audio';
import { buildTimingSchedule, sampleTimingSchedule, programTimeline, type TimingSignal, type TimingSchedule, type TimingTriggerConfig } from './triggers';
import type { ClipTiming } from './envelope';
import { defaultClipTiming } from './envelope';
import { ResidentFrameBank, ResidentMemoryBudget, ResidentCapacityError } from './ResidentFrameBank';
import { advanceClipTiming, timingOutputFrame } from './clock';
import { identifyInterpolation, meetsSlowMotionFrameRate } from './interpolation';
import { allowTimingClip, RIFE_RAMP_ONLY } from '$lib/stores/timing';
import { effectiveClipTiming, effectiveTimingTrigger, timingPgmFollowsTriggers } from '$lib/stores/timing';
import { normalizeTimingRamp } from './rampPresets';
import type { SpeedRampSourceState } from '$lib/runtime/speedramp';
import type { TimelineFrame } from '$lib/transport';
import type { TimingTexture } from './contracts';
import type { VideoLayer } from '$lib/engine/contracts';
import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
import { slotPreparation, prepareSlowMotionFile, originalSlowMotionFile, resumeInterpolationJob } from './preparation';

/** Owns resident banks; AppLoop owns time and WebGpuEngine owns presentation. */
export class TimingRuntime {
  private assets=new Map<File|string,{bank:ResidentFrameBank;factor:number|null;source:VideoLayer|SceneClip;requiredBytes:number;loading:boolean;error:string|null}>();
  private sceneVariants=new Map<File,{source:SceneClip|null;loading:boolean;error:string|null;jobId?:string}>();
  private stopSections:(()=>void)|null=null;
  private banks = new Map<string, { source: VideoLayer; bank: ResidentFrameBank; clock: SpeedRampSourceState | null; factor: number | null }>();
  private normalized = new WeakMap<ClipTiming, ClipTiming>();
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
  private triggerSignals = new Map<TimingTriggerConfig,TimingSignal>();
  private plans = new Map<string,{config:ClipTiming;signal:TimingSignal;trigger:unknown;schedule:TimingSchedule}>();
  private defaults = new Map<string,ClipTiming>();
  private preloadHeight=0;
  private program: { at: number; deck: number }[] = [];
  private programDirty = true;
  private programSelection = '';
  private pgmSignals = new Map<string,TimingSignal>();
  private pgmGeneration = -1;
  private pgmLastSlot: string | null = null;
  private pgmReplayCuts: readonly Cut[] | null = null;
  private pgmReplay = false;
  private manualGeneration = -1;
  private manualSerial: number | null = null;
  private manualPending = false;
  private manualQueued: string | null = null;
  private manualPgm: string | null = null;
  private manualHoldUntil = -Infinity;

  readonly textureFor = (slot: string) => this.selected.get(slot) ?? null;
  private readonly sourceResidentFactor=(source:File|string)=>{
    const asset=this.assets.get(source);
    return this.active&&asset?.bank.stats.ready?asset.factor:null;
  };

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
    mediaRuntime.setResidentSourceFactor(active&&device?this.sourceResidentFactor:null);
    if (!active || !device) return;
    if (!this.stopSources) this.stopSources = videoLayers.subscribe(() => this.reconcile());
    if (!this.stopSections) this.stopSections = arrangement.subscribe(()=>this.prewarmScenes());
    if (!this.stopSettings) this.stopSettings = timingSettings.subscribe(settings => {
      if (settings.budgetGiB*2**30 !== this.budget.limit || settings.preloadHeight!==this.preloadHeight) {
        this.clearBanks();
        this.preloadHeight=settings.preloadHeight;
        this.budget = new ResidentMemoryBudget(Math.floor(settings.budgetGiB*2**30));
      }
      this.reconcile();
    });
    this.reconcile();
  }

  private reconcile() {
    if (!this.device) return;
    const sources = get(videoLayers);
    for (const [slot, current] of this.banks) {
      if (sources[slot] !== current.source) {
        this.banks.delete(slot); this.selected.delete(slot);
        this.plans.delete(slot);this.programDirty=true;
        timingStatus.update(s => { const next = {...s}; delete next[slot]; return next; });
      }
    }
    if (!this.active) return;
    for (const [slot, source] of Object.entries(sources)) {
      if (!source) continue;
      const current=this.banks.get(slot);
      if(source.file&&effectiveClipTiming(get(timingSettings),slot).effect==='ramp'&&current?.bank.stats.fps&&!meetsSlowMotionFrameRate(current.bank.stats.fps)){
        if(!get(slotPreparation)[slot])void mediaRuntime.registerModuleFileClip(slot,source.file);
        continue;
      }
      if(current)continue;
      const asset=this.assetFor(source);
      const entry = { source, bank: asset.bank, clock: null, factor: asset.factor };
      this.banks.set(slot,entry);
      const stats=asset.bank.stats;
      timingStatus.update(s=>({...s,[slot]:asset.factor!==null?{state:'ready',frames:stats.frames,total:stats.frames,bytes:stats.bytes,fps:stats.fps,interpolationFactor:asset.factor}:{state:'queued',frames:0,total:0,bytes:0}}));
    }
    this.prewarmScenes();
  }

  /** Cache by the actual file identity: section swaps reuse decoded GPU frames. */
  private assetFor(source:VideoLayer|SceneClip){
    const key=source.file??source.url;
    const existing=this.assets.get(key);if(existing)return existing;
    const asset={source,bank:new ResidentFrameBank(this.device!,this.budget),factor:null as number|null,requiredBytes:0,loading:true,error:null as string|null};
    this.assets.set(key,asset);
    this.publishCapacity();
    const generation=this.generation,height=this.preloadHeight;
    timingSceneStatus.update(s=>({...s,[source.name]:{state:'loading'}}));
    this.queue=this.queue.catch(()=>{}).then(async()=>{
      if(generation!==this.generation||this.assets.get(key)!==asset)return;
      try{
        await asset.bank.load(key,p=>{
          if(generation!==this.generation)return;
          for(const [slot,entry] of this.banks)if(entry.bank===asset.bank)timingStatus.update(s=>({...s,[slot]:{state:'loading',...p}}));
          this.publishCapacity();
        },height);
        if(generation!==this.generation||this.assets.get(key)!==asset)return;
        const stats=asset.bank.stats;
        asset.factor=await identifyInterpolation(key,stats.fps);
        if(generation!==this.generation)return;
        for(const [slot,entry] of this.banks)if(entry.bank===asset.bank){entry.factor=asset.factor;timingStatus.update(s=>({...s,[slot]:{state:'ready',frames:stats.frames,total:stats.frames,bytes:stats.bytes,fps:stats.fps,interpolationFactor:asset.factor!}}));}
        timingSceneStatus.update(s=>({...s,[source.name]:{state:'ready'}}));this.lastOutput=-1;
      if(!meetsSlowMotionFrameRate(stats.fps)&&source.file)queueMicrotask(()=>{if(generation===this.generation)this.reconcile();});
      }catch(error){
        if(generation!==this.generation)return;
        const message=error instanceof Error?error.message:String(error);
        asset.error=message;
        asset.requiredBytes=error instanceof ResidentCapacityError?error.requiredBytes:0;
        timingSceneStatus.update(s=>({...s,[source.name]:{state:'error',message}}));
        for(const [slot,entry] of this.banks)if(entry.bank===asset.bank)timingStatus.update(s=>({...s,[slot]:{state:'error',frames:0,total:0,bytes:0,requiredBytes:error instanceof ResidentCapacityError?error.requiredBytes:undefined,message}}));
      }finally{
        if(generation===this.generation && this.assets.get(key)===asset){asset.loading=false;this.publishCapacity();}
      }
    });
    return asset;
  }
  private prewarmScenes(){
    if(!this.active||!this.device)return;
    const wanted=new Set<File|string>(Object.values(get(videoLayers)).flatMap(s=>s?[s.file??s.url]:[]));
    const originals=new Set<File>();
    for(const section of get(arrangement)){
      // PLAY recalls the recorded snapshot when present; warm that same scene
      // and its own effects rather than the current rack's settings.
      const scene=section.deckSnapshot?.scene??section.scene;
      const settings=section.deckSnapshot?.timing??get(timingSettings);
      for(const [slot,source] of Object.entries(scene?.slots??{}))if(source&&(source.file||source.url)){
        let variant=source;
        if(source.file&&effectiveClipTiming(settings,slot).effect==='ramp'){
          const file=source.file;originals.add(file);
          let entry=this.sceneVariants.get(file);
          if(!entry){
            entry={source:null,loading:true,error:null};this.sceneVariants.set(file,entry);
            const current=entry,generation=this.generation;
            void prepareSlowMotionFile(file,p=>{
              if(generation===this.generation && this.sceneVariants.get(file)===current && p.jobId)current.jobId=p.jobId;
            }).then(prepared=>{
              if(generation!==this.generation||this.sceneVariants.get(file)!==current)return;
              current.source={...source,file:prepared};current.loading=false;
              this.prewarmScenes();
            }).catch(error=>{
              if(generation!==this.generation||this.sceneVariants.get(file)!==current)return;
              current.error=error instanceof Error?error.message:String(error);current.loading=false;this.publishCapacity();
            });
          }
          if(!entry.source){
            // A shared preparation promise may still be resolving while a
            // rack recall changes sources; retain its already decoded bank.
            for(const [key,asset] of this.assets)if(asset.source.file&&originalSlowMotionFile(asset.source.file)===file)wanted.add(key);
            continue;
          }
          variant=entry.source;
        }
        wanted.add(variant.file??variant.url);this.assetFor(variant);
      }
    }
    for(const file of this.sceneVariants.keys())if(!originals.has(file))this.sceneVariants.delete(file);
    for(const [key,asset] of this.assets)if(!wanted.has(key)){asset.bank.dispose();this.assets.delete(key);}
    this.publishCapacity();
  }

  private publishCapacity(){
    const assets=[...this.assets.values()];
    timingCacheCapacity.set({usedBytes:this.budget.used,
      requiredBytes:this.budget.used+assets.reduce((total,asset)=>total+asset.requiredBytes,0),
      pending:assets.filter(asset=>asset.loading).length+[...this.sceneVariants.values()].filter(variant=>variant.loading).length});
    timingSceneErrors.set(Object.fromEntries([
      ...assets.filter(asset=>asset.error).map(asset=>[asset.source.name,asset.error!]),
      ...[...this.sceneVariants].filter(([,variant])=>variant.error).map(([file,variant])=>[file.name,variant.error!])
    ]));
  }

  retry(slot: string) {
    const failed=this.banks.get(slot)?.bank;
    for(const [key,asset] of this.assets)if(asset.bank===failed){asset.bank.dispose();this.assets.delete(key);}
    for(const [id,entry] of this.banks)if(entry.bank===failed){this.banks.delete(id);this.selected.delete(id);}
    this.reconcile();
  }

  async retryScenes() {
    const generation=this.generation;
    for(const [key,asset] of this.assets)if(asset.error){
      asset.bank.dispose();this.assets.delete(key);
      for(const [slot,entry] of this.banks)if(entry.bank===asset.bank){
        this.banks.delete(slot);this.selected.delete(slot);this.plans.delete(slot);this.programDirty=true;
      }
    }
    await Promise.all([...this.sceneVariants].filter(([,entry])=>entry.error).map(async([file,entry])=>{
      entry.error=null;entry.loading=true;this.publishCapacity();
      try {
        if(entry.jobId)await resumeInterpolationJob(entry.jobId);
        if(generation===this.generation && this.sceneVariants.get(file)===entry)this.sceneVariants.delete(file);
      } catch(error) {
        if(generation===this.generation && this.sceneVariants.get(file)===entry){
          entry.error=error instanceof Error?error.message:String(error);entry.loading=false;
        }
      }
    }));
    if(generation===this.generation){this.reconcile();this.publishCapacity();}
  }

  private updatePgmSignals(frame: TimelineFrame) {
    const replay=get(arrangementMode)==='play';
    const reset=frame.generation!==this.pgmGeneration||replay!==this.pgmReplay;
    this.pgmGeneration=frame.generation;this.pgmReplay=replay;
    if(reset){this.pgmSignals.clear();this.pgmLastSlot=null;this.pgmReplayCuts=null;}
    const signalFor=(events:{time:number;strength:number}[]):TimingSignal=>({
      ...this.signal!,label:'PGM SOURCE',missing:undefined,channels:[{name:'pgm',events}],
    });
    if(replay){
      const recorded=get(cuts);
      if(recorded===this.pgmReplayCuts)return;
      this.pgmReplayCuts=recorded;
      for(let i=0;i<10;i++){
        const slot=`${i<5?'top':'bottom'}-${i%5}`;
        this.pgmSignals.set(slot,signalFor(recorded.filter(c=>c.slotIndex===i).map(c=>({
          time:c.timeSeconds??c.step/4*60/this.signal!.bpm,strength:1,
        }))));
      }
    }else if(frame.playing){
      const slot=currentRackSlotForModule(get(pgmSource));
      if(slot&&slot!==this.pgmLastSlot){
        this.pgmLastSlot=slot;
        const events=this.pgmSignals.get(slot)?.channels[0]?.events??[];
        this.pgmSignals.set(slot,signalFor([...events,{time:frame.positionSeconds,strength:1}]));
      }
    }
  }

  tick(frame: TimelineFrame) {
    if (!this.active) return;
    if(frame.generation!==this.manualGeneration){
      this.manualGeneration=frame.generation;this.manualPending=false;
      this.manualQueued=null;this.manualPgm=null;this.manualHoldUntil=-Infinity;
    }
    const serial=get(manualCutRequests),pgm=get(pgmSource),queued=get(queuedPgmSource);
    const requested=this.manualSerial!==null&&serial!==this.manualSerial;
    this.manualSerial=serial;
    if(requested)this.manualPending=true;
    if(queued)this.manualQueued=queued;
    if(!queued&&this.manualPending){
      const landed=this.manualQueued?pgm===this.manualQueued:requested&&pgm!==this.manualPgm;
      if(landed){
        const sourceBpm=frame.bpm/Math.max(.01,frame.playbackRate);
        // Musical-source mode disables the independent PGM interval. Give a
        // hand cut one complete bar, then accept only a new automatic burst.
        this.manualHoldUntil=frame.positionSeconds+PGM_LAUNCH_QUANTIZE_BEATS*60/sourceBpm;
      }
      this.manualPending=false;this.manualQueued=null;
    }
    this.manualPgm=pgm;
    const settings = get(timingSettings);
    frame = timingOutputFrame(frame, settings.outputFps);
    const output = Math.floor(frame.positionSeconds*settings.outputFps+1e-6);
    let updateOutput = output !== this.lastOutput || settings !== this.lastSettings || frame.generation !== this.lastTransportGeneration;
    const key=[settings.trigger,settings.deckTriggers,get(timingInput),get(analysisBeatGrid),get(analysisOnsets),get(midiChannels),audioEngine.getUploadedTrackLoadGeneration(),frame.bpm/Math.max(.01,frame.playbackRate),Math.ceil((frame.positionSeconds+1)/300)];
    if(!this.signal||key.some((v,i)=>v!==this.signalKey[i])){
      updateOutput=true;
      this.signalKey=key;
      this.triggerSignals.clear();
      this.signal=resolveTimingSignal(settings.trigger,frame.bpm/Math.max(.01,frame.playbackRate),Math.ceil((frame.positionSeconds+1)/300)*300);
      timingSignalStatus.set({label:this.signal.label,missing:this.signal.missing,channels:this.signal.channels.map(c=>c.name)});
      timingSignalGrid.set({beats:this.signal.beats,bpm:this.signal.bpm});
    }
    if(Array.from({length:10},(_,i)=>`${i<5?'top':'bottom'}-${i%5}`).some(slot=>effectiveTimingTrigger(settings,slot).source==='pgm'))this.updatePgmSignals(frame);
    const live: Record<string,TimingLive> = {};
    for (const [slot, entry] of this.banks) {
      if (!entry.bank.stats.ready || entry.factor === null) continue;
      if(!this.defaults.has(slot))this.defaults.set(slot,defaultClipTiming(slot));
      const stored = effectiveClipTiming(settings,slot);
      const trigger = effectiveTimingTrigger(settings,slot);
      let signal=this.signal;
      if(settings.scope==='deck'){
        const cached=this.triggerSignals.get(trigger);
        signal=cached??resolveTimingSignal(trigger,frame.bpm/Math.max(.01,frame.playbackRate),Math.ceil((frame.positionSeconds+1)/300)*300);
        if(!cached)this.triggerSignals.set(trigger,signal);
      }
      if(trigger.source==='pgm'){
        if(!this.pgmSignals.has(slot))this.pgmSignals.set(slot,{...signal,missing:undefined,channels:[{name:'pgm',events:[]}]});
        signal=this.pgmSignals.get(slot)!;
      }
      let config = this.normalized.get(stored);
      if (!config) {
        config = { ...stored, ramp: normalizeTimingRamp(stored.ramp) };
        this.normalized.set(stored, config);
      }
      // Settings can be restored or changed while the workspace is inactive or
      // verification is pending. Recheck at the playback boundary as well.
      if (entry.factor > 1 && config.effect === 'stutter') {
        allowTimingClip(slot, entry.factor, config);
        if (get(timingStatus)[slot]?.state !== 'error') {
          timingStatus.update(s => ({...s,[slot]:{...s[slot],state:'error',message:RIFE_RAMP_ONLY}}));
        }
        this.selected.delete(slot);
        entry.clock = null;
        continue;
      }
      allowTimingClip(slot, entry.factor, config);
      if (get(timingStatus)[slot]?.state === 'error') {
        const stats = entry.bank.stats;
        timingStatus.update(s => ({...s,[slot]:{state:'ready',frames:stats.frames,total:stats.frames,bytes:stats.bytes,fps:stats.fps,interpolationFactor:entry.factor!}}));
        updateOutput = true;
      }
      const seed = [...slot].reduce((n,c)=>n+c.charCodeAt(0),0);
      const slotIndex=Number(slot.split('-')[1])+(slot.startsWith('bottom')?5:0);
      let plan=this.plans.get(slot);
      if(!plan||plan.config!==config||plan.signal!==signal||plan.trigger!==trigger||plan.schedule.duration!==entry.bank.duration){
        plan={config,signal,trigger,schedule:buildTimingSchedule(config,trigger,signal,slotIndex,entry.bank.duration)};
        this.plans.set(slot,plan);
        this.programDirty = true;
        timingSchedules.update(s=>({...s,[slot]:plan!.schedule.bursts}));
        updateOutput=true;
      }
      const continuous=trigger.source==='continuous';
      const oldClock=continuous?advanceClipTiming(entry.clock,frame,config,entry.bank.duration,seed):null;
      if(oldClock)entry.clock=oldClock.state;else entry.clock=null;
      const clock=oldClock??sampleTimingSchedule(plan.schedule,frame.positionSeconds);
      if (updateOutput || !this.selected.has(slot)) {
        const resident = entry.bank.frameAt(clock.sourceSeconds,slot);
        if (resident) this.selected.set(slot,{view:resident.view,pts:resident.pts,requestedSeconds:clock.sourceSeconds,width:entry.bank.width,height:entry.bank.height,effect:config.effect});
      }
      const musical=continuous?{state:'continuous' as const}:sampleTimingSchedule(plan.schedule,frame.positionSeconds);
      live[slot] = { sourceTimelineSeconds:clock.sourceTimelineSeconds, phase:clock.phase,rate:clock.rate,sourceSeconds:clock.sourceSeconds,pts:this.selected.get(slot)?.pts??0,
        state:musical.state,triggerTime:'triggerTime' in musical?musical.triggerTime:null,burstEnd:'burstEnd' in musical?musical.burstEnd:null,time:frame.positionSeconds,beat:frame.beatPosition };
    }
    if (updateOutput) timingLive.set(live);
    if (this.programDirty) {
      this.program = programTimeline(Array.from({length:10},(_,index)=>{
        const plan=this.plans.get(`${index<5?'top':'bottom'}-${index%5}`);
        return plan&&!['pgm','beat','continuous'].includes((plan.trigger as TimingTriggerConfig).source)?plan.schedule.bursts:[];
      }));
      this.programDirty = false;
    }
    const timingOwnsPgm=timingPgmFollowsTriggers(settings,[...this.selected.keys()]);
    if (frame.playing && get(arrangementMode)!=='play' && timingOwnsPgm
      && get(queuedPgmSource)===null) {
      let lo=0,hi=this.program.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(this.program[mid].at<=frame.positionSeconds)lo=mid+1;else hi=mid;}
      const cut=this.program[lo-1];
      if(cut&&cut.at>=this.manualHoldUntil){
        const key=`${frame.generation}:${cut.at}:${cut.deck}`;
        if(key!==this.programSelection){
          this.programSelection=key;
          const slot=`${cut.deck<5?'top':'bottom'}-${cut.deck%5}`;
          const module=currentRackModuleForSlot(slot);
          if(module&&this.selected.has(slot))commitPgmCut(module);
        }
      }
    } else if(!frame.playing||get(arrangementMode)==='play'||!timingOwnsPgm)this.programSelection='';
    this.lastOutput = output; this.lastSettings = settings; this.lastTransportGeneration = frame.generation;
  }

  get diagnostics() { return { active:this.active,usedBytes:this.budget.used,budgetBytes:this.budget.limit,capacity:get(timingCacheCapacity),
    preloadHeight:this.preloadHeight,
    assets:[...this.assets.values()].map(asset=>({name:asset.source.name,loading:asset.loading,requiredBytes:asset.requiredBytes,...asset.bank.stats,
      slots:[...this.banks].filter(([,entry])=>entry.bank===asset.bank).map(([slot])=>slot)})),
    signal:this.signal?{label:this.signal.label,missing:this.signal.missing,channels:this.signal.channels.map(c=>({name:c.name,events:c.events.length}))}:null,
    schedules:Object.fromEntries([...this.plans].map(([slot,p])=>[slot,{bursts:p.schedule.bursts.length,first:p.schedule.bursts.slice(0,4)}])),
    slots:Object.fromEntries([...this.banks].map(([slot,e])=>[slot,e.bank.stats])),
    selected:Object.fromEntries([...this.selected].map(([slot,s])=>[slot,{pts:s.pts,requestedSeconds:s.requestedSeconds,effect:s.effect}])) }; }

  private clearBanks() {
    this.generation++;
    for (const asset of this.assets.values()) asset.bank.dispose();
    this.assets.clear();this.sceneVariants.clear();timingSceneStatus.set({});this.publishCapacity();
    this.banks.clear(); this.selected.clear(); timingStatus.set({}); timingLive.set({}); this.lastOutput=-1;
    this.plans.clear();
    this.program=[];this.programDirty=true;this.programSelection='';this.triggerSignals.clear();
    this.pgmSignals.clear();this.pgmLastSlot=null;this.pgmReplayCuts=null;this.pgmGeneration=-1;
    this.manualGeneration=-1;this.manualSerial=null;this.manualPending=false;this.manualQueued=null;this.manualPgm=null;this.manualHoldUntil=-Infinity;
    timingSchedules.set({});
  }
  dispose() {
    mediaRuntime.setResidentSourceFactor(null);
    this.active=false; this.stopSources?.(); this.stopSources=null; this.stopSettings?.(); this.stopSettings=null;
    this.stopSections?.();this.stopSections=null;
    this.clearBanks(); this.device=null; timingActive.set(false);
  }
}
export const timingRuntime = new TimingRuntime();
