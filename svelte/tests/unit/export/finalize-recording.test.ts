import {expect,test,vi} from 'vitest';

const fixture=vi.hoisted(()=>({dispose:vi.fn(),init:vi.fn(),cancelOutput:vi.fn(),videoDuration:0,audioSample:null as any}));
vi.mock('mediabunny',()=>({
  ALL_FORMATS:[],BlobSource:class{},BufferTarget:class{buffer=new ArrayBuffer(8);},
  Input:class{dispose=fixture.dispose;async getPrimaryVideoTrack(){return {computeDuration:async()=>fixture.videoDuration};}async getPrimaryAudioTrack(){return {computeDuration:async()=>fixture.audioSample?.timestamp??0};}},
  AudioSampleSink:class{async getSample(){return fixture.audioSample;}},
  Output:class{target={buffer:new ArrayBuffer(8)};cancel=fixture.cancelOutput;},
  Mp4OutputFormat:class{},WebMOutputFormat:class{},Conversion:{init:fixture.init},
}));
import {finalizeRecording} from '$lib/export/finalizeRecording';

test('keeps constant-rate video frames through the final decoded audio sample',async()=>{
  vi.clearAllMocks();fixture.videoDuration=1;
  const close=vi.fn();fixture.audioSample={timestamp:1.065,duration:.06,close};
  const conversion={state:'done',isValid:true,discardedTracks:[],execute:vi.fn(async()=>{}),cancel:vi.fn(async()=>{})};
  fixture.init.mockResolvedValue(conversion);
  function frame(timestamp:number){return {timestamp,duration:1/24,clone(){return frame(this.timestamp);},setTimestamp(value:number){this.timestamp=value;},setDuration(value:number){this.duration=value;}};}
  try{
    await finalizeRecording(new Blob(['recording']),24,{signal:new AbortController().signal,onProgress:()=>{}});
    const process=fixture.init.mock.calls[0][0].video.process;
    expect(process).toBeTypeOf('function');
    expect(process(frame(.5))).toMatchObject({timestamp:.5});
    const tail=process(frame(23/24));
    expect(tail.map((sample:any)=>sample.timestamp)).toEqual([23/24,1,25/24,26/24]);
    expect(tail.every((sample:any)=>sample.duration===1/24)).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  }finally{fixture.videoDuration=0;fixture.audioSample=null;}
});

test('cancellation during audio-tail inspection closes the sample and input without starting conversion',async()=>{
  vi.clearAllMocks();
  let release!:(sample:any)=>void;const close=vi.fn();
  fixture.audioSample=new Promise(resolve=>{release=resolve;});
  const controller=new AbortController();
  const running=finalizeRecording(new Blob(['recording']),24,{signal:controller.signal,onProgress:()=>{}});
  const rejected=expect(running).rejects.toThrow();
  try{
    await Promise.resolve();await Promise.resolve();await Promise.resolve();
    controller.abort();release({timestamp:0,duration:.06,close});
    await rejected;
    expect(close).toHaveBeenCalledOnce();
    expect(fixture.init).not.toHaveBeenCalled();
    expect(fixture.dispose).toHaveBeenCalledOnce();
    expect(fixture.cancelOutput).toHaveBeenCalledOnce();
  }finally{fixture.audioSample=null;}
});

test('awaits one cancellation before disposing the input',async()=>{
  vi.clearAllMocks();
  let rejectExecute!:(error:Error)=>void,finishCancel!:()=>void;
  const conversion={state:'executing',isValid:true,discardedTracks:[],
    execute:vi.fn(()=>new Promise<void>((_resolve,reject)=>{rejectExecute=reject;})),
    cancel:vi.fn(()=>{
      conversion.state='canceled';rejectExecute(new Error('cancelled'));
      return new Promise<void>(resolve=>{finishCancel=resolve;});
    }),
  };
  fixture.init.mockResolvedValue(conversion);
  const controller=new AbortController();
  const result=finalizeRecording(new Blob(['recording']),24,{signal:controller.signal,onProgress:()=>{}});
  const rejected=expect(result).rejects.toThrow('cancelled');
  await vi.waitFor(()=>expect(conversion.execute).toHaveBeenCalledOnce());
  controller.abort();
  expect(fixture.dispose).not.toHaveBeenCalled();
  finishCancel();
  await rejected;
  expect(conversion.cancel).toHaveBeenCalledOnce();
  expect(fixture.dispose).toHaveBeenCalledOnce();
});

test('rejects a conversion that would silently discard recorded audio',async()=>{
  vi.clearAllMocks();
  const conversion={state:'idle',isValid:true,discardedTracks:[{track:{type:'audio'}}],execute:vi.fn(),cancel:vi.fn(async()=>{})};
  fixture.init.mockResolvedValue(conversion);
  await expect(finalizeRecording(new Blob(['recording']),24,{signal:new AbortController().signal,onProgress:()=>{}}))
    .rejects.toThrow('all recorded audio/video tracks');
  expect(conversion.execute).not.toHaveBeenCalled();
  expect(conversion.cancel).toHaveBeenCalledOnce();
  expect(fixture.dispose).toHaveBeenCalledOnce();
});
