import { get } from 'svelte/store';
import { cuts, moduleForSlotIndex } from '$lib/stores/arrangement';
import { rackTop, rackBottom } from '$lib/stores/rack';
import { analysisBeatGrid } from '$lib/stores/triggerLane';
import { cutImmediate } from '$lib/stores/pgm';
import { stepSeconds } from './timelineScale';

export function activeTakeCutAt<T extends {step:number;slotIndex:number;timeSeconds?:number}>(
  list:readonly T[],positionSeconds:number,secondsForStep:(step:number)=>number,
):T|undefined{
  let current:T|undefined,latest=-Infinity;
  for(const cut of list){
    const at=cut.timeSeconds??secondsForStep(cut.step);
    if(at<=positionSeconds+1e-9&&at>=latest){current=cut;latest=at;}
  }
  return current;
}

/** A cut before a loop/seek boundary is still the take's active source. */
export function primeTakePgmAt(positionSeconds:number,bpm:number){
  const grid=get(analysisBeatGrid);
  const cut=activeTakeCutAt(get(cuts),positionSeconds,step=>stepSeconds(step,grid,bpm));
  if(!cut)return;
  const target=moduleForSlotIndex(get(rackTop),get(rackBottom),cut.slotIndex);
  if(target)cutImmediate(target);
}
