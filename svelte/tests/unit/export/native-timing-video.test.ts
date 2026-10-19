import {beforeEach,expect,test,vi} from 'vitest';
const fixture=vi.hoisted(()=>({inputs:[] as any[],requests:[] as number[],width:1280,height:720,abort:null as AbortController|null}));
vi.mock('mediabunny',()=>({
  ALL_FORMATS:[],BlobSource:class{constructor(public file:File){}},UrlSource:class{constructor(public url:string){}},VideoSample:class{},
  Input:class{dispose=vi.fn();constructor(public options:any){fixture.inputs.push(this);}async getPrimaryVideoTrack(){return {canDecode:async()=>true,getFirstTimestamp:async()=>0};}},
  VideoSampleSink:class{async getSample(seconds:number){fixture.requests.push(seconds);fixture.abort?.abort();return {displayWidth:fixture.width,displayHeight:fixture.height,
    close:vi.fn(),timestamp:seconds,duration:1/24,setTimestamp(value:number){this.timestamp=value;},setDuration(value:number){this.duration=value;}};}},
}));
import {NativeTimingVideo} from '$lib/export/nativeTimingVideo';
beforeEach(()=>{fixture.inputs=[];fixture.requests=[];fixture.abort=null;});

test('reads original File pixels at requested reverse timestamps, independent of proxy resolution',async()=>{
  const original=new File(['native media'],'original-720.mp4');
  const resolve=vi.fn(async(timestamp:number)=>({source:original,seconds:8-timestamp}));
  const video=new NativeTimingVideo(resolve,new AbortController().signal);
  await video.prepare();
  const frame=await video.frame(1.25,1/24);
  expect([video.width,video.height]).toEqual([1280,720]);
  expect(fixture.inputs[0].options.source.file).toBe(original);
  expect(fixture.requests).toEqual([8,6.75]);
  expect(frame.timestamp).toBe(1.25);
  frame.close();video.dispose();expect(fixture.inputs[0].dispose).toHaveBeenCalledOnce();
});

test('bounds source decoders to two and closes them on completion',async()=>{
  const video=new NativeTimingVideo(async t=>({source:`https://media.example/${t}.mp4`,seconds:0}),new AbortController().signal);
  await video.prepare();
  (await video.frame(1,1/24)).close();(await video.frame(2,1/24)).close();
  expect(fixture.inputs[0].dispose).toHaveBeenCalledOnce();
  expect(fixture.inputs[1].dispose).not.toHaveBeenCalled();
  video.dispose();expect(fixture.inputs.every(input=>input.dispose.mock.calls.length===1)).toBe(true);
});

test('cancels native decoding without substituting preview frames',async()=>{
  const controller=new AbortController();fixture.abort=controller;
  const video=new NativeTimingVideo(async()=>({source:'https://media.example/source.mp4',seconds:0}),controller.signal);
  await expect(video.prepare()).rejects.toThrow();video.dispose();
  expect(fixture.inputs[0].dispose).toHaveBeenCalledOnce();
});
