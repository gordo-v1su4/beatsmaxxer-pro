<script lang="ts">
  import type { ClipTiming } from '$lib/runtime/timing/envelope';
  import { measureLabel, musicalFraction, stutterGrid } from './stutterGrid';
  let { stutter, phase = 0, enabled = true, state='continuous' }: { stutter: ClipTiming['stutter']; phase?: number; enabled?: boolean;state?:string } = $props();
  const grid = $derived(stutterGrid(stutter.division, stutter.repeats,stutter.groove));
  const position = $derived(Math.max(0,Math.min(1,phase)));
  const x = (beat: number) => 12 + beat / grid.beats * 976;
  const action = $derived(stutter.mode === 'hold' ? 'HOLD' : stutter.mode === 'jump' ? 'JUMP / REPLAY' : 'REPEAT');
  const starts = $derived(stutter.mode === 'hold' ? [0] : grid.starts);
</script>
<div class="stutter-grid" aria-label="Stutter beat grid">
  <div class="grid-caption">
    <span>{musicalFraction(grid.beats)} {grid.beats<=1?'BEAT':'BEATS'} · {musicalFraction(grid.bars)} {grid.bars<=1?'BAR':'BARS'} · 4/4</span>
    <span>{enabled ? state.toUpperCase() : 'BYPASSED'} · {(stutter.groove??'straight').toUpperCase()} · BAR {Math.floor(position*grid.beats/4)+1} · BEAT {(position*grid.beats%4+1).toFixed(2)}</span>
  </div>
  <svg viewBox="0 0 1000 145" role="img" aria-label={`${grid.bars} bars of ${action.toLowerCase()}, numbered bars and beats; moving playback position`}>
    <rect width="1000" height="145" fill="#090b0c"/>
    {#each grid.ticks as beat}
      <line x1={x(beat)} x2={x(beat)} y1="26" y2="125" stroke={beat%4===0?'#344047':'#20292e'} stroke-width={beat%4===0?1:.6}/>
      <text x={x(beat)} y="16" text-anchor={beat===grid.beats?'end':'start'} class:bar={beat%4===0}>{measureLabel(beat)}</text>
    {/each}
    <line x1="12" x2="988" y1="125" y2="125" stroke="#252e32"/>
    {#each starts as beat,i}
      {@const end=starts[i+1]??grid.beats}
      {@const lit = enabled && (state==='burst'||state==='continuous') && position*grid.beats>=beat && position*grid.beats<end}
      <rect x={x(beat)+1} y="48" width={Math.max(0,x(end)-x(beat)-2)} height="46" fill={lit?'var(--timing-accent)':'#20282d'} opacity={lit?.15:.5}/>
      <line x1={x(beat)} x2={x(beat)} y1="42" y2="100" stroke="var(--timing-accent)" stroke-width="1" opacity=".6"/>
      <text x={x(beat)+5} y="75" class="event">{stutter.mode==='hold' ? 'HOLD' : `R${i+1}`}</text>
    {/each}
    {#if enabled}
      <g data-stutter-playhead data-phase={position}>
        <line x1={x(position*grid.beats)} x2={x(position*grid.beats)} y1="24" y2="125" stroke="var(--timing-accent)" stroke-width="1.5"/>
        <path d={`M${x(position*grid.beats)-3} 23 L${x(position*grid.beats)+3} 23 L${x(position*grid.beats)} 28Z`} fill="var(--timing-accent)"/>
      </g>
    {/if}
    <text x="12" y="139">{stutter.mode==='hold'?'FRAME HELD FOR CYCLE':stutter.mode==='jump'?`JUMP AT CYCLE START · ${stutter.repeats} PLAYS`:`REPEAT STARTS · ${stutter.repeats} PLAYS`} · CYCLE-RELATIVE BAR.BEAT</text>
  </svg>
</div>
<style>
  .stutter-grid{height:var(--timing-plot-height,200px);overflow:hidden;background:#090b0c}.grid-caption{height:30px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid #20262a;color:#6a7a8a;font:8px var(--font-mono);letter-spacing:.08em}svg{display:block;width:100%;height:calc(var(--timing-plot-height,200px) - 30px)}text{font:8px var(--font-mono);fill:#63737d}.bar{fill:#8b999f}.event{fill:var(--timing-accent);font-size:9px}
</style>
