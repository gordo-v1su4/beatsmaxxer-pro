import {expect,test,vi} from 'vitest';

const fixture=vi.hoisted(()=>({dispose:vi.fn(),init:vi.fn(),cancelOutput:vi.fn(),videoDuration:0,audioSample:null as any,audioSamples:[] as any[],packetTimes:null as number[]|null}));
vi.mock('mediabunny',()=>({
  ALL_FORMATS:[],BlobSource:class{},BufferTarget:class{buffer=new ArrayBuffer(8);},
  Input:class{dispose=fixture.dispose;async getPrimaryVideoTrack(){return {computeDuration:async()=>fixture.videoDuration};}async getPrimaryAudioTrack(){return {computeDuration:async()=>fixture.audioSample?.timestamp??0};}},
  AudioSampleSink:class{async getSample(){return fixture.audioSample;}async *samples(){yield* fixture.audioSamples;}},
  EncodedPacketSink:class{async *packets(){yield* fixture.packetTimes?.map(timestamp=>({timestamp}))??fixture.audioSamples;}},
  Output:class{target={buffer:new ArrayBuffer(8)};cancel=fixture.cancelOutput;},
  Mp4OutputFormat:class{},WebMOutputFormat:class{},Conversion:{init:fixture.init},
}));
import {finalizeRecording} from '$lib/export/finalizeRecording';

test('permits discarded empty packets on a healthy clock but refuses an ambiguous drift repair',async()=>{
  vi.clearAllMocks();fixture.videoDuration=.12;
  fixture.audioSamples=[0,.06].map(timestamp=>({timestamp,duration:.06,close:vi.fn()}));
  fixture.packetTimes=[0,0,.06];fixture.audioSample={timestamp:.06,duration:.06,close:vi.fn()};
  fixture.init.mockResolvedValue({state:'done',isValid:true,discardedTracks:[],execute:vi.fn(async()=>{}),cancel:vi.fn()});
  try{
    await finalizeRecording(new Blob(['recording']),24,{signal:new AbortController().signal,onProgress:()=>{}});
    expect(fixture.init.mock.calls[0][0].audio).toBeUndefined();
    fixture.packetTimes=[0,0,1.06];fixture.init.mockClear();
    await expect(finalizeRecording(new Blob(['recording']),24,{signal:new AbortController().signal,onProgress:()=>{}})).rejects.toThrow('could not be synchronized');
    expect(fixture.init).not.toHaveBeenCalled();
  }finally{fixture.videoDuration=0;fixture.audioSample=null;fixture.audioSamples=[];fixture.packetTimes=null;}
});

test('normalizes stalled capture audio and produces constant-rate video on the same clock',async()=>{
  vi.clearAllMocks();fixture.videoDuration=2;
  fixture.audioSamples=[0,.06,.92,.98].map(timestamp=>({timestamp,duration:.06,close:vi.fn()}));
  fixture.audioSample={timestamp:.98,duration:.06,close:vi.fn()};
  fixture.init.mockResolvedValue({state:'done',isValid:true,discardedTracks:[],execute:vi.fn(async()=>{}),cancel:vi.fn()});
  try{
    await finalizeRecording(new Blob(['recording']),24,{signal:new AbortController().signal,onProgress:()=>{}});
    const config=fixture.init.mock.calls[0][0];
    expect(config.audio.process).toBeTypeOf('function');
    const audio={timestamp:.92,duration:.06,setTimestamp(value:number){this.timestamp=value;}};
    config.audio.process(audio);config.audio.process(audio);config.audio.process(audio);expect(audio.timestamp).toBeCloseTo(.12);
    const frame=(timestamp:number):any=>({timestamp,duration:1/24,clone(){return frame(this.timestamp);},setTimestamp(value:number){this.timestamp=value;},setDuration(value:number){this.duration=value;}});
    const output=[0,.5,1,1.5,23/12].flatMap(time=>config.video.process(frame(time))??[]);
    expect(output.map((sample:any)=>sample.timestamp)).toEqual([0,1/24,2/24,3/24,4/24,5/24]);
    expect(output.every((sample:any)=>sample.duration===1/24)).toBe(true);
    expect(fixture.audioSamples.every(sample=>sample.close.mock.calls.length===1)).toBe(true);
  }finally{fixture.videoDuration=0;fixture.audioSample=null;fixture.audioSamples=[];}
});

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
