<script lang="ts">
  import { selectedTimingSlot, timingSettings, timingStatus, timingCacheCapacity, timingSceneErrors, TIMING_BUDGET_OPTIONS } from '$lib/stores/timing';
  import { videoLayers } from '$lib/stores/rack';
  import { timingRuntime } from '$lib/runtime/timing/TimingRuntime';
  import TimingFooterMenu from './TimingFooterMenu.svelte';
  const status = $derived($timingStatus[$selectedTimingSlot]);
  const sceneError=$derived(Object.entries($timingSceneErrors)[0]);
</script>
<footer class="timing-footer" aria-label="Timing output settings">
  <span title={sceneError?`${sceneError[0]}: ${sceneError[1]}`:undefined}>{sceneError?'SECTION CLIP PREPARATION FAILED':$timingCacheCapacity.pending>0?`PREPARING ${$timingCacheCapacity.pending} CLIP BANKS…`:status?.state === 'ready' ? `${status.frames} RESIDENT FRAMES · ${status.fps?.toFixed(1)} FPS SOURCE` : $videoLayers[$selectedTimingSlot] ? 'PREPARING CLIP…' : 'LOAD CLIPS FROM THE TOP BAR OR CLIPS BROWSER'}</span>
  {#if sceneError}<button onclick={()=>void timingRuntime.retryScenes()} title="Retry failed preparation for clips in other sections, including failed GPU jobs.">RETRY SECTION CLIPS</button>{/if}
  <TimingFooterMenu label="OUTPUT" value={$timingSettings.outputFps} options={[24,30,60].map(fps => ({value:fps,label:`${fps} FPS`}))} onchange={value => timingSettings.update(s => ({ ...s, outputFps: Number(value) }))} />
  <TimingFooterMenu label="PRELOAD" value={$timingSettings.preloadHeight} options={[{value:0,label:'NATIVE'},{value:720,label:'720p'},{value:540,label:'540p'},{value:360,label:'360p'},{value:270,label:'270p'}]} onchange={value => timingSettings.update(s => ({ ...s, preloadHeight: Number(value) }))} />
  <button title="540p frame bank, 8 GiB cap, 24 FPS output." onclick={() => timingSettings.update(s => ({ ...s, preloadHeight: 540, budgetGiB: 8, outputFps: 24 }))}>LAPTOP · 540p</button>
  <TimingFooterMenu label="CAPACITY" value={$timingSettings.budgetGiB} options={TIMING_BUDGET_OPTIONS.map(gb => ({value:gb,label:`${gb} GiB`}))} onchange={value => timingSettings.update(s => ({ ...s, budgetGiB: Number(value) }))} />
</footer>
<style>
  .timing-footer { display:flex; align-items:center; gap:10px; min-height:28px; padding:4px 8px; border-top:1px solid #1e2226; background:#131416; font:7px var(--font-mono); color:#6a7a8a; flex-wrap:wrap; }
  .timing-footer > span:first-child { flex:1; min-width:160px; }
  .timing-footer button { font:8px var(--font-ui); color:#7faaa3; background:linear-gradient(#1a1c1f,#131517); border:1px solid #1e2226; border-radius:2px; padding:3px 6px; letter-spacing:.06em; }
</style>
