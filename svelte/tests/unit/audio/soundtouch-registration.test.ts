import { afterEach, expect, test, vi } from 'vitest';
const register=vi.hoisted(()=>vi.fn().mockResolvedValue(undefined));
vi.mock('@soundtouchjs/audio-worklet',()=>({SoundTouchNode:{register}}));
vi.mock('@soundtouchjs/audio-worklet/processor?url',()=>({default:'/processor.js'}));
import { ensureSoundTouchRegistered } from '$lib/audio/soundtouch';
afterEach(()=>{vi.unstubAllGlobals();register.mockClear();});
test('shares registration within a context but registers again for a replacement context',async()=>{
  vi.stubGlobal('AudioWorkletNode',class {});
  const first={} as AudioContext, replacement={} as AudioContext;
  expect(await Promise.all([ensureSoundTouchRegistered(first),ensureSoundTouchRegistered(first)])).toEqual([true,true]);
  expect(register).toHaveBeenCalledTimes(1);
  expect(await ensureSoundTouchRegistered(replacement)).toBe(true);
  expect(register).toHaveBeenCalledTimes(2);
  expect(register.mock.calls.map(c=>c[0])).toEqual([first,replacement]);
});
