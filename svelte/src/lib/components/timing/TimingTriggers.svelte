<script lang="ts">
  import { requireHostedAccess, openProtectedFilePicker } from '$lib/access/accessGate';
  import { timingSettings, selectedTimingSlot, effectiveTimingTrigger, setTimingTrigger } from '$lib/stores/timing';
  import { timingInput, timingSignalGrid, resolveTimingSignal, importTimingFiles, loadRedlineTimingReference } from '$lib/stores/timingSignals';
  import { midiChannels } from '$lib/stores/midiChannels';
  import { analysisOnsets } from '$lib/stores/triggerLane';
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import { TRIGGER_SOURCES, type TimingTriggerConfig, type TimingTriggerSource } from '$lib/runtime/timing/triggers';
  import HSlider from '$lib/components/rack/HSlider.svelte';
  import { timingEffectAccent } from './presentation';
  import { openWorkflowHelp } from '$lib/stores/workflowHelp';
  let files:HTMLInputElement;
  let busy=$state(false),message=$state('');
  const trigger=$derived(effectiveTimingTrigger($timingSettings,$selectedTimingSlot));
  const sourceHelp:Record<TimingTriggerSource,string>={
    pgm:'Start this deck’s effect when it takes the program output. The upper PGM controls choose when clips switch.',
    beat:'Start effects at regular beat or bar intervals from the song’s beat grid.',
    midi:'Use note starts from the selected MIDI channel. Note velocity and available stem loudness shape By Energy repeats.',
    'mix-onsets':'Mix means the whole song. An onset is the start of a sound, such as a drum hit or vocal syllable. Use those detected attacks as triggers.',
    'vocals-onsets':'Use detected attacks in the isolated vocal audio stem. These come from audio analysis, not vocal MIDI notes.',
    'stem-onsets':'Use detected attacks from individual audio stems. Choose a stem in Channel.',
    'vocals-activity':'Start an effect when the analyzed vocal becomes active after a quieter gap. This follows phrase entrances rather than every note.',
    'mix-loudness':'Mix means the whole song. Trigger on its loud peaks, including sustained loud moments, rather than just the start of a sound.',
    continuous:'Keep the effect cycling on the beat grid without waiting for a note or onset. Density, trigger chance and gaps do not apply.'
  };
  const channelHelp=$derived(trigger.channel==='all'
    ? 'Assign one available channel to each deck in order, repeating across S0–S9. Each deck keeps its channel; channels do not rotate over time.'
    : `Use only ${trigger.channel} ${trigger.source==='midi'?'MIDI note':'audio analysis'} triggers. Global applies this channel to every deck; Modular applies it to the selected deck.`);
  const songDuration=$derived($transportDisplay.duration);
  // Resolve the editor's own trigger, including per-deck overrides. The
  // renderer's global signal status may describe a different source.
  const signal=$derived.by(()=>{
    $timingInput; $midiChannels; $analysisOnsets;
    return resolveTimingSignal(trigger,$timingSignalGrid.bpm,Math.max(1,songDuration));
  });
  function change(patch:Partial<TimingTriggerConfig>){setTimingTrigger(patch);}
  async function load(action:()=>Promise<void>){busy=true;message='LOADING TIMING DATA…';try{await action();message='TIMING DATA LOADED';}catch(e){message=e instanceof Error?e.message:String(e);}finally{busy=false;}}
  const value=(e:Event,min:number,max:number)=>Math.max(min,Math.min(max,Number((e.currentTarget as HTMLInputElement).value)||0));
