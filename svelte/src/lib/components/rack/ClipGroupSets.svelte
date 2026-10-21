<script lang="ts">
  import { RACK_SLOT_IDS } from '$lib/modules/rackSlots';
  import { onDestroy } from 'svelte';
  import { clipLibrary } from '$lib/stores/clipLibrary';
  import { clipDragState } from '$lib/stores/clipDrag';
  import { arrangementMode } from '$lib/arrangement/transportMode';
  import { arrangement } from '$lib/stores/arrangement';
  import { clipGroups,clipGroupDrag,addClipGroup,captureClipGroup,setClipGroupClip,assignClipGroup,assignClipGroupToSelection,renameClipGroup } from '$lib/arrangement/clipGroups';
  let selected=$state('');
  const slots=RACK_SLOT_IDS.map((id,number)=>({id,number}));
  function assign(id:string,slot:string,clipId=selected){const clip=$clipLibrary.find(c=>c.id===clipId);if(clip)setClipGroupClip(id,slot,clip);}
  function begin(id:string,e:PointerEvent){
    if($arrangementMode!=='live'||e.button!==0)return;
    e.preventDefault();clipGroupDrag.set({id,x:e.clientX,y:e.clientY});
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',cancel);
  }
  function move(e:PointerEvent){clipGroupDrag.update(d=>d?{...d,x:e.clientX,y:e.clientY}:null);}
  function cleanup(){window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',cancel);clipGroupDrag.set(null);}
  function cancel(){cleanup();}
  function finish(e:PointerEvent){
    const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-song-section-target]');
    if($clipGroupDrag&&target?.dataset.songSectionTarget)assignClipGroup($clipGroupDrag.id,target.dataset.songSectionTarget);
    cleanup();
  }
  onDestroy(cleanup);
</script>
<section class="clip-sets" aria-label="Reusable clip sections">
  <header><span>SAVED SECTIONS</span><button disabled={$arrangementMode!=='live'} onclick={()=>addClipGroup()} title="Add an empty reusable group of ten clips">+ SECTION</button></header>
  {#if !$clipGroups.length}<button disabled={$arrangementMode!=='live'} onclick={()=>addClipGroup(true)}>CAPTURE RACK</button>{/if}
  <p>Build a section, then drag it onto the SONG strip. Reuse it for any verse or chorus.</p>
  {#if $clipGroups.length}
    <label>CLIP <select aria-label="Clip to add to saved section" bind:value={selected} disabled={$arrangementMode!=='live'}><option value="">CHOOSE A CLIP</option>{#each $clipLibrary as clip (clip.id)}<option value={clip.id}>{clip.name}</option>{/each}</select></label>
  {/if}
  {#each $clipGroups as group (group.id)}
    <div class="section-box">
      <div class="section-heading"><button class="drag" aria-label="Drag {group.name} onto a song section" disabled={$arrangementMode!=='live'} onpointerdown={e=>begin(group.id,e)} title="Drag this whole clip group onto a verse or chorus in the SONG strip">⠿</button><input aria-label="Name of {group.name}" value={group.name} disabled={$arrangementMode!=='live'} onchange={e=>renameClipGroup(group.id,e.currentTarget.value)}/></div>
      <div class="actions"><button disabled={$arrangementMode!=='live'} onclick={()=>captureClipGroup(group.id)} title="Replace this group's clips with all ten current rack clips">CAPTURE RACK</button><button disabled={$arrangementMode!=='live'} onclick={()=>assignClipGroupToSelection(group.id)} title="Assign this group to the selected song sections">ASSIGN SELECTED</button></div>
      <div class="section-slots">{#each slots as slot (slot.id)}<button aria-label="{group.name} deck {slot.number} clip" disabled={$arrangementMode!=='live'} onclick={()=>assign(group.id,slot.id)} onpointerup={()=>{if($clipDragState.active&&$clipDragState.clipId)assign(group.id,slot.id,$clipDragState.clipId);}} title={group.scene.slots[slot.id]?.name??'Drag a clip here, or choose one above and click'}><b>S{slot.number}</b><span>{group.scene.slots[slot.id]?.name??'EMPTY'}</span></button>{/each}</div>
      <small>{$arrangement.filter(s=>s.clipGroupId===group.id).length} SONG SECTIONS ASSIGNED</small>
    </div>
  {/each}
</section>
{#if $clipGroupDrag}<div class="group-ghost" style:left="{$clipGroupDrag.x+12}px" style:top="{$clipGroupDrag.y+12}px">{$clipGroups.find(g=>g.id===$clipGroupDrag?.id)?.name} · CLIP SET</div>{/if}
<style>
  .clip-sets{padding:7px;border-bottom:1px solid #252a2e;font:7px var(--font-ui);color:#87949e}header,.section-heading,.actions{display:flex;align-items:center;gap:5px}header{justify-content:space-between;letter-spacing:.1em;margin-bottom:7px}p{line-height:1.6;margin:7px 0}label{display:flex;gap:5px;align-items:center;margin-bottom:7px}select,input{min-width:0;width:100%;background:#141719;color:#9eacb3;border:1px solid #252a2e;font:7px var(--font-ui);padding:4px}.section-box{border:1px solid #252a2e;border-left:2px solid #6b9b9e;margin:6px 0;padding:5px}button{background:#141719;border:1px solid #252a2e;color:#8c9ba3;font:7px var(--font-ui);padding:3px;cursor:pointer}button:disabled,input:disabled{opacity:.4;cursor:default}.drag{cursor:grab;font-size:12px}.actions{margin-top:5px}.section-slots{display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-top:5px}.section-slots button{display:flex;gap:4px;min-width:0;text-align:left}.section-slots b{font-weight:400;color:#6b9b9e}.section-slots span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}small{display:block;font:6px var(--font-ui);color:#56636c;margin-top:5px}.group-ghost{position:fixed;z-index:9999;pointer-events:none;padding:8px;background:#152125;border:1px solid #6b9b9e;color:#c0d8d9;font:9px var(--font-ui)}
  .section-box{border:0;background:#14191c}.drag{border:0;background:#20292d}.section-heading input{border:0;background:#20292d}
</style>
