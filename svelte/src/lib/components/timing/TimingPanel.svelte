<script lang="ts">
  import TimingCurve from './TimingCurve.svelte';
  import StutterGrid from './StutterGrid.svelte';
  import TimingTriggers from './TimingTriggers.svelte';
  import TimingEventStrip from './TimingEventStrip.svelte';
  import { rampRange,scaleRampRange,rampPreset,RAMP_PRESET_NAMES,RAMP_PREVIEW_PATHS } from '$lib/runtime/timing/rampPresets';
  import { timingSettings, selectedTimingSlot, timingEditorCollapsed, timingEditorTab, timingLive, timingStatus, timingClipRestrictions, setClipTiming } from '$lib/stores/timing';
  import { pgmSource } from '$lib/stores/pgm';
  import { currentRackSlotForModule, videoLayers } from '$lib/stores/rack';
  import { defaultClipTiming, type ClipTiming, type Snap, type CurveShape } from '$lib/runtime/timing/envelope';
  import { timingRuntime } from '$lib/runtime/timing/TimingRuntime';
  import { undoTiming, redoTiming } from '$lib/stores/timing';
  import { TIMING_BUDGET_OPTIONS } from '$lib/stores/timing';
  import { timingEffectAccent } from './presentation';
  import TimingFooter from './TimingFooter.svelte';
  const config=$derived($timingSettings.clips[$selectedTimingSlot]??defaultClipTiming($selectedTimingSlot));
  const live=$derived($timingLive[$selectedTimingSlot]);
  const status=$derived($timingStatus[$selectedTimingSlot]);
  const range=$derived(rampRange(config.ramp));
  const number=$derived(Number($selectedTimingSlot.split('-')[1])+($selectedTimingSlot.startsWith('bottom')?5:0));
  const used=$derived(Object.values($timingStatus).reduce((n,s)=>n+s.bytes,0)/2**30);
  const capacityErrors=$derived(Object.values($timingStatus).filter(s=>s.state==='error' && s.requiredBytes));
  const capacityPending=$derived(Object.values($timingStatus).some(s=>s.state==='loading' || s.state==='queued'));
  const requiredGiB=$derived(used+capacityErrors.reduce((n,s)=>n+(s.requiredBytes??0),0)/2**30);
  const suggestedBudget=$derived(TIMING_BUDGET_OPTIONS.find(gb=>gb>=requiredGiB));
  let followOnAir=$state(false);
  $effect(()=>{
    if(followOnAir){
      const slot=currentRackSlotForModule($pgmSource);
      if(slot)selectedTimingSlot.set(slot);
    }
  });
  let snap=$state<Snap>('32nd');
  function update(patch:Partial<ClipTiming>){
    if(patch.ramp){
      const nextRange=rampRange(patch.ramp);
      if(nextRange.max>2)patch={...patch,ramp:scaleRampRange(patch.ramp,Math.min(2,nextRange.min),2)};
    }
    setClipTiming($selectedTimingSlot,{...config,...patch});
  }
  function choose(effect:'ramp'|'stutter'){update({effect});}
  function shortcut(e: KeyboardEvent) {
    if (e.defaultPrevented || e.repeat || e.altKey || !(e.ctrlKey || e.metaKey)) return;
    if (e.composedPath().some(n => n instanceof HTMLElement && (n.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(n.tagName)))) return;
    const key=e.key.toLowerCase();
    if(key==='z'){e.preventDefault();if(e.shiftKey)redoTiming();else undoTiming();}
    else if(key==='y'){e.preventDefault();redoTiming();}
  }
</script>

