<script lang="ts">
  import { timingLive,timingSchedules,selectedTimingSlot,timingSettings } from '$lib/stores/timing';
  import { timingSignalGrid } from '$lib/stores/timingSignals';
  import { BeatGrid } from '$lib/transport/BeatGrid';
  import { measureLabel } from './stutterGrid';
  const live=$derived($timingLive[$selectedTimingSlot]);
  const bursts=$derived($timingSchedules[$selectedTimingSlot]??[]);
  const grid=$derived(new BeatGrid($timingSignalGrid.beats,$timingSignalGrid.bpm));
  const beat=$derived(grid.sample(live?.time??0).beatPosition);
  const start=$derived(Math.floor(beat/16)*16);
  const visible=$derived(bursts.filter(b=>grid.sample(b.end).beatPosition>=start&&grid.sample(b.at).beatPosition<start+16));
  const x=(b:number)=>12+(b-start)/16*976;
  const sourceBeat=$derived(grid.sample(live?.sourceTimelineSeconds??live?.time??0).beatPosition);
  const normalX=$derived(Math.max(12,Math.min(988,x(beat))));
  const sourceX=$derived(Math.max(12,Math.min(988,x(sourceBeat))));
  const offset=$derived((live?.sourceTimelineSeconds??live?.time??0)-(live?.time??0));
  const sourceOutside=$derived(sourceBeat<start?'left':sourceBeat>start+16?'right':null);
  let expanded=$state(false);
</script>
<div class:event-strip-collapsed={!expanded} class="event-strip" aria-label="Timing accepted triggers and playback gaps">
  <button class="event-strip-toggle" aria-expanded={expanded} aria-label={expanded?'Collapse accepted burst timeline':'Expand accepted burst timeline'} title={expanded?'Collapse accepted burst timeline':'Expand accepted burst timeline'} onclick={()=>expanded=!expanded}>
    <span class="event-strip-title"><span class="event-strip-chevron" aria-hidden="true">{expanded?'▾':'▸'}</span> SONG · BARS {Math.floor(start/4)+1}–{Math.floor(start/4)+4} · {(live?.state??'waiting').toUpperCase()}</span>
    <span class="event-strip-hint">{$timingSettings.trigger.source === "continuous" ? "CONTINUOUS PLAYBACK - NO TRIGGERED BURSTS" : "ACCEPTED BURSTS - EMPTY SPACE = NORMAL PLAYBACK"}</span>
  </button>
  {#if expanded}
  <div class="offset-legend" aria-live="off"><span class="normal-key">NORMAL TIME</span><span class="source-key">CLIP POSITION</span><span>{!live?'LOAD A CLIP':Math.abs(offset)<.005?'IN SYNC':`${Math.abs(offset).toFixed(2)}s ${offset<0?'BEHIND':'AHEAD'}`}{sourceOutside?' - CLIP POSITION OUTSIDE THIS VIEW':''}</span></div>
  <svg viewBox="0 0 1000 64" role="img" aria-label="Four bars of accepted effect triggers, repeat boundaries and live song position">
    <defs><linearGradient id="timing-offset-gradient"><stop offset="0" stop-color="#a855f7" stop-opacity=".08"/><stop offset="1" stop-color="#c084fc" stop-opacity=".45"/></linearGradient><clipPath id="timing-events-clip"><rect x="7" y="15" width="986" height="45"/></clipPath></defs>
    {#each Array.from({length:17},(_,i)=>start+i) as b}
      <line x1={x(b)} x2={x(b)} y1="20" y2="60" stroke={b%4===0?'#354149':'#1c2429'}/>
      {#if b%2===0 || b===start+16}<text x={x(b)} y="12" text-anchor={b===start+16?'end':'start'} textLength="22" lengthAdjust="spacingAndGlyphs">{measureLabel(b)}</text>{/if}
    {/each}
    <g clip-path="url(#timing-events-clip)">
      {#if live}<rect data-source-offset x={Math.min(normalX,sourceX)} y="20" width={Math.abs(sourceX-normalX)} height="40" fill="url(#timing-offset-gradient)"/>{/if}
      {#each visible as b}
        <rect x={x(grid.sample(b.at).beatPosition)} y="29" width={Math.max(1,x(grid.sample(b.end).beatPosition)-x(grid.sample(b.at).beatPosition))} height="21" fill="var(--timing-accent)" opacity=".2"/>
        <line data-accepted-trigger x1={x(grid.sample(b.at).beatPosition)} x2={x(grid.sample(b.at).beatPosition)} y1="23" y2="55" stroke="var(--timing-accent)"/>
        {#each b.repeats.slice(1,-1) as t}<line x1={x(grid.sample(t).beatPosition)} x2={x(grid.sample(t).beatPosition)} y1="33" y2="48" stroke="var(--timing-accent)" opacity=".65"/>{/each}
      {/each}
      {#if live}
        <line data-source-playhead x1={sourceX} x2={sourceX} y1="20" y2="60" stroke="#d8b4fe" stroke-width="2"/>
        <path d={sourceOutside==='left'?'M 18 23 L 12 28 L 18 33':sourceOutside==='right'?'M 982 23 L 988 28 L 982 33':`M ${sourceX-4} 15 L ${sourceX+4} 15 L ${sourceX} 20 Z`} fill="#d8b4fe" stroke="#d8b4fe"/>
      {/if}
      <line data-trigger-playhead x1={x(beat)} x2={x(beat)} y1="20" y2="60" stroke="#b7c0c7" stroke-width="1.5"/>
    </g>
  </svg>{/if}
</div>
<style>.offset-legend{display:flex;justify-content:center;gap:16px;min-height:16px;align-items:center;font:7px var(--font-mono)}.normal-key{color:#b7c0c7}.source-key{color:#d8b4fe}.event-strip{padding:4px 8px;background:#0c0e10;border-top:1px solid #252a2e;font:7px var(--font-mono);color:#768691}.event-strip-toggle{display:flex;align-items:center;width:100%;min-height:20px;justify-content:space-between;gap:12px;padding:0 2px;border:0;background:transparent;color:inherit;font:inherit;letter-spacing:.02em;text-align:left;cursor:pointer}.event-strip-toggle:hover,.event-strip-toggle:focus-visible{color:#b9eee0}.event-strip-title,.event-strip-hint{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.event-strip-chevron{display:inline-block;width:12px;color:var(--timing-accent);font-size:11px;line-height:1;text-align:center}.event-strip-hint{color:#53616a;text-align:right}.event-strip-collapsed{height:22px;padding:0 8px;border-top:1px solid #252a2e;overflow:visible}.event-strip-collapsed .event-strip-toggle{height:21px}svg{display:block;width:100%;height:56px}text{font:8px var(--font-mono);fill:#6a7a8a}</style>
