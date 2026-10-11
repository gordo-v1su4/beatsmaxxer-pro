<script lang="ts">
  import { arrangement, sectionStarts, selectedArrangementSections, arrangementLoopRegion, activeSectionIndex, selectSection } from '$lib/stores/arrangement';
  import { analysisBeatGrid } from '$lib/stores/triggerLane';
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import { resolveSectionBounds } from '$lib/arrangement/sectionBounds';
  import { audioEngine } from '$lib/audio';
  import { clipGroupDrag,clipGroups } from '$lib/arrangement/clipGroups';
  const bounds=$derived(resolveSectionBounds($arrangement,$sectionStarts,$analysisBeatGrid,$transportDisplay.bpm||120));
  function loopSelection() {
    const selected=bounds.filter((_,i)=>$selectedArrangementSections.has(i));
    if(!selected.length)return;
    arrangementLoopRegion.set({startSeconds:Math.min(...selected.map(b=>b.startSeconds)),endSeconds:Math.max(...selected.map(b=>b.endSeconds))});
  }
  function pick(i:number,e:MouseEvent){
    if(e.shiftKey){const next=new Set($selectedArrangementSections);if(next.has(i))next.delete(i);else next.add(i);selectedArrangementSections.set(next);}
    else {selectedArrangementSections.set(new Set([i]));selectSection(i);audioEngine.seek(bounds[i].startSeconds);}
    if($arrangementLoopRegion)loopSelection();
  }
</script>
<nav class="sections" aria-label="Song sections">
  <span>SONG</span>
  <div class="bands">{#each bounds as band,i (band.id)}{@const group=$clipGroups.find(g=>g.id===$arrangement[i].clipGroupId)}<button data-song-section-target={band.id} class:assigned={!!group} class:drop-ready={!!$clipGroupDrag} style:--section-color={band.hue} style:flex-grow={Math.max(.1,band.endSeconds-band.startSeconds)} class:selected={$selectedArrangementSections.has(i)} class:playing={$activeSectionIndex===i} aria-pressed={$selectedArrangementSections.has(i)} onclick={(e)=>pick(i,e)} title="{band.name} · {band.startSeconds.toFixed(1)}–{band.endSeconds.toFixed(1)}s. {group?.name??'Drag a saved clip section here.'} Shift-click to select several sections."><span class="band-copy"><span>{band.name}</span>{#if group}<small class="assigned-group">{group.name}</small>{/if}</span><small>{band.startBar}</small></button>{/each}</div>
  <button class:looping={!!$arrangementLoopRegion} aria-pressed={!!$arrangementLoopRegion} onclick={()=>{if($arrangementLoopRegion)arrangementLoopRegion.set(null);else loopSelection();}}>↻ LOOP SECTION</button>
</nav>
<style>
  .band-copy{display:flex;flex-direction:column;align-items:flex-start;min-width:0;gap:3px;height:22px}.bands .assigned-group{color:#91b5b8;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bands .assigned{background:#172024}
  .bands .drop-ready:hover{background:#20363a;color:#c0d8d9}
  .sections{display:flex;align-items:center;gap:8px;padding:6px;background:#101214;border-block:1px solid #1e2226;color:#556070;font:7px var(--font-ui);letter-spacing:.08em}.bands{display:flex;flex:1;gap:2px;min-width:0}.bands button{flex-basis:0;min-width:0;display:flex;justify-content:space-between;gap:4px;overflow:hidden}.bands span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.bands small{font:7px monospace;color:#4a5260}button{font:7px var(--font-ui);letter-spacing:.05em;color:#556070;background:linear-gradient(#1a1c1f,#131517);border:1px solid #1e2226;padding:5px 7px;border-radius:2px;cursor:pointer}.bands .selected{color:var(--section-color);background:#1a1c1f;border-color:#343b40}.bands .playing{color:var(--section-color)}.looping{color:#14b8a6;border-color:#14b8a655;background:#142426}
  .bands button{border:0}.bands .selected{background:#242c30}.bands .playing{background:#1b2428}
</style>