<svelte:window onkeydown={shortcut}/>
<section class="timing-panel" class:is-collapsed={$timingEditorCollapsed} aria-label="Timing editor" style:--timing-accent={timingEffectAccent($timingEditorTab)}>
  <header>
    <button class="timing-collapse" onclick={()=>timingEditorCollapsed.update(v=>!v)} aria-expanded={!$timingEditorCollapsed} aria-label="Toggle timing editor">{$timingEditorCollapsed?'▸':'▾'} TIMING</button>
    <button class="follow-on-air" aria-pressed={followOnAir} onclick={()=>followOnAir=!followOnAir} title="Follow the on-air clip in this editor. Off keeps your selected clip open.">FOLLOW ON AIR</button>
    <span class="scope">PER CLIP</span><span class="clip">S{number} · {$videoLayers[$selectedTimingSlot]?.name??'SELECT / LOAD A CLIP'}</span>
    <span class="live">{live?.rate.toFixed(2)??'1.00'}× · SRC {live?.sourceSeconds.toFixed(2)??'0.00'}s</span>
    <span class="memory">{used.toFixed(2)} / {$timingSettings.budgetGiB} GiB</span>
  </header>
  {#if capacityErrors.length}
    <div class="capacity-notice" role="status">
      <span>{capacityErrors.length} {capacityErrors.length===1?'CLIP':'CLIPS'} BLOCKED BY {$timingSettings.budgetGiB} GiB CAPACITY · {capacityPending?'CHECKING REMAINING CLIPS…':`${requiredGiB.toFixed(2)} GiB NEEDED FOR THIS BANK`}</span>
      {#if capacityPending}<span>CHECKING…</span>
      {:else if suggestedBudget && suggestedBudget>$timingSettings.budgetGiB}
        <button onclick={()=>timingSettings.update(s=>({...s,budgetGiB:suggestedBudget!}))}>USE {suggestedBudget} GiB & RELOAD</button>
      {:else}<span>USE SMALLER CLIPS</span>{/if}
      {#if !capacityPending && $timingSettings.preloadHeight!==360}<button title="Reduce resolution while keeping every source frame and the existing memory cap." onclick={()=>timingSettings.update(s=>({...s,preloadHeight:360}))}>PRELOAD 360p & RELOAD</button>{/if}
    </div>
  {/if}
  {#if !$timingEditorCollapsed}
    {#if $timingClipRestrictions[$selectedTimingSlot]}<p role="alert" class="capacity-notice">{$timingClipRestrictions[$selectedTimingSlot]}</p>{/if}
    <TimingTriggers/>
    <div class="editor-controls">
      <div class="tabs" role="tablist" aria-label="Timing effect">
        <button role="tab" aria-selected={$timingEditorTab==='ramp'} class:active={config.effect==='ramp'} onclick={()=>choose('ramp')}>SPEEDRAMP</button>
        <button role="tab" aria-selected={$timingEditorTab==='stutter'} class:active={config.effect==='stutter'} onclick={()=>choose('stutter')}>STUTTER</button>
        <button class:active={config.effect==='off'} onclick={()=>update({effect:config.effect==='off'?$timingEditorTab:'off'})} aria-pressed={config.effect==='off'}>OFF</button>
      </div>
      <div class="effect-parameters">
      {#if $timingEditorTab==='ramp'}
        <label>MIN × <input aria-label="Ramp minimum speed" type="number" min=".25" max="2" step=".05" value={Number(range.min.toFixed(2))} onchange={e=>{const n=Number(e.currentTarget.value);if(Number.isFinite(n))update({ramp:scaleRampRange(config.ramp,n,Math.max(n,range.max))});}}/></label>
        <label>MAX × <input aria-label="Ramp maximum speed" type="number" min=".25" max="2" step=".05" value={Number(range.max.toFixed(2))} onchange={e=>{const n=Number(e.currentTarget.value);if(Number.isFinite(n))update({ramp:scaleRampRange(config.ramp,Math.min(n,range.min),n)});}}/></label>
        <label>CYCLE <select aria-label="Ramp cycle" value={config.ramp.cycleBeats} onchange={(e)=>update({ramp:{...config.ramp,cycleBeats:Number(e.currentTarget.value)}})}>{#each [.5,1,2,4,8,12,16,20,24,28,32] as beats (beats)}<option value={beats}>{beats<4?`${beats} BEAT${beats===1?'':'S'}`:`${beats/4} BAR${beats===4?'':'S'}`}</option>{/each}</select></label>
        <label>SHAPE <select aria-label="Ramp interpolation" value={config.ramp.shape} onchange={(e)=>update({ramp:{...config.ramp,legacy:undefined,shape:e.currentTarget.value as CurveShape}})}>{#each ['smooth','sine','linear','tension','hold'] as shape (shape)}<option value={shape}>{shape.toUpperCase()}</option>{/each}</select></label>
        <label>SNAP <select aria-label="Ramp snapping" bind:value={snap}>{#each ['off','bar','beat','16th','32nd','64th'] as option (option)}<option value={option}>{option.toUpperCase()}</option>{/each}</select></label>
        <button onclick={()=>update({ramp:defaultClipTiming().ramp})}>RESET SHAPE</button>
      {:else}
        <label>GROOVE <select aria-label="Stutter groove" value={config.stutter.groove??'straight'} onchange={e=>update({stutter:{...config.stutter,groove:e.currentTarget.value as 'straight'|'swing'|'dotted'}})}><option value="straight">STR8</option><option value="swing">SWNG · 2:1</option><option value="dotted">DOT · 1.5×</option></select></label>
        <label>DIVISION <select aria-label="Stutter division" value={config.stutter.division} onchange={(e)=>update({stutter:{...config.stutter,division:Number(e.currentTarget.value)}})}>{#each [.125,.25,.5,1,2,4] as b (b)}<option value={b}>{b===4?'1 BAR':`1/${4/b}`}</option>{/each}</select></label>
        <label>REPEATS <input aria-label="Stutter repeats" type="number" min="1" max="16" value={config.stutter.repeats} onchange={(e)=>update({stutter:{...config.stutter,repeats:Math.max(1,Math.min(16,Math.round(Number(e.currentTarget.value)||1)))}})}/></label>
        <label>MODE <select aria-label="Stutter mode" value={config.stutter.mode} onchange={(e)=>update({stutter:{...config.stutter,mode:e.currentTarget.value as 'repeat'|'hold'|'jump'}})}><option value="repeat">REPEAT</option><option value="hold">HOLD</option><option value="jump">JUMP CUT</option></select></label>
        {#if config.stutter.mode==='jump'}<label>SLICES <select aria-label="Jump slices" value={config.stutter.slices} onchange={(e)=>update({stutter:{...config.stutter,slices:Number(e.currentTarget.value)}})}>{#each [4,8,16,32,64] as n (n)}<option>{n}</option>{/each}</select></label>{/if}
      {/if}
      </div>
      {#if $timingEditorTab==='ramp'}
      <div class="shape-bank" aria-label="Ramp shape presets">{#each RAMP_PRESET_NAMES as name (name)}<button title={name==='COSINE'?'ZigSwap cosine · 0.5× → 2× → 0.5×':name==='SMASH'?'ZigSwap smash · 12 beats at ¼×, 1 at 2×, 3 at 1×':`Perform ${name} curve`} aria-label={`Ramp shape ${name}`} onclick={()=>update({ramp:rampPreset(name,config.ramp.cycleBeats)})}><svg viewBox="0 0 64 24" aria-hidden="true"><path d={RAMP_PREVIEW_PATHS[name]} fill="none" stroke="currentColor" stroke-width="1"/></svg><span>{name}</span></button>{/each}</div>
      {/if}
    </div>
    <div class="effect-stage" title="Click to add a point; Alt for free movement; double-click to delete">
    {#if $timingEditorTab==='ramp'}

      <TimingCurve ramp={config.ramp} phase={config.effect==='ramp'?live?.phase??0:0} {snap} onchange={(ramp)=>update({ramp})}/>
    {:else}
      <StutterGrid stutter={config.stutter} phase={config.effect==='stutter'?live?.phase??0:0} enabled={config.effect==='stutter'} state={live?.state??'waiting'}/>
    {/if}
    </div>
    <TimingEventStrip/>
    <TimingFooter />
  {/if}
</section>

<style>
  .follow-on-air[aria-pressed="true"]{color:var(--timing-accent);border-color:var(--timing-accent)}
  .effect-stage{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:var(--timing-plot-height,200px);min-width:0;background:#090b0c}
  .effect-stage :global(.curve-tools){grid-row:1;grid-column:1;align-self:start;justify-self:start;height:20px;position:relative;z-index:1}
  .effect-stage :global(.curve-canvas){grid-row:1;grid-column:1}
  .effect-stage :global(.stutter-grid){grid-row:1;grid-column:1}
  .effect-parameters{display:flex;flex-wrap:nowrap;align-items:center;gap:8px 12px;min-width:0}
  .editor-controls{display:grid!important;grid-template-columns:176px max-content minmax(0,1fr);align-items:center!important;min-height:48px;overflow-x:auto}
  .tabs{flex-shrink:0;white-space:nowrap}
  header>span{min-width:0}.live{width:152px;text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums}.memory{width:94px;text-align:right;flex-shrink:0}

  .shape-bank{display:flex;flex-wrap:nowrap;overflow-x:auto;min-width:0;height:48px;gap:3px;padding:2px 0;background:#0e1012}.shape-bank button{width:64px;flex-shrink:0;padding:2px;color:#76958f}.shape-bank button:hover{color:var(--timing-accent);background:#1b2826}.shape-bank svg{display:block;width:100%;height:22px}.shape-bank span{font:6px var(--font-mono)}
  .capacity-notice{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px;color:#e49879;background:#281c16;border-bottom:1px solid #673c30;font:8px var(--font-mono)}
  .timing-panel{flex-shrink:0;background:#131416;border:1px solid #1e2226;border-top:2px solid #0d0e0f;font-family:var(--font-ui);color:#6a7a8a;margin-top:8px;min-width:0}header{display:flex;align-items:center;gap:12px;height:30px;padding:0 8px;background:linear-gradient(#1b1e21,#141618);font-size:8px;letter-spacing:.08em}.timing-collapse{padding:0;color:#6a7a8a;background:transparent;border:0;border-radius:0}.timing-collapse:hover,.timing-collapse:focus-visible{color:#c4f4e8;outline:none}.scope{font-size:7px;border:1px solid #1e2226;padding:2px 5px;color:#556070}.clip{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.live{font-family:monospace;color:#6a7a8a}.memory{font:7px monospace;color:#4a5260}.editor-controls{display:flex;align-items:center;gap:12px;padding:7px 8px;border-bottom:1px solid #1e2226;flex-wrap:wrap}.tabs{display:flex;gap:3px}.tabs .active{color:var(--timing-accent);border-color:color-mix(in srgb,var(--timing-accent) 33%,transparent);background:linear-gradient(#1c3022,#141e18)}button,select,input{font:8px var(--font-ui);color:#556070;background:linear-gradient(#1a1c1f,#131517);border:1px solid #1e2226;border-radius:2px;padding:3px 6px;letter-spacing:.06em}button,select{cursor:pointer}select option{background:#131719;color:#6a7a8a}label{display:flex;align-items:center;gap:6px;font-size:7px;letter-spacing:.08em}input{width:45px}
</style>
