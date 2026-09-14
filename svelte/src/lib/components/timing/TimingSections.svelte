<script lang="ts">
  import { arrangement, sectionStarts, selectedArrangementSections, arrangementLoopRegion, activeSectionIndex, selectSection } from '$lib/stores/arrangement';
  import { analysisBeatGrid } from '$lib/stores/triggerLane';
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import { resolveSectionBounds } from '$lib/arrangement/sectionBounds';
  import { audioEngine } from '$lib/audio';
  const bounds=$derived(resolveSectionBounds($arrangement,$sectionStarts,$analysisBeatGrid,$transportDisplay.bpm||120));
  function loopSelection() {
    const selected=bounds.filter((_,i)=>$selectedArrangementSections.has(i));
    if(!selected.length)return;
    arrangementLoopRegion.set({startSeconds:Math.min(...selected.map(b=>b.startSeconds)),endSeconds:Math.max(...selected.map(b=>b.endSeconds))});
  }
  function pick(i:number,e:MouseEvent){
    if(e.shiftKey){const next=new Set($selectedArrangementSections);if(next.has(i))next.delete(i);else next.add(i);selectedArrangementSections.set(next);}
    else {selectedArrangementSections.set(new Set([i]));selectSection(i,false);audioEngine.seek(bounds[i].startSeconds);}
    if($arrangementLoopRegion)loopSelection();
  }
</script>
<nav class="sections" aria-label="Song sections">
  <span>SONG</span>
  <div class="bands">{#each bounds as band,i (band.id)}<button style:--section-color={band.hue} style:flex-grow={Math.max(.1,band.endSeconds-band.startSeconds)} class:selected={$selectedArrangementSections.has(i)} class:playing={$activeSectionIndex===i} aria-pressed={$selectedArrangementSections.has(i)} onclick={(e)=>pick(i,e)} title="{band.name} · {band.startSeconds.toFixed(1)}–{band.endSeconds.toFixed(1)}s. Shift-click to select several sections."><span>{band.name}</span><small>{band.startBar}</small></button>{/each}</div>
  <button class:looping={!!$arrangementLoopRegion} aria-pressed={!!$arrangementLoopRegion} onclick={()=>{if($arrangementLoopRegion)arrangementLoopRegion.set(null);else loopSelection();}}>↻ LOOP SECTION</button>
</nav>
<style>
  .sections{display:flex;align-items:center;gap:8px;padding:6px;background:#101214;border-block:1px solid #1e2226;color:#556070;font:7px var(--font-ui);letter-spacing:.08em}.bands{display:flex;flex:1;gap:2px;min-width:0}.bands button{flex-basis:0;min-width:0;display:flex;justify-content:space-between;gap:4px;overflow:hidden}.bands span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.bands small{font:7px monospace;color:#4a5260}button{font:7px var(--font-ui);letter-spacing:.05em;color:#556070;background:linear-gradient(#1a1c1f,#131517);border:1px solid #1e2226;padding:5px 7px;border-radius:2px;cursor:pointer}.bands .selected{color:var(--section-color);background:#1a1c1f;border-color:#343b40}.bands .playing{color:var(--section-color)}.looping{color:#35e08a;border-color:#35e08a55;background:#172019}
</style>
