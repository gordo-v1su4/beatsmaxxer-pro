<script lang="ts">
  import { timeSamplerParamsFromControls } from '$lib/timesampler/integration';
  import { nextGrooveBeat, grooveSegment } from '$lib/runtime/groove';
  import type { SamplerConfig } from '$lib/runtime/timing/envelope';
  let { config, sourceSeconds, duration, normalSeconds, trace, beat, enabled, state, queuedAt, time, end }: {
    config: SamplerConfig; sourceSeconds: number; duration: number; normalSeconds: number;
    trace: readonly {normal:number;source:number}[]; beat:number; enabled: boolean; state: string;
    queuedAt:number|null; time:number; end:number|null;
  } = $props();
  const params = $derived(timeSamplerParamsFromControls(config.controls,duration));
  const active = $derived(duration > 0 ? Math.min(params.sliceCount - 1, Math.floor(sourceSeconds / duration * params.sliceCount)) : -1);
  const playing = $derived(enabled && (state === 'burst' || state === 'continuous'));
  const label=$derived(!enabled?'BYPASSED':state==='continuous'?'CONTINUOUS':playing?'SAMPLING':queuedAt!==null?'QUEUED':'NORMAL');
  const jump=$derived(playing?trace.at(-1):undefined);
  const x=(time:number)=>duration>0?12+Math.max(0,Math.min(1,time/duration))*976:12;
  const ticks=$derived.by(()=>{
    const start=Math.floor(beat/4)*4,feel=config.groove==='swing'?1:config.groove==='dotted'?2:0;
    const out:{original:number;shifted:number}[]=[];
    const segment=grooveSegment(start,params.jumpSizeBeats,feel);
    let shifted=Math.abs(segment.start-start)<1e-6?start:segment.start+segment.length;
    for(let i=0;i<=Math.ceil(4/params.jumpSizeBeats)&&shifted<=start+4+1e-6;i++){
      out.push({original:12+i*params.jumpSizeBeats/4*976,shifted:12+(shifted-start)/4*976});
      shifted=nextGrooveBeat(shifted+1e-7,params.jumpSizeBeats,feel);
    }
    return out;
  });
</script>

<div class="sampler-grid" aria-label="Timesampler original slices and played path">
  <div class="legend"><span>{params.mode} · {params.sliceCount} SOURCE SLICES · {params.loopCount} {params.loopCount===1?'LOOP':'LOOPS'}</span><strong class:active={playing} aria-live="off" data-sampler-status>{label}{queuedAt!==null&&!playing?` · ${(queuedAt-time).toFixed(1)}s`:playing&&end!==null?` · ${Math.max(0,end-time).toFixed(1)}s LEFT`:''}</strong></div>
  <svg viewBox="0 0 1000 160" preserveAspectRatio="none" role="img" aria-label="Original source positions in gray, played slice positions and groove shifts in cyan">
    {#each Array.from({length:params.sliceCount},(_,i)=>i) as slice (slice)}
      <rect x={12+slice/params.sliceCount*976} y="14" width={976/params.sliceCount-2} height="25" fill="#172329"/>
      <text x={12+(slice+.5)/params.sliceCount*976} y="30" text-anchor="middle">{slice+1}</text>
      <rect x={12+slice/params.sliceCount*976} y="85" width={976/params.sliceCount-2} height="25" fill={playing&&active===slice?'var(--timing-accent)':'#10191d'} opacity={playing&&active===slice?'.55':'1'}/>
    {/each}
    {#if jump}<path d={`M ${x(jump.normal)} 40 L ${x(jump.source)} 84`} fill="none" stroke="var(--timing-accent)" opacity=".65"/>{/if}
    <line data-original-position x1={x(normalSeconds)} x2={x(normalSeconds)} y1="8" y2="48" stroke="#a3adb7" stroke-dasharray="3 2"/>
    <line data-sampled-position x1={x(sourceSeconds)} x2={x(sourceSeconds)} y1="78" y2="117" stroke="var(--timing-accent)" stroke-width="2"/>
    {#each config.behavior==='hit'?[]:ticks as tick,i (i)}
      <line x1={tick.original} x2={tick.original} y1="131" y2="138" stroke="#66727d"/>
      <line data-groove-shift x1={tick.original} x2={tick.shifted} y1="138" y2="150" stroke="var(--timing-accent)" opacity=".6"/>
      <line x1={tick.shifted} x2={tick.shifted} y1="145" y2="155" stroke="var(--timing-accent)"/>
    {/each}
  </svg>
  <div class="legend"><span>TOP · NORMAL PLAYHEAD · {normalSeconds.toFixed(2)}s</span><span>BOTTOM · VIDEO OUTPUT · {sourceSeconds.toFixed(2)}s</span></div>
  <details class="sampler-help">
    <summary>{config.behavior==='hit'?'Capture → loop → normal playback':config.behavior==='continuous'?'Continuous slicing · triggers add jumps':'Slice sequence → normal playback'} · DETAILS</summary>
    <p>{config.behavior==='hit'?'Normal playback until an accepted trigger. One slice is captured on the next beat or bar, loops, then returns to the normal playhead. REV plays backward; PONG plays forward then backward. The line shows the current jump.':config.behavior==='continuous'?'Original continuous sequence: always chops. Triggers add jumps; REV changes slice order.':'Triggered sequence: plays a slice pattern, then returns to normal playback. REV changes slice order.'} {config.behavior!=='continuous'?(config.retrigger==='restart'?'Accepted notes can interrupt and restart at the launch boundary.':'Incoming notes are ignored until every loop finishes.'):''} Trigger chance controls accepted activations. {config.behavior==='hit'?`Sample speed: ${params.playbackRate.toFixed(2)}×. Changes apply to the next sample.`:''}</p>
  </details>
</div>

<style>
  .sampler-grid{display:flex;flex-direction:column;justify-content:center;gap:6px;padding:8px 12px;min-width:0;min-height:0;color:#6a7a8a;font:8px var(--font-mono)}
  .legend{display:flex;justify-content:space-between;gap:16px}svg{width:100%;height:160px;min-height:64px;flex:1 1 0;display:block}text{fill:#80939d;font:9px var(--font-mono)}p{margin:0;font:8px var(--font-ui);line-height:1.5;color:#53616a}
  .legend{flex-shrink:0}
  .sampler-help{position:relative;flex-shrink:0;font:8px var(--font-ui)}
  summary{cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:16px}
  .sampler-help p{position:absolute;bottom:22px;right:0;z-index:5;max-width:560px;padding:12px;background:#151b20;border:1px solid #354149;color:#a3adb7;box-shadow:0 4px 16px #0008}
  strong{font-weight:600;color:#a3adb7}.active{color:var(--timing-accent)}
</style>
