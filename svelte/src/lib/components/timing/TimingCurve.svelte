<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { beginTimingGesture, endTimingGesture } from '$lib/stores/timing';
  import { ACCENTS } from '$lib/modules/palette';
  import { clamp01, constrainPointX, SNAP_BEATS, evaluateRamp, normalizePoints, rateToY, yToRate, snapRate, snapPosition, type RampConfig, type Snap, type CurvePoint } from '$lib/runtime/timing/envelope';
  let { ramp, phase = 0, snap = '32nd', onchange }: { ramp: RampConfig; phase?: number; snap?: Snap; onchange: (ramp: RampConfig) => void } = $props();
  let svg: SVGSVGElement;
  let drag = $state<string | null>(null);
  let selected = $state<string | null>(null);
  // Keep ruler text and handles legible as the available editor width changes.
  let W=$state(1000);
  let H=$state(246);
  const top=28, bottom=234;
  onMount(()=>{const resize=new ResizeObserver(([entry])=>{W=Math.max(200,entry.contentRect.width);H=Math.max(1,entry.contentRect.height);});resize.observe(svg);return ()=>resize.disconnect();});
  const x = (v:number) => 8+v*(W-16);
  const ry = (r:number) => r*246/H;
  const minRate=$derived(Math.min(.5,...ramp.points.map(p=>Math.floor(yToRate(p.y)*4)/4)));
  const maxRate=$derived(Math.max(3,...ramp.points.map(p=>Math.ceil(yToRate(p.y)*4)/4)));
  const rateTicks=$derived(Array.from({length:Math.round((maxRate-minRate)*4)+1},(_,i)=>minRate+i/4));
  const y = (v:number) => bottom-(yToRate(v)-minRate)/(maxRate-minRate)*(bottom-top);
  const path = $derived(Array.from({length:2001},(_,i) => `${i?'L':'M'}${x(i/2000).toFixed(2)},${y(rateToY(evaluateRamp(ramp,i/2000))).toFixed(2)}`).join(' '));
  const gridStep=$derived(snap==='64th'?.0625:.125);
  const ticks = $derived(Array.from({length:Math.round(ramp.cycleBeats/gridStep)+1},(_,i)=>i*gridStep));
  const anchor = $derived(ramp.points.find(p=>p.id===selected));
  const canRemove=$derived(!!anchor && anchor.id!==ramp.points[0]?.id && anchor.id!==ramp.points.at(-1)?.id);
  function position(e:PointerEvent) {
    const p = new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return { x:snapPosition((p.x-8)/(W-16),e.altKey?'off':snap,ramp.cycleBeats),y:rateToY(e.altKey?minRate+clamp01((bottom-p.y)/(bottom-top))*(maxRate-minRate):snapRate(minRate+clamp01((bottom-p.y)/(bottom-top))*(maxRate-minRate))) };
  }
  function edit(points:CurvePoint[]) { onchange({...ramp, shape:ramp.legacy?'smooth':ramp.shape,legacy:undefined,points:normalizePoints(points)}); }
  function down(e:PointerEvent,id?:string) {
    if(e.button!==0) return;
    beginTimingGesture();
    // Keep anchor clicks targeted at the anchor so native double-click deletion
    // still works; move/up bubble to the SVG while the anchor owns capture.
    e.preventDefault(); (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if(id) {(e.currentTarget as SVGElement).focus({preventScroll:true});drag=id;selected=id;return;}
    if(ramp.points.length>=128) return;
    const p=position(e);
    const nearby=ramp.points.find(a=>Math.abs(a.x-p.x)<1e-6);
    if(nearby){drag=nearby.id;selected=nearby.id;return;}
    const added={...p,id:crypto.randomUUID(),tension:0};drag=added.id;selected=added.id;edit([...ramp.points,added]);
  }
  function move(e:PointerEvent) {
    if(!drag)return;
    const p=position(e); const i=ramp.points.findIndex(a=>a.id===drag);
    if(i<0)return;
    // Endpoints stay on the cycle boundary; neighbours cannot be crossed.
    p.x=constrainPointX(ramp.points,i,p.x,e.altKey?'off':snap,ramp.cycleBeats);
    edit(ramp.points.map(a=>a.id===drag?{...a,...p}:a));
  }
  function remove(id:string) {if(id!==ramp.points[0]?.id&&id!==ramp.points.at(-1)?.id){edit(ramp.points.filter(p=>p.id!==id));selected=null;}}
  function finish() { drag=null; endTimingGesture(); }
  onDestroy(finish);
  function key(e:KeyboardEvent,id:string) {
    const a=ramp.points.find(p=>p.id===id);if(!a)return;
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove(id);return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
    e.preventDefault();const i=ramp.points.indexOf(a),step=(snap==='off'?0.01:SNAP_BEATS[snap]/ramp.cycleBeats);
    edit(ramp.points.map(p=>p.id!==id?p:{...p,x:constrainPointX(ramp.points,i,p.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),snap,ramp.cycleBeats),y:rateToY(Math.max(minRate,Math.min(maxRate,e.key==='ArrowUp'||e.key==='ArrowDown'?snapRate(yToRate(p.y)+(e.key==='ArrowUp'?.25:-.25)):yToRate(p.y))))}));
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<svg bind:this={svg} viewBox={`0 0 ${W} 246`} preserveAspectRatio="none" role="group" aria-label="Editable speed ramp, numbered bars and beats" onpointerdown={(e)=>down(e)} onpointermove={move} onpointerup={finish} onpointercancel={finish} onlostpointercapture={finish}>
  <rect width={W} height="246" fill="#090b0c" />
  {#each ticks as beat}
    {@const isBar=beat%4===0}{@const isBeat=beat%1===0}{@const isLabel=beat%2===0 || beat===ramp.cycleBeats}
    <line x1={x(beat/ramp.cycleBeats)} x2={x(beat/ramp.cycleBeats)} y1="22" y2={bottom} stroke={isBar?'#293135':isBeat?'#303c40':'#202a2e'} stroke-width={isBar?1:.6}/>
    {#if isBeat && isLabel}<text x={x(beat/ramp.cycleBeats)+(beat===ramp.cycleBeats?-4:4)} text-anchor={beat===ramp.cycleBeats?'end':'start'} y="14" fill={isBar?'#879594':'#4c5b5a'} font-size="9" font-family="monospace" textLength="22" lengthAdjust="spacingAndGlyphs">{Math.floor(beat/4)+1}.{beat%4+1}</text>{/if}
  {/each}
  {#each rateTicks as rate}
    <line x1="0" x2={W} y1={y(rateToY(rate))} y2={y(rateToY(rate))} stroke={rate===1?'#526c65':rate%1===0?'#303c40':'#202a2e'} stroke-width=".6"/>
    <text x="12" y={y(rateToY(rate))-3} fill="#49645f" font-size="8" font-family="monospace" textLength="30" lengthAdjust="spacingAndGlyphs">{rate.toFixed(2)}×</text>
  {/each}
  <path d={`${path} L${x(1)},${bottom} L${x(0)},${bottom}Z`} fill={ACCENTS.speedramp+'12'} pointer-events="none"/>
  <path d={path} fill="none" stroke={ACCENTS.speedramp} stroke-width="1.5" pointer-events="none"/>
  <line x1={x(phase)} x2={x(phase)} y1="22" y2={bottom} stroke="#b9eee0" stroke-width=".8" opacity=".65" pointer-events="none"/>
  <ellipse cx={x(phase)} cy={y(rateToY(evaluateRamp(ramp,phase)))} rx="2.7" ry={ry(2.7)} fill="#c0f6e7" pointer-events="none"/>
  {#each ramp.points as p (p.id)}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <g role="button" tabindex="0" aria-label="Ramp anchor at beat {(p.x*ramp.cycleBeats+1).toFixed(2)}, {(0.25+p.y*3.75).toFixed(2)} times speed" onpointerdown={(e)=>{e.stopPropagation();down(e,p.id);}} ondblclick={(e)=>{e.stopPropagation();remove(p.id);}} onkeydown={(e)=>key(e,p.id)} onfocus={()=>selected=p.id}>
      <ellipse cx={x(p.x)} cy={y(p.y)} rx="10" ry={ry(10)} fill="transparent"/>
      <ellipse cx={x(p.x)} cy={y(p.y)} rx="2" ry={ry(2)} fill="#090b0c" stroke={selected===p.id?'#c2f4e7':ACCENTS.speedramp} stroke-width="1.35" pointer-events="none"/>
    </g>
  {/each}
</svg>
<div class="curve-tools">
  <span>{anchor?`${yToRate(anchor.y).toFixed(2)}× · BEAT ${(anchor.x*ramp.cycleBeats+1).toFixed(2)}`:'SELECT A DOT TO EDIT'} · DELETE / BACKSPACE</span>
  <button disabled={!canRemove} onclick={()=>{if(selected)remove(selected);}} title={canRemove?'Delete selected interior point':'Cycle endpoints cannot be deleted'}>DELETE POINT</button>
{#if ramp.shape==='tension' && anchor}
  <label class="tension">SEGMENT TENSION <input aria-label="Selected ramp segment tension" type="range" min="-1" max="1" step=".01" value={anchor.tension} oninput={(e)=>edit(ramp.points.map(p=>p.id===selected?{...p,tension:Number(e.currentTarget.value)}:p))}/>{anchor.tension.toFixed(2)}</label>
{/if}
</div>
<style>
  .curve-tools{height:26px;display:flex;align-items:center;gap:12px;padding:0 8px;color:#6a7a8a;font:7px var(--font-mono)}
  .curve-tools button{font:7px var(--font-ui);padding:2px 5px;color:#91a9a4;background:#151b1d;border:1px solid #293336;border-radius:2px;cursor:pointer}.curve-tools button:disabled{opacity:.4;cursor:default}
  svg{display:block;width:100%;height:var(--timing-plot-height,200px);min-width:0;touch-action:none;cursor:crosshair}g{cursor:grab}g:focus{outline:none}g:focus ellipse:last-child{stroke:#e5fff7;stroke-width:2}.tension{display:flex;align-items:center;gap:12px;padding:4px 10px;color:#76b5aa;font:8px monospace}.tension input{width:160px;accent-color:#35e08a}
</style>
