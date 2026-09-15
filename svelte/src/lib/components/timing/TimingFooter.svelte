<script lang="ts">
  import { selectedTimingSlot, timingSettings, timingStatus, TIMING_BUDGET_OPTIONS } from '$lib/stores/timing';
  import { videoLayers } from '$lib/stores/rack';
  const status = $derived($timingStatus[$selectedTimingSlot]);
</script>
<footer class="timing-footer" aria-label="Timing output settings">
  <span>{status?.state === 'ready' ? `${status.frames} RESIDENT FRAMES · ${status.fps?.toFixed(1)} FPS SOURCE` : $videoLayers[$selectedTimingSlot] ? 'PREPARING CLIP…' : 'LOAD CLIPS FROM THE TOP BAR OR CLIPS BROWSER'}</span>
  <label>OUTPUT <select aria-label="Timing output frame rate" value={$timingSettings.outputFps} onchange={(e) => timingSettings.update(s => ({ ...s, outputFps: Number(e.currentTarget.value) }))}>{#each [24, 30, 60] as fps}<option value={fps}>{fps} FPS</option>{/each}</select></label>
  <label>PRELOAD <select aria-label="Timing preload resolution" value={$timingSettings.preloadHeight} onchange={e => timingSettings.update(s => ({ ...s, preloadHeight: Number(e.currentTarget.value) }))}><option value="0">NATIVE</option><option value="720">720p</option><option value="540">540p</option><option value="360">360p</option></select></label>
  <button title="540p frame bank, 8 GiB cap, 60 FPS output." onclick={() => timingSettings.update(s => ({ ...s, preloadHeight: 540, budgetGiB: 8, outputFps: 60 }))}>LAPTOP · 540p</button>
  <label>CAPACITY <select aria-label="Resident frame memory budget" value={$timingSettings.budgetGiB} onchange={e => timingSettings.update(s => ({ ...s, budgetGiB: Number(e.currentTarget.value) }))}>{#each TIMING_BUDGET_OPTIONS as gb}<option value={gb}>{gb} GiB</option>{/each}</select></label>
</footer>
<style>
  .timing-footer { display:flex; align-items:center; gap:10px; min-height:28px; padding:4px 8px; border-top:1px solid #1e2226; background:#131416; font:7px var(--font-mono); color:#6a7a8a; flex-wrap:wrap; }
  .timing-footer > span:first-child { flex:1; min-width:160px; }
  .timing-footer label { display:flex; align-items:center; gap:6px; font-size:7px; letter-spacing:.08em; }
  .timing-footer select, .timing-footer button { font:8px var(--font-ui); color:#7faaa3; background-color:#131719; background-image:linear-gradient(45deg,transparent 50%,#6a8a84 50%),linear-gradient(135deg,#6a8a84 50%,transparent 50%),linear-gradient(#1a1c1f,#131517); background-position:calc(100% - 9px) 50%,calc(100% - 5px) 50%,0 0; background-size:4px 4px,4px 4px,100% 100%; background-repeat:no-repeat; border:1px solid #283437; border-radius:2px; padding:3px 18px 3px 6px; letter-spacing:.06em; color-scheme:dark; appearance:none; }
  .timing-footer button { padding-right:6px; background-image:linear-gradient(#1a1c1f,#131517); }
  .timing-footer select:focus-visible { outline:1px solid #35e08a88; outline-offset:1px; }
</style>
