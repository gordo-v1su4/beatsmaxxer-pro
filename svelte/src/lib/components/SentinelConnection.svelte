<script lang="ts">
  import { isTauriRuntime } from '$lib/platform/runtime';
  import { LIGHT_TARGETS, defaultLightTarget } from '$lib/connections/sentinelEvents';
  import { enableSentinel, sentinelChannels, sentinelInputs, sentinelTargets, sentinelSettings, sentinelStatus } from '$lib/connections/sentinel';
  let open=$state(true);
  function source(index:number,name:string) {
    sentinelInputs.update(inputs=>inputs.map((value,i)=>i===index?name:value));
    sentinelTargets.update(targets=>targets.map((value,i)=>i===index?defaultLightTarget(name):value));
  }
  function route(index:number,value:number) {sentinelTargets.update(targets=>targets.map((target,i)=>i===index?value:target));}
  function preview(name:string,position:number) {
    const events=$sentinelChannels.find(channel=>channel.name===name)?.events??[];
    let low=0,high=events.length;
    while(low<high){const middle=(low+high)>>>1;if(events[middle].time<position-2)low=middle+1;else high=middle;}
    const result=[];
    for(let i=low;i<events.length&&events[i].time<=position+6&&result.length<180;i++)result.push(events[i]);
    return result;
  }
</script>

{#if isTauriRuntime()}
  <section class="connection" aria-label="Sentinel music connection">
    <header>
      <button onclick={()=>open=!open} aria-expanded={open}>SENTINEL · MUSIC CONNECTION {open?'▾':'▸'}</button>
      <button class:enabled={$sentinelStatus.enabled} onclick={()=>enableSentinel(!$sentinelStatus.enabled)} aria-pressed={$sentinelStatus.enabled}>{$sentinelStatus.enabled?'STOP SENDING':'SEND TO SENTINEL'}</button>
      <span role="status">{$sentinelStatus.message}</span>
      <span>{$sentinelStatus.bpm.toFixed(1)} BPM · {$sentinelStatus.position.toFixed(1)}s · {$sentinelStatus.packets} packets</span>
    </header>
    {#if open}
      <div class="routes">
        {#each $sentinelInputs as name,index (index)}
          {@const channel=$sentinelChannels.find(channel=>channel.name===name)}
          <label class:hit={$sentinelStatus.levels[index]>.1}>
            <strong>MIDI INPUT {index+1}</strong>
            <select aria-label={`MIDI input ${index+1} source`} value={name} onchange={event=>source(index,event.currentTarget.value)}>
              <option value="">Choose an imported MIDI part…</option>
              {#if name&&!channel}<option value={name}>{name} · unavailable</option>{/if}
              {#each $sentinelChannels.filter(channel=>channel.name!=='Mix onsets (Essentia)') as channel (channel.name)}<option value={channel.name}>{channel.name}</option>{/each}
            </select>
            <svg viewBox="0 0 320 34" role="img" aria-label={`MIDI input ${index+1}: events from two seconds before to six seconds after the playhead`}>
              {#each preview(name,$sentinelStatus.position) as event,index (index)}
                <rect x={(event.time-$sentinelStatus.position+2)*40} y={32-Math.max(2,event.strength*29)} width="2" height={Math.max(2,event.strength*29)} fill="currentColor" opacity={event.time<=$sentinelStatus.position?.8:.4}/>
              {/each}
              <line x1="80" x2="80" y1="0" y2="34" stroke="#f6d583"/>
            </svg>
            <select aria-label={`MIDI input ${index+1} light group`} value={$sentinelTargets[index]??0} onchange={event=>route(index,Number(event.currentTarget.value))}>
              {#each LIGHT_TARGETS as target,index (target)}<option value={index}>{target}</option>{/each}
            </select>
            <span>{channel?.events.length??0} notes · {$sentinelStatus.counts[index]??0} hits</span>
            <meter aria-label={`MIDI input ${index+1} activity`} min="0" max="1" value={$sentinelStatus.levels[index]??0}></meter>
          </label>
        {/each}
      </div>
      <footer>
        <label>Minimum velocity <input aria-label="Sentinel minimum velocity" type="number" min="0" max="1" step=".05" bind:value={$sentinelSettings.threshold}/></label>
        <label>Minimum gap ms <input aria-label="Sentinel minimum gap" type="number" min="20" max="1000" step="10" bind:value={$sentinelSettings.gapMs}/></label>
        <label>Fade ms <input aria-label="Sentinel fade" type="number" min="30" max="2000" step="10" bind:value={$sentinelSettings.decayMs}/></label>
        <span>Six MIDI inputs · choose sources, compare events, then assign lights. Gold line = now. Choices are saved on this computer. Tempo changes reuse the original analysis.</span>
      </footer>
    {/if}
  </section>
{/if}

<style>
  .connection{background:#111615;border:1px solid #34443e;color:#d6ded9;font:11px var(--font-mono,monospace);margin:4px 8px;padding:8px;flex-shrink:0}
  header,footer{display:flex;align-items:center;gap:12px;flex-wrap:wrap}header{justify-content:space-between}button,select,input{background:#1b2320;border:1px solid #43564c;color:inherit;padding:5px;font:inherit}button{cursor:pointer}.enabled{color:#83e7b7;border-color:#83e7b7}.routes{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:8px 0}.routes label{display:grid;gap:5px;min-width:0;border-left:3px solid #34443e;padding:6px}.routes label.hit{border-color:#83e7b7;background:#203a2d}.routes select{width:100%;min-width:0}.routes svg{width:100%;height:34px;background:#0b100e;color:#83e7b7}.routes meter{width:100%;height:5px;accent-color:#83e7b7}.routes span,footer span{color:#a1b2a9}footer label{display:flex;align-items:center;gap:6px}input{width:55px}@media(max-width:1400px){.routes{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:850px){.routes{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
