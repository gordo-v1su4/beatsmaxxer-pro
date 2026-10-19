<script lang="ts">
  import OnAirBadge from '../rack/OnAirBadge.svelte';
  import WebGpuCanvas from '$lib/components/WebGpuCanvas.svelte';
  import MediaPatchBay from '$lib/components/rack/MediaPatchBay.svelte';
  import HeaderBtn from '$lib/components/rack/HeaderBtn.svelte';
  import ModuleGrip from '$lib/components/rack/ModuleGrip.svelte';
  import { toggleTimingBypass } from '$lib/stores/timing';
  import Screw from '$lib/components/rack/Screw.svelte';
  import ScreenBadge from '$lib/components/rack/ScreenBadge.svelte';
  import RampReadiness from './RampReadiness.svelte';
  import { videoLayers } from '$lib/stores/rack';
  import { effectiveClipTiming, selectedTimingSlot, timingSettings, timingStatus, timingClipRestrictions } from '$lib/stores/timing';
  import { defaultClipTiming } from '$lib/runtime/timing/envelope';
  import { timingEffectAccent } from './presentation';
  import { parseAccentColor } from '$lib/modules/registry';
  import { selectRackSource } from '$lib/runtime/pgm/selection';
  import { slotPreparation, retrySlotPreparation } from '$lib/runtime/timing/preparation';
  let { slot, moduleId, onAir = false, onVideoUpload, onVideosUpload, onClearVideo }: { slot: string; moduleId: string; onAir?: boolean; onVideoUpload?: (file:File)=>void; onVideosUpload?: (files:File[])=>void; onClearVideo?: ()=>void } = $props();
  const config = $derived(effectiveClipTiming($timingSettings,slot));
  const status = $derived($timingStatus[slot]);
  const number = $derived(Number(slot.split('-')[1]) + (slot.startsWith('bottom') ? 5 : 0));
  const color = $derived(timingEffectAccent(config.effect));
  const selected = $derived($selectedTimingSlot === slot);
  const preparation=$derived($slotPreparation[slot]);
  async function retry(){if(!preparation)return;try{await retrySlotPreparation(slot,preparation);}catch(error){slotPreparation.update(s=>({...s,[slot]:{...preparation,error:String(error)}}));}}
  function select() { selectRackSource(moduleId); }
</script>

