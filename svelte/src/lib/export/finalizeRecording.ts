import { ALL_FORMATS, AudioSampleSink, BlobSource, BufferTarget, Conversion, EncodedPacketSink, Input, Mp4OutputFormat, Output, VideoSample, WebMOutputFormat } from 'mediabunny';
import { CaptureClock } from './captureClock';

/** Canvas capture is variable-rate even when captureStream receives an FPS. */
export async function finalizeRecording(recording:Blob,fps:24|30|60,options:{signal:AbortSignal;onProgress:(progress:number)=>void}):Promise<Blob>{
  options.signal.throwIfAborted();
  const mp4=recording.type==='video/mp4';
  const input=new Input({formats:ALL_FORMATS,source:new BlobSource(recording)});
  const output=new Output({format:mp4?new Mp4OutputFormat():new WebMOutputFormat(),target:new BufferTarget()});
  let conversion:Conversion|undefined;
  let previousFrame:VideoSample|undefined;
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
    const clock=new CaptureClock();
    const audioDurations:number[]=[];
    let audioStart=0;
    if(audioTrack){
      for await(const sample of new AudioSampleSink(audioTrack).samples()){
        try{
          options.signal.throwIfAborted();
          if(!audioDurations.length)audioStart=sample.timestamp;
          audioDurations.push(sample.duration);
        }finally{sample.close();}
      }
      // The decoder has already made PCM continuous; the demuxer's packet
      // durations may include capture gaps. Pair raw PTS with decoded durations.
      const packetTimes:number[]=[];
      for await(const packet of new EncodedPacketSink(audioTrack).packets(undefined,undefined,{metadataOnly:true})){
        options.signal.throwIfAborted();
        packetTimes.push(packet.timestamp);
      }
      if(packetTimes.length===audioDurations.length){
        packetTimes.forEach((timestamp,index)=>clock.add(timestamp,audioDurations[index]));
      }else{
        // Some decoders discard empty packets. Healthy recordings do not need
        // a one-to-one mapping; only reject when drift needs an unsafe repair.
        const decodedEnd=audioStart+audioDurations.reduce((sum,duration)=>sum+duration,0);
        const encodedEnd=(packetTimes.at(-1)??0)+(audioDurations.at(-1)??0);
        if(Math.abs(encodedEnd-decodedEnd)>0.1)throw new Error('Audio capture samples could not be synchronized. Try exporting again.');
      }
    }
    options.signal.throwIfAborted();
    if(clock.drifted)mediaEnd=clock.end;
    let padded=false;
    let nextFrame=0;
    const process=clock.drifted?(sample:VideoSample)=>{
      // MediaRecorder can timestamp audio by wall time while an overloaded
      // audio device stalls. Keep video on the captured PCM clock, including
      // real silent audio, and snap the result back to explicit CFR frames.
      const atEnd=sample.timestamp+1/fps>=videoEnd-1e-6;
      const frames:VideoSample[]=[];
      const emitUntil=(end:number,source:VideoSample)=>{
        while(nextFrame/fps<end-1e-6){
          const frame=source.clone();frame.setTimestamp(nextFrame++/fps);frame.setDuration(1/fps);frames.push(frame);
        }
      };
      emitUntil(Math.min(clock.map(sample.timestamp),mediaEnd),previousFrame??sample);
      previousFrame?.close();previousFrame=sample.clone();
      if(atEnd)emitUntil(mediaEnd,previousFrame);
      return frames;
    }:mediaEnd>videoEnd+1e-6?(sample:VideoSample)=>{
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
    let audioTime=audioStart;
    conversion=await Conversion.init({input,output,video:{frameRate:fps,bitrate:fps===60?16000000:10000000,process},
      audio:clock.drifted?{process:sample=>{sample.setTimestamp(audioTime);audioTime+=sample.duration;return sample;}}:undefined});
    options.signal.throwIfAborted();
    if(!conversion.isValid||conversion.discardedTracks.length)throw new Error('This browser cannot finalize all recorded audio/video tracks. No incomplete export was saved.');
    conversion.onProgress=progress=>options.onProgress(Math.max(0,Math.min(1,progress)));
    await conversion.execute();
    options.signal.throwIfAborted();
    const buffer=output.target.buffer;
    if(!buffer?.byteLength)throw new Error('Video finalization returned an empty file.');
    return new Blob([buffer],{type:mp4?'video/mp4':'video/webm'});
  }finally{
    previousFrame?.close();
    options.signal.removeEventListener('abort',abort);
    try{
      if(cancellation)await cancellation;
      else if(conversion&&conversion.state!=='done'&&conversion.state!=='canceled')await conversion.cancel();
      if(!conversion)await output.cancel();
    }finally{input.dispose();}
  }
}
