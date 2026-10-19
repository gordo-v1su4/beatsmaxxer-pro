import type {NativeTimelineAsset,NativeTimelineFrame} from './nativeTimingVideo';

const escape=(text:string)=>text.replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]!));
const time=(seconds:number)=>`${Math.round(seconds*1000000)}/1000000s`;
const frameDuration=(fps:number)=>{
  for(const numerator of [24000,30000,60000,120000])if(Math.abs(fps-numerator/1001)<.002)return `1001/${numerator}s`;
  if(Number.isInteger(fps))return `1/${fps}s`;
  return time(1/fps);
};

/** FCPXML prototype: explicit native sample PTS, no reconstruction of musical triggers. */
export function resolveTimelineXml(options:{name:string;fps:24|30|60;width:number;height:number;
  assets:readonly NativeTimelineAsset[];frames:readonly NativeTimelineFrame[];audioName:string}){
  const {assets,frames,fps}=options;
  const outputTime=(seconds:number)=>`${Math.round(seconds*fps)}/${fps}s`;
  if(!frames.length)throw new Error('No resolved source frames for the timeline.');
  const names=new Set<string>();
  for(const asset of assets){
    if(/[\\/]/.test(asset.name))throw new Error('A source filename contains a path separator.');
    if(names.has(asset.name.toLowerCase()))throw new Error(`Two source clips share the filename ${asset.name}. Rename them before exporting a relinkable timeline.`);
    names.add(asset.name.toLowerCase());
  }
  const duration=frames.at(-1)!.at+1/fps;
  const mediaUrl=(name:string)=>escape(`./Media/${encodeURIComponent(name)}`);
  const runs:NativeTimelineFrame[][]=[];
  for(const frame of frames){
    const run=runs.at(-1),last=run?.at(-1),before=run?.at(-2);
    const delta=last?frame.seconds-last.seconds:0,previous=last&&before?last.seconds-before.seconds:0;
    if(!last||last.source!==frame.source||Math.abs(delta)>5/fps||delta*previous< -1e-9)runs.push([frame]);
    else run!.push(frame);
  }
  const resources=assets.map(asset=>`<format id="f${asset.id}" frameDuration="${frameDuration(asset.fps)}" width="${asset.width}" height="${asset.height}"/>
    <asset id="${asset.id}" name="${escape(asset.name)}" src="${mediaUrl(asset.name)}" start="${time(asset.start)}" duration="${time(asset.duration)}" hasVideo="1" hasAudio="0" format="f${asset.id}"/>`).join('\n');
  const media:string[]=[];
  const clips=runs.map((run,index)=>{
    const first=run[0],last=run.at(-1)!,duration=last.at-first.at+1/fps;
    const asset=assets.find(asset=>asset.id===first.source)!;
    const origin=Math.min(...run.map(frame=>frame.seconds));
    const sourceTime=(seconds:number)=>Number.isInteger(asset.fps)&&Math.abs(seconds*asset.fps-Math.round(seconds*asset.fps))<1e-4?`${Math.round(seconds*asset.fps)}/${asset.fps}s`:time(seconds);
    const rangeDuration=Math.max(...run.map(frame=>frame.seconds))-origin+1/asset.fps;
    const mediaId=`range${index}`;
    // Resolve normalizes retimed asset-clip in-points. An explicit source range
    // keeps that in-point in the nested clip, independent of the retime clock.
    media.push(`<media id="${mediaId}" name="${escape(asset.name)}"><sequence format="f${asset.id}" duration="${sourceTime(rangeDuration)}" tcStart="0s"><spine><asset-clip ref="${first.source}" offset="0s" start="${sourceTime(origin)}" duration="${sourceTime(rangeDuration)}"/></spine></sequence></media>`);
    const points=run.map(frame=>`<timept time="${outputTime(frame.at-first.at)}" value="${sourceTime(frame.seconds-origin)}" interp="linear"/>`);
    points.push(`<timept time="${outputTime(duration)}" value="${sourceTime(last.seconds-origin)}" interp="linear"/>`);
    return `<ref-clip ref="${mediaId}" name="${escape(asset.name)}" lane="1" offset="${outputTime(first.at)}" start="0s" duration="${outputTime(duration)}">
      <timeMap frameSampling="nearest-neighbor">${points.join('')}</timeMap></ref-clip>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.7"><resources>
  <format id="output" frameDuration="1/${fps}s" width="${options.width}" height="${options.height}"/>
  ${resources}
  ${media.join('\n')}
  <asset id="song" name="${escape(options.audioName)}" src="${mediaUrl(options.audioName)}" start="0s" duration="${outputTime(duration)}" hasAudio="1" audioSources="1" audioChannels="2" audioRate="48000"/>
</resources><library><event name="Beatsmaxxer"><project name="${escape(options.name)}">
<sequence format="output" duration="${outputTime(duration)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k"><spine><gap name="Timing take" offset="0s" start="0s" duration="${outputTime(duration)}">${clips}
<asset-clip ref="song" name="${escape(options.audioName)}" lane="-1" offset="0s" start="0s" duration="${outputTime(duration)}" audioRole="music"/>
</gap></spine></sequence>
</project></event></library></fcpxml>`;
}
