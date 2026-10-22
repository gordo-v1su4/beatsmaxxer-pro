import { beforeEach, describe, expect, it, vi } from 'vitest';
const harness=vi.hoisted(()=>({banks:[] as any[]}));
vi.mock('$lib/runtime/timing/ResidentFrameBank',()=>({
  ResidentMemoryBudget:class {used=0;constructor(public limit:number){}},
  ResidentFrameBank:class {
    ready=false; width=480;height=270;stats={};view={};dispose=vi.fn();
    resolve!:()=>void;reject!:(error:Error)=>void;
    load=vi.fn(()=>new Promise<void>((resolve,reject)=>{this.resolve=()=>{this.ready=true;resolve();};this.reject=reject;}));
    frameAt=vi.fn((seconds:number)=>this.ready?{view:this.view,pts:Math.floor(seconds*24)/24}:null);
    constructor(public device:unknown,public budget:unknown){harness.banks.push(this);}
  }
}));
import { PerformTimeSamplerFrames } from '$lib/runtime/PerformTimeSamplerFrames';
const source={name:'original.webm',url:'blob:original'};
const device={} as GPUDevice;
beforeEach(()=>{harness.banks.length=0;});
describe('Perform sampler original-frame ownership',()=>{
  it('loads a shared original only once and advances identity only when the selected frame changes',async()=>{
    const cache=new PerformTimeSamplerFrames();
    cache.update(device,[source,source],270,1000);
    expect(harness.banks).toHaveLength(1);
    expect(cache.select('top-3',source,1)).toBeNull();
    harness.banks[0].resolve();await Promise.resolve();
    const first=cache.select('top-3',source,1)!;
    expect(cache.select('top-3',source,1.001)?.frameId).toBe(first.frameId);
    expect(cache.select('top-3',source,1.1)?.frameId).toBeGreaterThan(first.frameId);
    expect(cache.textureFor('top-3',{...source,url:'blob:replacement'})).toBeNull();
    expect(cache.textureFor('top-2',source)).toBeNull();
    expect(harness.banks[0].budget.limit).toBe(1000);
    cache.dispose();expect(harness.banks[0].dispose).toHaveBeenCalledOnce();
  });
  it('cancels removed and inactive loads and ignores their late completion',async()=>{
    const cache=new PerformTimeSamplerFrames();cache.update(device,[source],270,1000);
    const bank=harness.banks[0];cache.dispose();bank.resolve();
    await Promise.resolve();await Promise.resolve();
    expect(cache.diagnostics.assets).toEqual([]);
    expect(cache.textureFor('top-3',source)).toBeNull();
    expect(bank.dispose).toHaveBeenCalledOnce();
    expect(cache.active).toBe(false);
  });
  it('releases old banks before changing the available memory budget',()=>{
    const cache=new PerformTimeSamplerFrames();cache.update(device,[source],270,1000);
    cache.update(device,[source],270,500);
    expect(harness.banks[0].dispose).toHaveBeenCalledOnce();
    expect(harness.banks[1].budget.limit).toBe(500);
    cache.dispose();
  });
});
