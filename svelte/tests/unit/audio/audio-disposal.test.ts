import { expect,test,vi } from 'vitest';
import { AudioEngine } from '$lib/audio/AudioEngine';
import { audioTimeline } from '$lib/transport/AudioTimeline';

test('disposing a replaced engine stops detached media and closes its audio context exactly once',async()=>{
  const unsubscribe=vi.fn();
  const subscription=vi.spyOn(audioTimeline,'subscribe').mockReturnValue(unsubscribe);
  const engine=new AudioEngine();subscription.mockRestore();
  const media={pause:vi.fn(),load:vi.fn(),currentTime:2,src:'blob:old'};
  const source={stop:vi.fn(),disconnect:vi.fn()};
  const gain={disconnect:vi.fn()};
  const context={state:'running',currentTime:1,sampleRate:48000,close:vi.fn(async()=>{})};
  Object.assign(engine,{ctx:context,mediaElement:media,sourceNode:source,gainNode:gain,_playing:true});
  await engine.dispose();await engine.dispose();
  expect(media.pause).toHaveBeenCalled();expect(media.src).toBe('');
  expect(source.stop).toHaveBeenCalledOnce();expect(source.disconnect).toHaveBeenCalledOnce();
  expect(gain.disconnect).toHaveBeenCalledOnce();expect(context.close).toHaveBeenCalledOnce();
  expect(unsubscribe).toHaveBeenCalledOnce();expect(engine.getProofPlaybackDiagnostics().playing).toBe(false);
});
