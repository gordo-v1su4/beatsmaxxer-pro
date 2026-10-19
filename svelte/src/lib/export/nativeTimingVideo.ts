import {ALL_FORMATS,BlobSource,Input,UrlSource,VideoSample,VideoSampleSink} from 'mediabunny';
import type {NativeExportVideo} from './finalizeRecording';

export interface NativeSourceFrame {source:File|string;seconds:number;name?:string;duration?:number;fps?:number;prepared?:boolean}
export interface NativeTimelineAsset {id:string;name:string;width:number;height:number;fps:number;duration:number;start:number;prepared?:boolean}
export interface NativeTimelineFrame {at:number;source:string;seconds:number;duration:number}

/** Bounded native decode, independent of preview dimensions and GPU proxy banks. */
export class NativeTimingVideo implements NativeExportVideo {
  width=0; height=0;
  readonly assets=new Map<File|string,NativeTimelineAsset>();
  readonly frames:NativeTimelineFrame[]=[];
  private inputs=new Map<File|string,{input:Input;sink:VideoSampleSink;start:number}>();
  private canvas:OffscreenCanvas|null=null;
  constructor(private resolve:(timestamp:number)=>Promise<NativeSourceFrame>,private signal:AbortSignal){}

  async prepare(){
    const first=await this.decode(await this.resolve(0));
    try{this.width=first.displayWidth;this.height=first.displayHeight;}finally{first.close();}
  }

  private async decode(frame:NativeSourceFrame){
    this.signal.throwIfAborted();
    let entry=this.inputs.get(frame.source);
    if(entry)this.inputs.delete(frame.source);
    else{
      const input=new Input({formats:ALL_FORMATS,source:typeof frame.source==='string'?new UrlSource(frame.source):new BlobSource(frame.source)});
      try{
        const track=await input.getPrimaryVideoTrack();
        if(!track||!await track.canDecode())throw new Error('The original clip cannot be decoded for export.');
        entry={input,sink:new VideoSampleSink(track),start:await track.getFirstTimestamp()};
      }catch(error){input.dispose();throw error;}
    }
    this.inputs.set(frame.source,entry);
    // Keep at most two active source decoders. No complete native clip atlas.
    while(this.inputs.size>2){const key=this.inputs.keys().next().value!;this.inputs.get(key)!.input.dispose();this.inputs.delete(key);}
    const sample=await entry.sink.getSample(entry.start+Math.max(0,frame.seconds));
    if(this.signal.aborted){sample?.close();this.signal.throwIfAborted();}
    if(!sample)throw new Error('An original source frame is unavailable. No proxy export was saved.');
    if(!this.assets.has(frame.source)){
      const id=`r${this.assets.size+2}`;
      const originalName=frame.name??(typeof frame.source==='string'?decodeURIComponent(frame.source.split('/').at(-1)!.split('?')[0]):frame.source.name);
      this.assets.set(frame.source,{id,
      name:frame.prepared?`${originalName.replace(/\.[^.]+$/,'')}.prepared-${id}.mp4`:originalName,
      width:sample.displayWidth,height:sample.displayHeight,fps:frame.fps??24,
      duration:frame.duration??Math.max(sample.timestamp+sample.duration,1),start:entry.start,prepared:frame.prepared});
    }
    return sample;
  }

  async frame(timestamp:number,duration:number):Promise<VideoSample>{
    const source=await this.resolve(timestamp),sample=await this.decode(source);
    this.frames.push({at:timestamp,source:this.assets.get(source.source)!.id,seconds:sample.timestamp,duration});
    if(sample.displayWidth===this.width&&sample.displayHeight===this.height){
      sample.setTimestamp(timestamp);sample.setDuration(duration);return sample;
    }
    try{
      this.canvas??=new OffscreenCanvas(this.width,this.height);
      const context=this.canvas.getContext('2d')!;
      context.fillStyle='#000';context.fillRect(0,0,this.width,this.height);
      const scale=Math.min(this.width/sample.displayWidth,this.height/sample.displayHeight);
      const width=sample.displayWidth*scale,height=sample.displayHeight*scale;
      sample.draw(context,(this.width-width)/2,(this.height-height)/2,width,height);
      return new VideoSample(this.canvas,{timestamp,duration});
    }finally{sample.close();}
  }

  dispose(){for(const {input} of this.inputs.values())input.dispose();this.inputs.clear();this.canvas=null;}
}
