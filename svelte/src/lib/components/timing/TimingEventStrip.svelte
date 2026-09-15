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
  let expanded=$state(false);
</script>
{#if $timingSettings.trigger.source!=='continuous'}
<div class:event-strip-collapsed={!expanded} class="event-strip" aria-label="Timing accepted triggers and playback gaps">
  <button class="event-strip-toggle" aria-expanded={expanded} aria-label={expanded?'Collapse accepted burst timeline':'Expand accepted burst timeline'} title={expanded?'Collapse accepted burst timeline':'Expand accepted burst timeline'} onclick={()=>expanded=!expanded}>
    <span class="event-strip-title"><span class="event-strip-chevron" aria-hidden="true">{expanded?'⌄':'›'}</span> SONG · BARS {Math.floor(start/4)+1}–{Math.floor(start/4)+4} · {(live?.state??'waiting').toUpperCase()}</span>
    <span class="event-strip-hint">ACCEPTED BURSTS · EMPTY SPACE = NORMAL PLAYBACK</span>
  </button>
  {#if expanded}<svg viewBox="0 0 1000 64" role="img" aria-label="Four bars of accepted effect triggers, repeat boundaries and live song position">
    <defs><clipPath id="timing-events-clip"><rect x="12" y="20" width="976" height="40"/></clipPath></defs>
    {#each Array.from({length:17},(_,i)=>start+i) as b}
      <line x1={x(b)} x2={x(b)} y1="20" y2="60" stroke={b%4===0?'#354149':'#1c2429'}/>
      {#if b%2===0 || b===start+16}<text x={x(b)} y="12" text-anchor={b===start+16?'end':'start'} textLength="22" lengthAdjust="spacingAndGlyphs">{measureLabel(b)}</text>{/if}
    {/each}
    <g clip-path="url(#timing-events-clip)">
      {#each visible as b}
        <rect x={x(grid.sample(b.at).beatPosition)} y="29" width={Math.max(1,x(grid.sample(b.end).beatPosition)-x(grid.sample(b.at).beatPosition))} height="21" fill="var(--timing-accent)" opacity=".2"/>
        <line data-accepted-trigger x1={x(grid.sample(b.at).beatPosition)} x2={x(grid.sample(b.at).beatPosition)} y1="23" y2="55" stroke="var(--timing-accent)"/>
        {#each b.repeats.slice(1,-1) as t}<line x1={x(grid.sample(t).beatPosition)} x2={x(grid.sample(t).beatPosition)} y1="33" y2="48" stroke="var(--timing-accent)" opacity=".65"/>{/each}
      {/each}
      <line data-trigger-playhead x1={x(beat)} x2={x(beat)} y1="18" y2="60" stroke="#c1d4d7" stroke-width="1.5"/>
    </g>
  </svg>{/if}
</div>
{/if}
<style>.event-strip{padding:4px 8px;background:#0c0e10;border-top:1px solid #252a2e;font:7px var(--font-mono);color:#768691}.event-strip-toggle{display:flex;align-items:center;width:100%;min-height:20px;justify-content:space-between;gap:12px;padding:0 2px;border:0;background:transparent;color:inherit;font:inherit;letter-spacing:.02em;text-align:left;cursor:pointer}.event-strip-toggle:hover,.event-strip-toggle:focus-visible{color:#b9eee0}.event-strip-title,.event-strip-hint{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.event-strip-chevron{display:inline-block;width:12px;color:var(--timing-accent);font-size:12px;line-height:1;text-align:center}.event-strip-hint{color:#53616a;text-align:right}.event-strip-collapsed{height:22px;padding:0 8px;border-top:1px solid #252a2e;overflow:visible}.event-strip-collapsed .event-strip-toggle{height:21px}svg{display:block;width:100%;height:56px}text{font:8px var(--font-mono);fill:#6a7a8a}</style>
