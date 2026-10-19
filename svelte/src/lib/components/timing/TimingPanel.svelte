<script lang="ts">
  import { slotPreparation, retrySlotPreparation } from '$lib/runtime/timing/preparation';
  import TimingCurve from './TimingCurve.svelte';
  import { arrangementMode } from '$lib/arrangement/transportMode';
  import StutterGrid from './StutterGrid.svelte';
  import SamplerGrid from './SamplerGrid.svelte';
  import ModuleControls from '../ModuleControls.svelte';
  import { presetsForModule } from '$lib/modules/presets';
  import TimingTriggers from './TimingTriggers.svelte';
  import TimingEventStrip from './TimingEventStrip.svelte';
  import { rampRange,scaleRampRange,rampPreset,RAMP_PRESET_NAMES,RAMP_PREVIEW_PATHS } from '$lib/runtime/timing/rampPresets';
  import { effectiveClipTiming, setTimingScope, timingSettings, selectedTimingSlot, timingEditorCollapsed, timingEditorTab, timingLive, timingStatus, timingClipRestrictions, setClipTiming } from '$lib/stores/timing';
  import { pgmSource } from '$lib/stores/pgm';
  import { currentRackSlotForModule, videoLayers } from '$lib/stores/rack';
  import { defaultClipTiming, type ClipTiming, type Snap, type CurveShape } from '$lib/runtime/timing/envelope';
  import { timingRuntime } from '$lib/runtime/timing/TimingRuntime';
  import { undoTiming, redoTiming } from '$lib/stores/timing';
  import { TIMING_BUDGET_OPTIONS, timingCacheCapacity } from '$lib/stores/timing';
  import { timingEffectAccent } from './presentation';
  import TimingFooter from './TimingFooter.svelte';
  import { saveTimingPreset,loadTimingPreset,timingPresetStatus } from '$lib/stores/timing';
  const config=$derived(effectiveClipTiming($timingSettings,$selectedTimingSlot));
  const live=$derived($timingLive[$selectedTimingSlot]);
  const status=$derived($timingStatus[$selectedTimingSlot]);
  const range=$derived(rampRange(config.ramp));
  const number=$derived(Number($selectedTimingSlot.split('-')[1])+($selectedTimingSlot.startsWith('bottom')?5:0));
  const used=$derived($timingCacheCapacity.usedBytes/2**30);
  const capacityErrors=$derived(Object.values($timingStatus).filter(s=>s.state==='error' && s.requiredBytes));
  const capacityPending=$derived($timingCacheCapacity.pending>0);
  const requiredGiB=$derived($timingCacheCapacity.requiredBytes/2**30);
  const suggestedBudget=$derived(TIMING_BUDGET_OPTIONS.find(gb=>gb>=requiredGiB));
  const lowerPreload=$derived($timingSettings.preloadHeight===0 || $timingSettings.preloadHeight>360 ? 360 : $timingSettings.preloadHeight>270 ? 270 : null);
  let followOnAir=$state(false);
  $effect(()=>{
    if(followOnAir){
      const slot=currentRackSlotForModule($pgmSource);
      if(slot && $selectedTimingSlot !== slot)selectedTimingSlot.set(slot);
    }
  });
  let snap=$state<Snap>('32nd');
  const cycleOptions=[.5,1,2,4,8,12,16,20,24,28,32];
  const cycleLabel=(beats:number)=>beats<4?`${beats} BEAT${beats===1?'':'S'}`:`${beats/4} BAR${beats===4?'':'S'}`;
  function changeCycleChoice(index:number,beats:number){
    const choices=[...(config.ramp.cycleChoices??[1,2,4,8])];choices[index]=beats;
    update({ramp:{...config.ramp,cycleChoices:choices}});
  }
  function update(patch:Partial<ClipTiming>){
    if(patch.ramp){
      const nextRange=rampRange(patch.ramp);
      if(nextRange.max>2)patch={...patch,ramp:scaleRampRange(patch.ramp,Math.min(2,nextRange.min),2)};
    }
    setClipTiming($selectedTimingSlot,{...config,...patch});
  }
  function choose(effect:'ramp'|'stutter'|'timesampler'){update({effect});}
  function shortcut(e: KeyboardEvent) {
    if (e.defaultPrevented || e.repeat || e.altKey || !(e.ctrlKey || e.metaKey)) return;
    if (e.composedPath().some(n => n instanceof HTMLElement && (n.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(n.tagName)))) return;
    const key=e.key.toLowerCase();
    if(key==='z'){e.preventDefault();if(e.shiftKey)redoTiming();else undoTiming();}
    else if(key==='y'){e.preventDefault();redoTiming();}
  }
