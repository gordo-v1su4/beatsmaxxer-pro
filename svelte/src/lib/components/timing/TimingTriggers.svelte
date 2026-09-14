<script lang="ts">
  import { timingSettings } from '$lib/stores/timing';
  import { timingSignalStatus, importTimingFiles, loadRedlineTimingReference } from '$lib/stores/timingSignals';
  import { TRIGGER_SOURCES, type TimingTriggerConfig, type TimingTriggerSource } from '$lib/runtime/timing/triggers';
  import HSlider from '$lib/components/rack/HSlider.svelte';
  import { timingEffectAccent } from './presentation';
  let files:HTMLInputElement;
  let busy=$state(false),message=$state('');
  const trigger=$derived($timingSettings.trigger);
  function change(patch:Partial<TimingTriggerConfig>){timingSettings.update(s=>({...s,trigger:{...s.trigger,...patch}}));}
  async function load(action:()=>Promise<void>){busy=true;message='LOADING TIMING DATA…';try{await action();message='TIMING DATA LOADED';}catch(e){message=e instanceof Error?e.message:String(e);}finally{busy=false;}}
  const value=(e:Event,min:number,max:number)=>Math.max(min,Math.min(max,Number((e.currentTarget as HTMLInputElement).value)||0));
</script>
<div class="trigger-controls" aria-label="Shared Timing triggers">
  <span class="scope">ALL SLOTS · EFFECT TRIGGERS</span>
  <label>SOURCE <select aria-label="Timing trigger source" value={trigger.source} onchange={e=>change({source:e.currentTarget.value as TimingTriggerSource,channel:'all'})}>
    {#each TRIGGER_SOURCES as [id,label]}<option value={id}>{label}</option>{/each}
  </select></label>
  {#if !['beat','continuous'].includes(trigger.source)}
    <label>CHANNEL <select aria-label="Timing trigger channel" value={trigger.channel} onchange={e=>change({channel:e.currentTarget.value})}>
      <option value="all">ROTATE BY SLOT</option>
      {#each $timingSignalStatus.channels as name}<option value={name}>{name.toUpperCase()}</option>{/each}
    </select></label>
    <label title="Minimum normalized onset strength or MIDI velocity; RMS is relative amplitude, not LUFS.">THRESHOLD <input aria-label="Timing trigger threshold" type="number" min="0" max="1" step=".05" value={trigger.threshold} onchange={e=>change({threshold:value(e,0,1)})}/></label>
  {:else if trigger.source==='beat'}
    <label>EVERY <select aria-label="Timing trigger interval" value={trigger.everyBeats} onchange={e=>change({everyBeats:Number(e.currentTarget.value)})}>
      {#each [.25,.5,1,2,4,8,12,16,32,64] as b}<option value={b}>{b<4?`${b} BEATS`:`${b/4} BARS`}</option>{/each}
    </select></label>
  {/if}
  {#if trigger.source!=='continuous'}
    <div class="chance" title="Percent of eligible events that start a ramp; triggers inside an active burst or its gap are ignored first."><span>RAMP CHANCE <b>{Math.round(trigger.rampChance)}%</b></span><HSlider value={trigger.rampChance} color={timingEffectAccent('ramp')} ariaLabel="Ramp trigger chance" controlId="timing-ramp-chance" compact onChange={v=>change({rampChance:Math.round(v)})}/></div>
    <div class="chance" title="50% gives each eligible trigger a one-in-two chance of starting a burst; it is not a speed or wet/dry amount."><span>STUTTER CHANCE <b>{Math.round(trigger.stutterChance)}%</b></span><HSlider value={trigger.stutterChance} color={timingEffectAccent('stutter')} ariaLabel="Stutter trigger chance" controlId="timing-stutter-chance" compact onChange={v=>change({stutterChance:Math.round(v)})}/></div>
    <label title="Minimum normal-playback time after a completed effect; intervening triggers are ignored.">GAP ms <input aria-label="Timing minimum gap milliseconds" type="number" min="0" max="30000" step="20" value={Math.round(trigger.gapSeconds*1000)} onchange={e=>change({gapSeconds:value(e,0,30000)/1000})}/></label>
    <label title="Repeatable choices, with a separate sequence for each slot.">SEED <input aria-label="Timing trigger seed" type="number" min="0" max="4294967295" value={trigger.seed} onchange={e=>change({seed:Math.round(value(e,0,4294967295))})}/></label>
  {/if}
  <button disabled={busy} onclick={()=>files.click()}>IMPORT MIDI / DATA</button>
  <input class="file" bind:this={files} type="file" multiple accept=".mid,.midi,.json,.mp3,.wav,.m4a,.ogg,.flac" aria-label="Import Timing MIDI or analysis and matching song" onchange={e=>{const chosen=Array.from(e.currentTarget.files??[]);if(chosen.length)void load(()=>importTimingFiles(chosen));e.currentTarget.value='';}}/>
  {#if import.meta.env.DEV}<button disabled={busy} title="Load the saved matching song, MIDI and stem analysis from ZigSwap; no benchmark or analysis is rerun." onclick={()=>load(async()=>{await loadRedlineTimingReference();timingSettings.update(s=>({...s,outputFps:60,trigger:{...s.trigger,source:'midi',channel:'all',rampChance:40,stutterChance:100,threshold:0,gapSeconds:.12}}));})}>LOAD REDLINE SONG + TRIGGERS</button>{/if}
  <div class="signal" role="status">{$timingSignalStatus.missing??$timingSignalStatus.label} {message?` · ${message}`:''}</div>
</div>
<style>
  .chance{width:120px;flex-shrink:0}.chance>span{display:flex;justify-content:space-between;font:7px var(--font-ui);color:#87949e}.chance b{font-weight:400;color:#9eacb3}
  .trigger-controls{display:flex;flex-wrap:wrap;align-items:center;gap:9px;padding:8px;border-bottom:1px solid #252a2e;background:#111315;color:#6a7a8a;font:7px var(--font-ui);letter-spacing:.05em}.scope{color:#87949e;font-size:7px}.signal{flex-basis:100%;font:7px var(--font-mono);color:#6a7a8a}label{display:flex;gap:5px;align-items:center}button,input,select{font:8px var(--font-ui);background:linear-gradient(#1a1c1f,#131517);border:1px solid #252a2e;border-radius:2px;color:#7f8d97;padding:3px 5px}input{width:45px}select{max-width:220px}select option{background:#131719}button,select{cursor:pointer}.file{display:none}
</style>