</script>
<div class="trigger-controls" aria-label="Shared Timing triggers">
  <span class="scope">{$timingSettings.scope==='global'?'ALL SLOTS':$selectedTimingSlot.toUpperCase()} · EFFECT TRIGGERS</span>
  <button type="button" aria-label="Explain Timing controls" title="Show the trigger flow and explain beats, bars, density and repeats" onclick={() => openWorkflowHelp('timing')}>?</button>
  <span id="timing-source-help" hidden>{sourceHelp[trigger.source]}</span>
  <span id="timing-channel-help" hidden>{channelHelp}</span>
  <label title={sourceHelp[trigger.source]}>SOURCE <select aria-label="Timing trigger source" aria-describedby="timing-source-help" title={sourceHelp[trigger.source]} value={trigger.source} onchange={e=>change({source:e.currentTarget.value as TimingTriggerSource,channel:'all'})}>
    {#each TRIGGER_SOURCES as [id,label] (id)}<option value={id} title={sourceHelp[id]}>{label}</option>{/each}
  </select></label>
  {#if !['pgm','beat','continuous'].includes(trigger.source)}
    <label title={channelHelp}>CHANNEL <select aria-label="Timing trigger channel" aria-describedby="timing-channel-help" title={channelHelp} value={trigger.channel} onchange={e=>change({channel:e.currentTarget.value})}>
      <option value="all" title="Distribute the available channels across decks; each deck keeps its assigned channel.">CHANNELS BY DECK</option>
      {#each signal.channels as channel (channel.name)}<option value={channel.name}>{channel.name.toUpperCase()}</option>{/each}
    </select></label>
    <label title="Ignore triggers weaker than this level. 0 admits every positive-strength event; 1 admits only the strongest. Density still filters the eligible events.">THRESHOLD <input aria-label="Timing trigger threshold" type="number" min="0" max="1" step=".05" value={trigger.threshold} onchange={e=>change({threshold:value(e,0,1)})}/></label>
  {:else if trigger.source==='beat'}
    <label>EVERY <select aria-label="Timing trigger interval" value={trigger.everyBeats} onchange={e=>change({everyBeats:Number(e.currentTarget.value)})}>
      {#each [.25,.5,1,2,4,8,12,16,32,64] as b (b)}<option value={b}>{b<4?`${b} BEATS`:`${b/4} BARS`}</option>{/each}
    </select></label>
  {/if}
  {#if trigger.source!=='continuous'}
    <div class="chance" title="Percent of eligible events that start a ramp; triggers inside an active burst or its gap are ignored first."><span>RAMP CHANCE <b>{Math.round(trigger.rampChance)}%</b></span><HSlider value={trigger.rampChance} color={timingEffectAccent('ramp')} ariaLabel="Ramp trigger chance" controlId="timing-ramp-chance" compact onChange={v=>change({rampChance:Math.round(v)})}/></div>
    <div class="chance" title="Keep the strongest share of events in each channel. 40% keeps its loudest 40%; lower density also leaves more normal playback between effects."><span>DENSITY <b>{Math.round(trigger.density??100)}%</b></span><HSlider value={trigger.density??100} color={timingEffectAccent('stutter')} ariaLabel="Timing trigger density" controlId="timing-density" compact onChange={v=>change({density:Math.max(10,Math.round(v))})}/></div>
    <label title="Applies to Stutter decks. Fixed uses the Stutter repeat count; By Energy chooses the burst from trigger strength. Speedramp always runs one complete curve per accepted trigger.">STUTTER REPEATS <select aria-label="Timing repeat style" value={trigger.repeatStyle??'energy'} onchange={e=>change({repeatStyle:e.currentTarget.value as 'fixed'|'energy'})}><option value="fixed">FIXED</option><option value="energy">BY ENERGY</option></select></label>
    <label title="Minimum normal-playback time after a completed effect, plus Density's extra spacing. At 120 BPM, 65% Density adds 350 ms. Intervening triggers are ignored.">GAP ms <input aria-label="Timing minimum gap milliseconds" type="number" min="0" max="30000" step="20" value={Math.round(trigger.gapSeconds*1000)} onchange={e=>change({gapSeconds:value(e,0,30000)/1000})}/></label>
    <label title="Repeatable choices, with a separate sequence for each slot.">SEED <input aria-label="Timing trigger seed" type="number" min="0" max="4294967295" value={trigger.seed} onchange={e=>change({seed:Math.round(value(e,0,4294967295))})}/></label>
  {/if}
  <button disabled={busy} onclick={()=>openProtectedFilePicker(files)}>IMPORT MIDI / DATA</button>
  <input class="file" bind:this={files} type="file" multiple accept=".mid,.midi,.json,.mp3,.wav,.m4a,.ogg,.flac" aria-label="Import Timing MIDI or analysis and matching song" onchange={async e=>{const chosen=Array.from(e.currentTarget.files??[]);e.currentTarget.value='';if(chosen.length && await requireHostedAccess())void load(()=>importTimingFiles(chosen));}}/>
  {#if import.meta.env.DEV}<button disabled={busy} title="Load the saved matching song, MIDI and stem analysis from ZigSwap; preserve your Timing parameters." onclick={()=>load(async()=>{await loadRedlineTimingReference();timingSettings.update(s=>({...s,trigger:{...s.trigger,source:'midi',channel:s.trigger.source==='midi'?s.trigger.channel:'all'}}));})}>LOAD REDLINE SONG + TRIGGERS</button>{/if}
  <div class="signal" role="status">{signal.missing??signal.label} {message?` · ${message}`:''}</div>
</div>
<style>
  .chance{width:120px;flex-shrink:0}.chance>span{display:flex;justify-content:space-between;font:7px var(--font-ui);color:#87949e}.chance b{font-weight:400;color:#9eacb3}
  .trigger-controls{display:flex;flex-wrap:wrap;align-items:center;gap:9px;padding:8px;border-bottom:1px solid #252a2e;background:#111315;color:#6a7a8a;font:7px var(--font-ui);letter-spacing:.05em}.scope{color:#87949e;font-size:7px}.signal{flex-basis:100%;font:7px var(--font-mono);color:#6a7a8a}label{display:flex;gap:5px;align-items:center}button,input,select{font:8px var(--font-ui);background:linear-gradient(#1a1c1f,#131517);border:1px solid #252a2e;border-radius:2px;color:#7f8d97;padding:3px 5px}input{width:45px}select{max-width:220px}select option{background:#131719}button,select{cursor:pointer}.file{display:none}
</style>
