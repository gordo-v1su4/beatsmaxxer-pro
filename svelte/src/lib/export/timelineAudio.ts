import {ALL_FORMATS,BlobSource,BufferTarget,Conversion,Input,Output,WavOutputFormat} from 'mediabunny';

/** Baked audio carries the same tempo, pitch, mix and repaired clock as the reference video. */
export async function timelineAudio(recording:Blob,signal:AbortSignal){
  const input=new Input({formats:ALL_FORMATS,source:new BlobSource(recording)});
  const output=new Output({format:new WavOutputFormat(),target:new BufferTarget()});
  let conversion:Conversion|undefined,cancellation:Promise<void>|undefined;
  const abort=()=>{cancellation??=conversion?.cancel();void cancellation?.catch(()=>{});};
  signal.addEventListener('abort',abort,{once:true});
  try{
    signal.throwIfAborted();
    conversion=await Conversion.init({input,output,video:{discard:true},audio:{codec:'pcm-s16'}});
    signal.throwIfAborted();
    if(!conversion.isValid)throw new Error('The processed song audio could not be exported.');
    await conversion.execute();signal.throwIfAborted();
    if(!output.target.buffer?.byteLength)throw new Error('The processed song audio is empty.');
    return new Blob([output.target.buffer],{type:'audio/wav'});
  }finally{
    signal.removeEventListener('abort',abort);
    try{if(cancellation)await cancellation;else if(conversion&&conversion.state!=='done'&&conversion.state!=='canceled')await conversion.cancel();else if(!conversion)await output.cancel();}
    finally{input.dispose();}
  }
}
