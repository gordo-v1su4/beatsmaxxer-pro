import { ALL_FORMATS, AudioSampleSink, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, VideoSample, WebMOutputFormat } from 'mediabunny';

/** Canvas capture is variable-rate even when captureStream receives an FPS. */
export async function finalizeRecording(recording:Blob,fps:24|30|60,options:{signal:AbortSignal;onProgress:(progress:number)=>void}):Promise<Blob>{
  options.signal.throwIfAborted();
  const mp4=recording.type==='video/mp4';
  const input=new Input({formats:ALL_FORMATS,source:new BlobSource(recording)});
  const output=new Output({format:mp4?new Mp4OutputFormat():new WebMOutputFormat(),target:new BufferTarget()});
  let conversion:Conversion|undefined;
  let cancellation:Promise<void>|undefined;
  const abort=()=>{cancellation??=conversion?.cancel();void cancellation?.catch(()=>{});};
  options.signal.addEventListener('abort',abort,{once:true});
  try{
    const [videoTrack,audioTrack]=await Promise.all([input.getPrimaryVideoTrack(),input.getPrimaryAudioTrack()]);
    const videoEnd=videoTrack?await videoTrack.computeDuration():0;
    let mediaEnd=videoEnd;
    if(audioTrack){
      const last=await new AudioSampleSink(audioTrack).getSample(await audioTrack.computeDuration());
      if(last){try{mediaEnd=Math.max(mediaEnd,last.timestamp+last.duration);}finally{last.close();}}
    }
    options.signal.throwIfAborted();
    let padded=false;
    const process=mediaEnd>videoEnd+1e-6?(sample:VideoSample)=>{
      if(padded||sample.timestamp+1/fps<videoEnd-1e-6)return sample;
      padded=true;sample.setDuration(1/fps);
      const frames=[sample];
      // Canvas capture can stop before the last audio packet. Preserve the
      // player's existing final-frame hold as explicit constant-rate frames.
      for(let index=Math.round(sample.timestamp*fps)+1;index/fps<mediaEnd-1e-6;index++){
        const held=sample.clone();held.setTimestamp(index/fps);held.setDuration(1/fps);frames.push(held);
      }
      return frames;
    }:undefined;
    conversion=await Conversion.init({input,output,video:{frameRate:fps,bitrate:fps===60?16000000:10000000,process}});
    options.signal.throwIfAborted();
    if(!conversion.isValid||conversion.discardedTracks.length)throw new Error('This browser cannot finalize all recorded audio/video tracks. No incomplete export was saved.');
    conversion.onProgress=progress=>options.onProgress(Math.max(0,Math.min(1,progress)));
    await conversion.execute();
    options.signal.throwIfAborted();
    const buffer=output.target.buffer;
    if(!buffer?.byteLength)throw new Error('Video finalization returned an empty file.');
    return new Blob([buffer],{type:mp4?'video/mp4':'video/webm'});
  }finally{
    options.signal.removeEventListener('abort',abort);
    try{
      if(cancellation)await cancellation;
      else if(conversion&&conversion.state!=='done'&&conversion.state!=='canceled')await conversion.cancel();
      if(!conversion)await output.cancel();
    }finally{input.dispose();}
  }
}
