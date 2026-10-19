import {zip,strToU8} from 'fflate';
import {resolveTimelineXml} from './resolveTimeline';
import {timelineAudio} from './timelineAudio';
import type {NativeTimingVideo} from './nativeTimingVideo';

export async function resolveBundle(reference:Blob,video:NativeTimingVideo,fps:24|30|60,signal:AbortSignal){
  const assets=[...video.assets.values()];
  const xml=resolveTimelineXml({name:'Beatsmaxxer Timing take',fps,width:video.width,height:video.height,assets,frames:video.frames,audioName:'beatsmaxxer-song.wav'});
  const audio=await timelineAudio(reference,signal);
  const files:Record<string,Uint8Array>={
    'timeline.fcpxml':strToU8(xml),'reference.webm':new Uint8Array(await reference.arrayBuffer()),
    'Media/beatsmaxxer-song.wav':new Uint8Array(await audio.arrayBuffer()),
    'source-manifest.json':strToU8(JSON.stringify({version:1,fps,assets,frames:video.frames},null,2)),
    'README.txt':strToU8('Resolve timeline prototype\n\n1. Extract this ZIP.\n2. Put the referenced original clips into Media, or relink their folder in Resolve. Your originals are not copied. Prepared interpolation files are included when used.\n3. Import timeline.fcpxml with File > Import > Timeline.\n4. Compare against reference.webm, particularly reverse, holds, jumps and speed ramps. Use nearest/floor frame sampling; disable optical flow for this comparison.\n\nThe WAV contains the exported song with its tempo, pitch and mix already applied.\nTested with a 40.9-second 720p/24 Timing take in Resolve 21.1.1, including both sampler retrigger modes and prepared interpolation files. Check your own media and arrangement against the reference. WebGPU shader effects are not represented; Timing only.\n'),
  };
  for(const [source,asset] of video.assets){
    signal.throwIfAborted();
    if(asset.prepared){
      if(typeof source==='string')throw new Error('Prepared media must be available locally before exporting a Resolve bundle.');
      if(/[\\/]/.test(asset.name))throw new Error('A source filename contains a path separator. Rename it before exporting.');
      files[`Media/${asset.name}`]=new Uint8Array(await source.arrayBuffer());
    }
  }
  signal.throwIfAborted();
  const bytes=await new Promise<Uint8Array>((resolve,reject)=>{
    const abort=()=>{terminate();reject(signal.reason??new Error('Export cancelled.'));};
    const terminate=zip(files,{level:0},(error,data)=>{signal.removeEventListener('abort',abort);if(error)reject(error);else resolve(data);});
    signal.addEventListener('abort',abort,{once:true});
  });
  signal.throwIfAborted();
  return new Blob([new Uint8Array(bytes).buffer],{type:'application/zip'});
}