</script>

<svelte:window onkeydown={shortcut}/>
{#each Object.entries($slotPreparation) as [slot,preparing] (slot)}
  <div class="processing-notice" role="status">
    <span>{preparing.name} · {preparing.state==='failed'?'PROCESSING FAILED':preparing.stage.replaceAll('-',' ').toUpperCase()}{preparing.total>0?` · ${preparing.completed} / ${preparing.total}`:''} · Playback waits for preparation</span>
    {#if preparing.error}<span>{preparing.error}</span><button onclick={()=>void retrySlotPreparation(slot,preparing).catch(error=>slotPreparation.update(s=>({...s,[slot]:{...preparing,error:String(error)}})))}>RETRY GPU PROCESSING</button>{/if}
  </div>
{/each}
<section class="timing-panel" class:is-collapsed={$timingEditorCollapsed} aria-label="Timing editor" style:--timing-accent={timingEffectAccent($timingEditorTab)}>
  <fieldset disabled={$arrangementMode!=='live'} style="border:0;padding:0;margin:0;min-width:0">
  <header>
    <button class="timing-collapse" onclick={()=>timingEditorCollapsed.update(v=>!v)} aria-expanded={!$timingEditorCollapsed} aria-label="Toggle timing editor">{$timingEditorCollapsed?'▸':'▾'} TIMING</button>
    <button class="follow-on-air" aria-pressed={followOnAir} onclick={()=>followOnAir=!followOnAir} title="Follow the on-air clip in this editor. Off keeps your selected clip open.">FOLLOW ON AIR</button>
    <button class="scope" aria-label="Timing settings scope" title="Scope for the entire TIMING workspace. GLOBAL shares ramp, stutter and trigger settings; each video keeps its assigned effect. MODULAR edits each video separately. PERFORM is unaffected." onclick={()=>setTimingScope($timingSettings.scope==='deck'?'global':'deck')}>{$timingSettings.scope==='deck'?'MODULAR · PER VIDEO':'GLOBAL · ALL VIDEOS'}</button><span class="clip">S{number} · {$videoLayers[$selectedTimingSlot]?.name??'SELECT / LOAD A CLIP'}</span>
    <span class="live">{live?.rate.toFixed(2)??'1.00'}× · SRC {live?.sourceSeconds.toFixed(2)??'0.00'}s</span>
    <span class="memory">{used.toFixed(2)} / {$timingSettings.budgetGiB} GiB</span>
    <button title="Save all Timing settings in this browser, including Global or Modular scope. Clips and audio are not embedded." onclick={saveTimingPreset}>SAVE PRESET</button>
    <button title="Restore the Timing settings saved in this browser." onclick={loadTimingPreset}>LOAD PRESET</button>
    {#if $timingPresetStatus}<span role="status">{$timingPresetStatus}</span>{/if}
  </header>
  {#if status?.state==='error' && !status.requiredBytes && !$timingClipRestrictions[$selectedTimingSlot]}
    <div class="capacity-notice" role="alert">
      <span>{status.message ?? 'Clip could not be loaded'}</span>
      <button onclick={()=>timingRuntime.retry($selectedTimingSlot)}>RETRY CLIP</button>
    </div>
  {/if}
  {#if capacityErrors.length}
    <div class="capacity-notice" role="status">
      <span>{capacityErrors.length} {capacityErrors.length===1?'CLIP':'CLIPS'} BLOCKED BY {$timingSettings.budgetGiB} GiB CAPACITY · {capacityPending?'CHECKING REMAINING CLIPS…':`AT LEAST ${requiredGiB.toFixed(2)} GiB NEEDED INCLUDING SECTION CACHE`}</span>
      {#if capacityPending}<span>CHECKING…</span>
      {:else if suggestedBudget && suggestedBudget>$timingSettings.budgetGiB}
        <button onclick={()=>timingSettings.update(s=>({...s,budgetGiB:suggestedBudget!}))}>USE {suggestedBudget} GiB & RELOAD</button>
      {:else}<span>USE SMALLER CLIPS</span>{/if}
      {#if !capacityPending && lowerPreload}<button title="Reduce resolution while keeping every source frame and the existing memory cap." onclick={()=>timingSettings.update(s=>({...s,preloadHeight:lowerPreload!}))}>PRELOAD {lowerPreload}p & RELOAD</button>{/if}
    </div>
  {/if}
  {#if !$timingEditorCollapsed}
    {#if $timingClipRestrictions[$selectedTimingSlot]}<p role="alert" class="capacity-notice">{$timingClipRestrictions[$selectedTimingSlot]}</p>{/if}
    <TimingTriggers/>
    <div class="editor-controls">
      <div class="tabs" role="tablist" aria-label="Timing effect">
        <button role="tab" aria-selected={$timingEditorTab==='ramp'} class:active={config.effect==='ramp'} onclick={()=>choose('ramp')}>SPEEDRAMP</button>
        <button role="tab" aria-selected={$timingEditorTab==='stutter'} class:active={config.effect==='stutter'} onclick={()=>choose('stutter')}>STUTTER</button>
        <button role="tab" aria-selected={$timingEditorTab==='timesampler'} class:active={config.effect==='timesampler'} onclick={()=>choose('timesampler')}>TIMESAMPLER</button>
        <button class:active={config.effect==='off'} onclick={()=>update({effect:config.effect==='off'?$timingEditorTab:'off'})} aria-pressed={config.effect==='off'}>OFF</button>
      </div>
      <div class="effect-parameters">
      {#if $timingEditorTab==='ramp'}
        <label>MIN × <input aria-label="Ramp minimum speed" type="number" min=".25" max="2" step=".05" value={Number(range.min.toFixed(2))} onchange={e=>{const n=Number(e.currentTarget.value);if(Number.isFinite(n))update({ramp:scaleRampRange(config.ramp,n,Math.max(n,range.max))});}}/></label>
        <label>MAX × <input aria-label="Ramp maximum speed" type="number" min=".25" max="2" step=".05" value={Number(range.max.toFixed(2))} onchange={e=>{const n=Number(e.currentTarget.value);if(Number.isFinite(n))update({ramp:scaleRampRange(config.ramp,Math.min(n,range.min),n)});}}/></label>
        <label>CYCLE <select aria-label="Ramp cycle mode" title="Fixed uses one length. Random chooses a selected musical length for each trigger and completes that effect before another trigger is accepted." value={config.ramp.cycleMode??'fixed'} onchange={e=>update({ramp:{...config.ramp,cycleMode:e.currentTarget.value as 'fixed'|'random',cycleChoices:config.ramp.cycleChoices??[1,2,4,8]}})}><option value="fixed">FIXED</option><option value="random">RANDOM</option></select></label>
        {#if config.ramp.cycleMode==='random'}
          {#each [0,1,2,3] as i (i)}<label>{i+1}<select aria-label={`Ramp random cycle choice ${i+1}`} value={(config.ramp.cycleChoices??[1,2,4,8])[i]??[1,2,4,8][i]} onchange={e=>changeCycleChoice(i,Number(e.currentTarget.value))}>{#each cycleOptions as beats (beats)}<option value={beats}>{cycleLabel(beats)}</option>{/each}</select></label>{/each}
        {:else}
          <select aria-label="Ramp cycle" title="Length of one complete speed curve after a trigger. In 4/4, 2 beats is half a bar and 4 beats is one bar. A 2-bar ramp runs once for 8 beats, then normal playback resumes until the next accepted trigger." value={config.ramp.cycleBeats} onchange={e=>update({ramp:{...config.ramp,cycleBeats:Number(e.currentTarget.value)}})}>{#each cycleOptions as beats (beats)}<option value={beats}>{cycleLabel(beats)}</option>{/each}</select>
        {/if}
        <label>SHAPE <select aria-label="Ramp interpolation" value={config.ramp.shape} onchange={(e)=>update({ramp:{...config.ramp,legacy:undefined,shape:e.currentTarget.value as CurveShape}})}>{#each ['smooth','sine','linear','tension','hold'] as shape (shape)}<option value={shape}>{shape.toUpperCase()}</option>{/each}</select></label>
        <label>SNAP <select aria-label="Ramp snapping" title="Align points while editing the curve. This changes where you can place points; it does not change when music triggers the effect." bind:value={snap}>{#each ['off','bar','beat','16th','32nd','64th'] as option (option)}<option value={option}>{option.toUpperCase()}</option>{/each}</select></label>
        <button onclick={()=>update({ramp:defaultClipTiming().ramp})}>RESET SHAPE</button>
      {:else if $timingEditorTab==='timesampler'}
        <label>BEHAVIOR <select aria-label="Timesampler behavior" value={config.sampler.behavior} onchange={e=>update({sampler:{...config.sampler,behavior:e.currentTarget.value as ClipTiming['sampler']['behavior']}})}><option value="hit">TRIGGERED SAMPLE</option><option value="phrase">TRIGGERED SEQUENCE</option><option value="continuous">ORIGINAL · CONTINUOUS</option></select></label>
        {#if config.sampler.behavior!=='continuous'}<label>LAUNCH <select aria-label="Timesampler phrase launch" value={config.sampler.launchBeats} onchange={e=>update({sampler:{...config.sampler,launchBeats:Number(e.currentTarget.value) as 1|4}})}><option value={1}>NEXT BEAT</option><option value={4}>NEXT BAR</option></select></label>{/if}
        {#if config.sampler.behavior!=='continuous'}<button aria-label="Restart sample on trigger" aria-pressed={config.sampler.retrigger==='restart'} title="Finish Loop ignores incoming triggers. Restart on Trigger interrupts at the selected launch boundary." onclick={()=>update({sampler:{...config.sampler,retrigger:config.sampler.retrigger==='restart'?'finish':'restart'}})}>RETRIGGER · {config.sampler.retrigger==='restart'?'RESTART ON TRIGGER':'FINISH LOOP'}</button>{/if}
        {#if config.sampler.behavior!=='hit'}<label>GROOVE <select aria-label="Timesampler groove" value={config.sampler.groove} onchange={e=>update({sampler:{...config.sampler,groove:e.currentTarget.value as ClipTiming['sampler']['groove']}})}><option value="straight">STR8</option><option value="swing">SWNG · 2:1</option><option value="dotted">DOT · 1.5×</option></select></label>{/if}
      {:else}
        <label>GROOVE <select aria-label="Stutter groove" value={config.stutter.groove??'straight'} onchange={e=>update({stutter:{...config.stutter,groove:e.currentTarget.value as 'straight'|'swing'|'dotted'}})}><option value="straight">STR8</option><option value="swing">SWNG · 2:1</option><option value="dotted">DOT · 1.5×</option></select></label>
        <label>DIVISION <select aria-label="Stutter division" value={config.stutter.division} onchange={(e)=>update({stutter:{...config.stutter,division:Number(e.currentTarget.value)}})}>{#each [.125,.25,.5,1,2,4] as b (b)}<option value={b}>{b===4?'1 BAR':`1/${4/b}`}</option>{/each}</select></label>
        <label>REPEATS <input aria-label="Stutter repeats" type="number" min="1" max="16" value={config.stutter.repeats} onchange={(e)=>update({stutter:{...config.stutter,repeats:Math.max(1,Math.min(16,Math.round(Number(e.currentTarget.value)||1)))}})}/></label>
        <label>MODE <select aria-label="Stutter mode" value={config.stutter.mode} onchange={(e)=>update({stutter:{...config.stutter,mode:e.currentTarget.value as 'repeat'|'hold'|'jump'}})}><option value="repeat">REPEAT</option><option value="hold">HOLD</option><option value="jump">JUMP CUT</option></select></label>
        {#if config.stutter.mode==='jump'}<label>SLICES <select aria-label="Jump slices" value={config.stutter.slices} onchange={(e)=>update({stutter:{...config.stutter,slices:Number(e.currentTarget.value)}})}>{#each [4,8,16,32,64] as n (n)}<option>{n}</option>{/each}</select></label>{/if}
      {/if}
      </div>
      {#if $timingEditorTab==='ramp'}
      <div class="shape-bank" aria-label="Ramp shape presets">{#each RAMP_PRESET_NAMES as name (name)}<button title={name==='COSINE'?'ZigSwap cosine · 0.5× → 2× → 0.5×':name==='SMASH'?'ZigSwap smash · 12 beats at ¼×, 1 at 2×, 3 at 1×':`Perform ${name} curve`} aria-label={`Ramp shape ${name}`} onclick={()=>update({ramp:{...rampPreset(name,config.ramp.cycleBeats),cycleMode:config.ramp.cycleMode,cycleChoices:config.ramp.cycleChoices}})}><svg viewBox="0 0 64 24" aria-hidden="true"><path d={RAMP_PREVIEW_PATHS[name]} fill="none" stroke="currentColor" stroke-width="1"/></svg><span>{name}</span></button>{/each}</div>
      {/if}
    </div>
    <div class="effect-stage" class:sampler-stage={$timingEditorTab==='timesampler'}>
    {#if $timingEditorTab==='ramp'}

      <TimingCurve ramp={config.ramp} phase={config.effect==='ramp'?live?.phase??0:0} {snap} onchange={(ramp)=>update({ramp})}/>
    {:else if $timingEditorTab==='timesampler'}
      <div class="sampler-controls"><ModuleControls timingOnly samplerTriggered={config.sampler.behavior==='hit'} moduleId="timesampler" params={config.sampler.controls} color={timingEffectAccent('timesampler')} onUpdate={(key,value)=>update({sampler:{...config.sampler,controls:{...config.sampler.controls,[key]:value}}})}/><div class="sampler-presets">PRESET {#each presetsForModule('timesampler') as preset (preset.n)}<button title={preset.title} aria-label={`Timesampler preset ${preset.n}`} onclick={()=>update({sampler:{...config.sampler,controls:{...config.sampler.controls,...preset.set}}})}>{preset.n}</button>{/each}</div></div>
      <SamplerGrid config={config.sampler} sourceSeconds={live?.sourceSeconds??0} duration={live?.sourceDurationSeconds??0} normalSeconds={live?.samplerNormal??0} trace={live?.samplerTrace??[]} beat={live?.beat??0} enabled={config.effect==='timesampler'} state={live?.state??'waiting'} queuedAt={live?.samplerQueuedAt??null} time={live?.time??0} end={live?.burstEnd??null}/>
    {:else}
      <StutterGrid stutter={config.stutter} phase={config.effect==='stutter'?live?.phase??0:0} enabled={config.effect==='stutter'} state={live?.state??'waiting'}/>
    {/if}
    </div>
    <TimingEventStrip/>
    <TimingFooter />
  {/if}
  </fieldset>
</section>

<style>
  .processing-notice{display:flex;align-items:center;gap:10px;padding:9px;background:#1b292b;color:#83ccc5;font:9px var(--font-ui)}
  .follow-on-air[aria-pressed="true"]{color:var(--timing-accent);border-color:var(--timing-accent)}
  .effect-stage{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:var(--timing-plot-height,200px);min-width:0;background:#090b0c}
  .effect-stage.sampler-stage{grid-template-columns:330px minmax(0,1fr);grid-template-rows:minmax(240px,auto)}
  .sampler-controls{padding:8px;border-right:1px solid #1e2226;display:flex;flex-direction:column}.sampler-presets{display:flex;align-items:center;gap:6px;padding:4px;font:7px var(--font-ui)}
  .effect-stage :global(.curve-tools){grid-row:1;grid-column:1;align-self:start;justify-self:start;height:20px;position:relative;z-index:1}
  .effect-stage :global(.curve-canvas){grid-row:1;grid-column:1}
  .effect-stage :global(.stutter-grid){grid-row:1;grid-column:1}
  .effect-parameters{display:flex;flex-wrap:nowrap;align-items:center;gap:8px 12px;min-width:0}
  .editor-controls{display:grid!important;grid-template-columns:max-content max-content minmax(0,1fr);align-items:center!important;height:64px;min-height:64px;box-sizing:border-box;overflow-x:auto}
  .tabs{flex-shrink:0;white-space:nowrap}
  header>span{min-width:0}.live{width:152px;text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums}.memory{width:94px;text-align:right;flex-shrink:0}

  .shape-bank{display:flex;flex-wrap:nowrap;overflow-x:auto;min-width:0;height:48px;gap:3px;padding:2px 0;background:#0e1012}.shape-bank button{width:64px;flex-shrink:0;padding:2px;color:#76958f}.shape-bank button:hover{color:var(--timing-accent);background:#1b2826}.shape-bank svg{display:block;width:100%;height:22px}.shape-bank span{font:6px var(--font-mono)}
  .capacity-notice{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px;color:#e49879;background:#281c16;border-bottom:1px solid #673c30;font:8px var(--font-mono)}
  .timing-panel{flex-shrink:0;background:#131416;border:1px solid #1e2226;border-top:2px solid #0d0e0f;font-family:var(--font-ui);color:#6a7a8a;margin-top:8px;min-width:0}header{display:flex;align-items:center;gap:12px;height:30px;padding:0 8px;background:linear-gradient(#1b1e21,#141618);font-size:8px;letter-spacing:.08em}.timing-collapse{padding:0;color:#6a7a8a;background:transparent;border:0;border-radius:0}.timing-collapse:hover,.timing-collapse:focus-visible{color:#c4f4e8;outline:none}.scope{font-size:7px;border:1px solid #1e2226;padding:2px 5px;color:#556070}.clip{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.live{font-family:monospace;color:#6a7a8a}.memory{font:7px monospace;color:#4a5260}.editor-controls{display:flex;align-items:center;gap:12px;padding:7px 8px;border-bottom:1px solid #1e2226;flex-wrap:wrap}.tabs{display:flex;gap:3px}.tabs .active{color:var(--timing-accent);border-color:color-mix(in srgb,var(--timing-accent) 33%,transparent);background:linear-gradient(#19302e,#142022)}button,select,input{font:8px var(--font-ui);color:#556070;background:linear-gradient(#1a1c1f,#131517);border:1px solid #1e2226;border-radius:2px;padding:3px 6px;letter-spacing:.06em}button,select{cursor:pointer}select option{background:#131719;color:#6a7a8a}label{display:flex;align-items:center;gap:6px;font-size:7px;letter-spacing:.08em}input{width:45px}
</style>
