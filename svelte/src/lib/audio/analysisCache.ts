import { studioToRhythmAnalysis, type StudioAudioV1 } from './studioJobs';
import type { EssentiaRhythmAnalysis } from './essentia';
const KEY='beatsmaxxer.analysis.v1:';
export async function songAnalysisHash(file:File){
  const bytes=await file.arrayBuffer();
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function cachedSongAnalysis(hash:string):Promise<EssentiaRhythmAnalysis|null>{
  try{
    const value=JSON.parse(localStorage.getItem(KEY+hash)||'null') as EssentiaRhythmAnalysis|null;
    if(value?.verified&&value.structure?.sections.length&&value.beats.length>1)return value;
  }catch{}
  try{
    const response=await fetch('/presets/redline-studio.json');if(!response.ok)return null;
    const cached=await response.json() as {sourceSha256:string;result:StudioAudioV1};
    if(cached.sourceSha256!==hash)return null;
    return studioToRhythmAnalysis(cached.result);
  }catch{return null;}
}
export function saveSongAnalysis(hash:string,result:EssentiaRhythmAnalysis){
  if(!result.verified||!result.structure?.sections.length)return;
  try{localStorage.setItem(KEY+hash,JSON.stringify(result));}catch{}
}
