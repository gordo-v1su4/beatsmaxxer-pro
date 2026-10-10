import { expect, test, vi } from 'vitest';
import { recallScene } from '$lib/arrangement/sectionScenes';

const mocks=vi.hoisted(()=>({register:vi.fn(async()=>({status:'success'}))}));
vi.mock('$lib/runtime/media/MediaRuntime',()=>({mediaRuntime:{
  registerModuleClip:mocks.register,registerModuleFileClip:mocks.register
}}));

test('initial recall primes registration even when no rack clips need changing',async()=>{
  await expect(recallScene({slots:{}})).resolves.toEqual({loaded:0,failed:[]});
  expect(mocks.register).not.toHaveBeenCalled();
  const next=recallScene({slots:{'top-0':{name:'chorus.mp4',url:'/chorus.mp4'}}});
  expect(mocks.register).toHaveBeenCalledWith('top-0','chorus.mp4','/chorus.mp4');
  await expect(next).resolves.toEqual({loaded:1,failed:[]});
});
