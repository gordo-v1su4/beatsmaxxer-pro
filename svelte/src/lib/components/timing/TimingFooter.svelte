<script lang="ts">
  import { selectedTimingSlot, timingSettings, timingStatus, timingCacheCapacity, timingSceneErrors, TIMING_BUDGET_OPTIONS } from '$lib/stores/timing';
  import { videoLayers } from '$lib/stores/rack';
  import { timingRuntime } from '$lib/runtime/timing/TimingRuntime';
  import TimingFooterMenu from './TimingFooterMenu.svelte';
  import { playbackWorkspace } from '$lib/stores/rackUi';
  import { performSamplerStatus,performTimeSamplerFrames } from '$lib/runtime/PerformTimeSamplerFrames';
  const timing = $derived($playbackWorkspace === 'timing');
  const status = $derived($timingStatus[$selectedTimingSlot]);
  const sceneError=$derived(Object.entries($timingSceneErrors)[0]);
</script>
<footer class="timing-footer" aria-label={timing ? 'Timing output settings' : 'Perform playback and Timing preload settings'}>
  <span title={timing && sceneError?`${sceneError[0]}: ${sceneError[1]}`:undefined}>
    {#if !timing}
      {#if $performSamplerStatus.error}SAMPLER CACHE: {$performSamplerStatus.error}
      {:else if $performSamplerStatus.pending}PREPARING {$performSamplerStatus.pending} SAMPLER BANKS…
      {:else if $performSamplerStatus.usedBytes}PERFORM · GPU SAMPLER READY
      {:else}{Object.values($videoLayers).some(Boolean) ? 'PERFORM · VIDEO PLAYBACK' : 'LOAD CLIPS FROM THE TOP BAR OR CLIPS BROWSER'}{/if}
    {:else if sceneError}SECTION CLIP PREPARATION FAILED
    {:else if $timingCacheCapacity.pending>0}PREPARING {$timingCacheCapacity.pending} CLIP BANKS…
    {:else if status?.state === 'ready'}
      {(status.bytes ?? 0)>0 ? `${status.frames} RESIDENT FRAMES` : 'STREAMING ORIGINAL'} · {status.fps?.toFixed(1)} FPS SOURCE
    {:else}{$videoLayers[$selectedTimingSlot] ? 'PREPARING CLIP…' : 'LOAD CLIPS FROM THE TOP BAR OR CLIPS BROWSER'}{/if}
  </span>
  {#if timing && sceneError}<button onclick={()=>void timingRuntime.retryScenes()} title="Retry failed preparation for clips in other sections, including failed GPU jobs.">RETRY SECTION CLIPS</button>{/if}
  {#if !timing && $performSamplerStatus.error}<button onclick={()=>performTimeSamplerFrames.retryFailed()} title="Reload failed GPU sampler banks while keeping ready banks.">RETRY SAMPLER CACHE</button>{/if}
  <TimingFooterMenu label={timing ? 'OUTPUT' : 'TIMING OUTPUT'} value={$timingSettings.outputFps} options={[24,30,60].map(fps => ({value:fps,label:`${fps} FPS`}))} onchange={value => timingSettings.update(s => ({ ...s, outputFps: Number(value) }))} />
  <TimingFooterMenu label={timing ? 'PRELOAD' : 'SAMPLER PRELOAD'} value={$timingSettings.preloadHeight} options={[{value:0,label:'NATIVE'},{value:720,label:'720p'},{value:540,label:'540p'},{value:360,label:'360p'},{value:270,label:'270p'}]} onchange={value => timingSettings.update(s => ({ ...s, preloadHeight: Number(value) }))} />
  <button title="GPU preload preset: 540p frame banks, shared 8 GiB cap, 24 FPS Timing output." onclick={() => timingSettings.update(s => ({ ...s, preloadHeight: 540, budgetGiB: 8, outputFps: 24 }))}>LAPTOP · 540p</button>
  <TimingFooterMenu label="GPU CAPACITY" value={$timingSettings.budgetGiB} options={TIMING_BUDGET_OPTIONS.map(gb => ({value:gb,label:`${gb} GiB`}))} onchange={value => timingSettings.update(s => ({ ...s, budgetGiB: Number(value) }))} />
</footer>
<style>
  .timing-footer { display:flex; align-items:center; gap:10px; min-height:28px; padding:4px 8px; border-top:1px solid #1e2226; background:#131416; font:7px var(--font-mono); color:#6a7a8a; flex-wrap:wrap; }
  .timing-footer > span:first-child { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .timing-footer button { font:8px var(--font-ui); color:#7faaa3; background:linear-gradient(#1a1c1f,#131517); border:1px solid #1e2226; border-radius:2px; padding:3px 6px; letter-spacing:.06em; }
</style>