<div class="timing-card" class:is-on-air={onAir} style:--timing-accent={color} data-timing-slot={slot}>
  <div class="timing-card-header module-live-header" data-on-air={onAir} class:is-selected={onAir} style:--module-accent={color}>
    <ModuleGrip onHeaderPointerDown={select} title="Open timing controls"/>
    <button class="module-title" onclick={select} aria-label="Edit timing for source {number}" aria-pressed={$selectedTimingSlot===slot}><small>S{number}</small> {config.effect==='ramp'?'SPEEDRAMP':config.effect==='stutter'?'STUTTER':config.effect==='timesampler'?'TIMESAMPLER':'TIMING OFF'}</button>
    <RampReadiness {status}/>
    {#if onAir}<OnAirBadge />{/if}
    <button class="caret" onclick={select} aria-label="Open source {number} timing controls"><svg width="7" height="4" viewBox="0 0 7 4"><path d="M0 4 L3.5 0 L7 4" fill="none" stroke={color} stroke-width="1.2"/></svg></button>
    <HeaderBtn label="B" active={config.effect==='off'} activeColor="#ef4444" onclick={()=>toggleTimingBypass(slot)}/>
    <Screw/>
  </div>
  <MediaPatchBay {color} moduleId={slot} videoLayer={$videoLayers[slot]??null} clipStatus={status?.state==='ready'?'ready':status?.state==='error'?'error':$videoLayers[slot]?'loading':'idle'} clipError={status?.message} onSetVideo={(file)=>{if(file)onVideoUpload?.(file);else onClearVideo?.();}} onSetVideos={onVideosUpload}/>
  <div class="timing-preview">
    {#if $timingClipRestrictions[slot]}<div class="clip-restriction" role="alert">{$timingClipRestrictions[slot]}</div>{/if}
    <WebGpuCanvas id={slot} {moduleId} color={parseAccentColor(color)} class="absolute inset-0 w-full h-full" />
    {#if preparation}
      <div class="clip-preparation worker-preparation" role="status">
        {#if preparation.state==='working'}<span class="preparation-spinner" aria-hidden="true"></span>{/if}
        <span>{preparation.state==='failed'?'PROCESSING FAILED':preparation.stage.replaceAll('-',' ').toUpperCase()}</span>
        {#if preparation.state==='failed'}<small>{preparation.error}</small><button onclick={retry}>RETRY GPU PROCESSING</button>
        {:else if preparation.total>0}<progress value={preparation.completed} max={preparation.total} aria-label="GPU preparation progress"></progress><small>{preparation.completed} / {preparation.total}</small>{/if}
      </div>
    {:else if (config.effect==='ramp'||config.effect==='timesampler') && $videoLayers[slot] && status?.state!=='ready' && status?.state!=='error' && !$timingClipRestrictions[slot]}
      <div class="clip-preparation" aria-label={`Preparing source ${number} frames`}>
        <span class="preparation-spinner" aria-hidden="true"></span>
        <span role="status">{status?.state==='loading'?(config.effect==='ramp'?'LOADING 96 FPS FRAMES':'LOADING ORIGINAL FRAMES'):'WAITING FOR LOCAL FRAME CACHE'}</span>
        <small>{config.effect==='ramp'?'Prepared Speedramp source → browser GPU':'Original frames → browser GPU · no interpolation'}</small>
        {#if status?.total>0}
          <progress value={status.frames} max={status.total} aria-label={`Source ${number} preparation progress`}></progress>
          <small>{Math.min(100,Math.round(status.frames/status.total*100))}% · {status.frames} / {status.total} FRAMES</small>
        {/if}
      </div>
    {/if}
    <button class="preview-select" onclick={select} aria-label="Select source {number} preview" aria-pressed={selected}></button>
    <div class="preview-badge">
      <ScreenBadge color={status?.state === 'error' ? '#e49879' : color} text={!$videoLayers[slot] ? 'LOAD A CLIP' : status?.state === 'ready' ? `${status.fps?.toFixed(0)} FPS SOURCE · ${$timingSettings.outputFps} FPS OUT` : status?.state === 'loading' ? `LOADING ${status.frames} / ${status.total}` : status?.state === 'error' ? status.requiredBytes ? 'CAPACITY LIMIT · SEE TIMING PANEL' : 'LOAD FAILED · SELECT TO REVIEW' : 'QUEUED'}/>
    </div>
  </div>
</div>

<style>
  .clip-preparation.worker-preparation{z-index:4;pointer-events:auto;padding:10px;text-align:center}.worker-preparation button{background:#253331;color:#a6c9bf;border:0;padding:7px;font:8px var(--font-ui)}
  .clip-preparation progress{appearance:none;-webkit-appearance:none;border:0;outline:0;border-radius:0;background:#17332f;overflow:hidden}
  .clip-preparation progress::-webkit-progress-bar{background:#17332f;border:0;border-radius:0}
  .clip-preparation progress::-webkit-progress-value{background:#14b8a6;border:0;border-radius:0}
  .clip-preparation progress::-moz-progress-bar{background:#14b8a6;border:0;border-radius:0}
  .clip-preparation{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:#0b0e11c9;color:#b5c8cc;font:9px var(--font-ui);letter-spacing:.09em;pointer-events:none}.clip-preparation small{font:8px var(--font-mono);color:#8b9ba4}.clip-preparation progress{width:45%;height:3px;accent-color:#14b8a6}.preparation-spinner{width:14px;height:14px;border:1px solid #46565d;border-top-color:#14b8a6;border-radius:50%;animation:preparation-spin 1s linear infinite}@keyframes preparation-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.preparation-spinner{animation:none}}
  .timing-card.is-on-air{box-shadow:inset 0 0 0 1px var(--timing-accent)}
  .clip-restriction{position:absolute;inset:0;z-index:2;display:grid;place-content:center;padding:10px;background:#101214e8;color:#e4bca3;font:10px/1.5 var(--font-ui);pointer-events:none}
  .timing-card-header.is-selected{background:linear-gradient(180deg,color-mix(in srgb,var(--timing-accent) 16%,#1e2124),color-mix(in srgb,var(--timing-accent) 8%,#141618))}
  .timing-card{background:#131416;border-right:1px solid #0d0e0f;position:relative;min-width:0}
  .module-title{font-family:var(--font-ui);font-size:10px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--timing-accent);flex:1;min-width:0;margin-left:3px;background:none;border:0;text-align:left;padding:0;cursor:pointer}.module-title small{font:7px monospace;color:#4a5260}.caret{width:14px;height:14px;border:1px solid #1e2226;border-radius:2px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:linear-gradient(180deg,#1c1e22,#141618);padding:0}.timing-card-header{display:flex;align-items:center;gap:3px;height:26px;width:100%;padding:0 5px;color:var(--timing-accent);font-family:var(--font-ui);font-size:9px;letter-spacing:.1em;text-align:left;cursor:pointer}
  .timing-preview{position:relative;width:100%;aspect-ratio:16/9;background:#090b0c}.preview-select{position:absolute;inset:0;background:transparent;border:0;cursor:pointer}.preview-select:focus-visible{outline:1px solid var(--timing-accent);outline-offset:-2px}.preview-badge{pointer-events:none}
</style>
