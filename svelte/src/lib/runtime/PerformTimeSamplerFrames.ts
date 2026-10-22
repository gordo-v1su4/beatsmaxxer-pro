import { writable } from 'svelte/store';
import { ResidentFrameBank, ResidentMemoryBudget } from './timing/ResidentFrameBank';
import type { OwnedVideoFrame } from '$lib/rendering/webgpu/OwnedVideoFrame';

export interface SamplerFrameSource { name: string; url: string; file?: File }
type Entry = { source:SamplerFrameSource; bank:ResidentFrameBank; loading:boolean; error:string|null };

/** Perform's slice jumps select original GPU-resident frames, without RIFE. */
export class PerformTimeSamplerFrames {
  readonly status = writable({pending:0,usedBytes:0,error:null as string|null});
  private device:GPUDevice|null=null;
  private budget:ResidentMemoryBudget|null=null;
  private height=-1;
  private limit=0;
  private entries=new Map<File|string,Entry>();
  private selected:OwnedVideoFrame|null=null;
  private selectedKey:File|string|null=null;
  private slot:string|null=null;
  private revision=0;
  private published={pending:0,usedBytes:0,error:null as string|null};

  readonly textureFor = (slot:string, source:SamplerFrameSource|null) =>
    slot === this.slot && source && (source.file??source.url) === this.selectedKey ? this.selected : null;
  get active() { return this.device !== null; }

  update(device:GPUDevice|null,sources:readonly SamplerFrameSource[],height:number,limit:number) {
    limit=Math.max(1,Math.floor(limit));
    if(device!==this.device||height!==this.height||limit!==this.limit) {
      this.dispose(); this.device=device; this.height=height; this.limit=limit;
      this.budget=new ResidentMemoryBudget(limit);
    }
    const wanted=new Set(sources.filter(s=>s.file||s.url).map(s=>s.file??s.url));
    for(const [key,entry] of this.entries)if(!wanted.has(key)) {
      entry.bank.dispose();this.entries.delete(key);
      if(this.selectedKey===key){this.selected=null;this.selectedKey=null;}
    }
    if(!device||!this.budget){this.publish();return;}
    for(const source of sources) {
      const key=source.file??source.url;
      if(!key||this.entries.has(key))continue;
      const entry:Entry={source,bank:new ResidentFrameBank(device,this.budget),loading:true,error:null};
      this.entries.set(key,entry);
      void entry.bank.load(key,()=>{},height).catch(error=>{
        if(this.entries.get(key)===entry)entry.error=error instanceof Error?error.message:String(error);
      }).finally(()=>{
        if(this.entries.get(key)===entry){entry.loading=false;this.publish();}
      });
    }
    this.publish();
  }

  select(slot:string,source:SamplerFrameSource|null,seconds:number):OwnedVideoFrame|null {
    this.slot=slot;
    const key=source?.file??source?.url;
    const entry=key?this.entries.get(key):null;
    const frame=entry?.bank.frameAt(seconds,'perform-timesampler');
    if(!entry||!frame){this.selected=null;this.selectedKey=null;return null;}
    if(this.selectedKey!==key||this.selected?.pts!==frame.pts)this.revision++;
    this.selectedKey=key!;
    this.selected={view:frame.view,pts:frame.pts,frameId:this.revision,
      width:entry.bank.width,height:entry.bank.height};
    return this.selected;
  }

  get diagnostics() {
    return {usedBytes:this.budget?.used??0,limit:this.limit,
      assets:[...this.entries.values()].map(e=>({name:e.source.name,loading:e.loading,error:e.error,...e.bank.stats})),
      selected:this.selected?{slot:this.slot,pts:this.selected.pts,frameId:this.selected.frameId}:null};
  }

  dispose() {
    for(const entry of this.entries.values())entry.bank.dispose();
    this.entries.clear();this.selected=null;this.selectedKey=null;this.slot=null;
    this.device=null;this.budget=null;this.height=-1;this.limit=0;
    this.publish();
  }

  private publish() {
    const next={pending:[...this.entries.values()].filter(e=>e.loading).length,
      usedBytes:this.budget?.used??0,error:[...this.entries.values()].find(e=>e.error)?.error??null};
    if(next.pending!==this.published.pending||next.usedBytes!==this.published.usedBytes||next.error!==this.published.error) {
      this.published=next;this.status.set(next);
    }
  }
}

export const performTimeSamplerFrames = new PerformTimeSamplerFrames();
export const performSamplerStatus = performTimeSamplerFrames.status;
