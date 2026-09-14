<script lang="ts">
  import { selectedTimingSlot, timingSettings, timingEditorCollapsed, setClipTiming } from '$lib/stores/timing';
  import { defaultClipTiming } from '$lib/runtime/timing/envelope';
  import { timingEffectAccent } from './presentation';
  const config=$derived($timingSettings.clips[$selectedTimingSlot]??defaultClipTiming($selectedTimingSlot));
  function choose(effect:'ramp'|'stutter') {setClipTiming($selectedTimingSlot,{...config,effect});timingEditorCollapsed.set(false);}
</script>
<div class="timing-palette">
  <span class="label">TIMING FX</span>
  <button style:--timing-accent={timingEffectAccent('ramp')} class:active={config.effect==='ramp'} onclick={()=>choose('ramp')}><b>RAMP</b><span>Editable playback-speed curve</span></button>
  <button style:--timing-accent={timingEffectAccent('stutter')} class:active={config.effect==='stutter'} onclick={()=>choose('stutter')}><b>STUTTER</b><span>Repeat, hold and jump cuts</span></button>
  <p>Choose a clip to edit its timing below.</p>
</div>
<style>
  .timing-palette{padding:12px 6px;font-family:var(--font-ui)}.label{color:#3f4653;font-size:7px;letter-spacing:.12em}button{display:flex;flex-direction:column;gap:5px;width:100%;text-align:left;background:#131416;border:0;border-left:2px solid #252a30;padding:8px 5px;margin-top:5px;cursor:pointer}b{color:#6a7a8a;font-size:9px;font-weight:500}button span,p{font-size:6.5px;color:#4a5260}.active{border-left-color:var(--timing-accent);background:#1a1c1f}.active b{color:var(--timing-accent)}p{margin-top:15px;line-height:1.6}
</style>
