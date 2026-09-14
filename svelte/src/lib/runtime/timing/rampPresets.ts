import { defaultClipTiming, evaluateRamp, rateToY, type RampConfig } from './envelope';

// Same cubic controls as Perform's shape bank: y0,x1,y1,x2,y2,y3.
const curves:Record<string,number[]>={
  FLAT:[50,33,50,66,50,50],UP:[0,40,15,70,85,100],DOWN:[100,30,85,60,15,0],
  S:[0,78,2,22,98,100],DIP:[100,35,0,65,0,100],BUMP:[0,35,100,65,100,0],
  'LATE+':[50,80,50,92,64,100],'LATE-':[50,80,50,92,36,0],
  'EASE+':[100,8,64,20,50,50],'EASE-':[0,8,36,20,50,50],
  'INV-S':[0,90,100,10,0,100],SLAM:[0,96,0,99,100,100]
};
export const RAMP_PRESET_NAMES=['COSINE','SMASH',...Object.keys(curves)];
export function rampPreset(name:string,cycleBeats=2):RampConfig {
  if(name==='COSINE')return {...defaultClipTiming().ramp,shape:'sine',cycleBeats,points:[
    {id:'start',x:0,y:rateToY(.5),tension:0},{id:'peak',x:.5,y:rateToY(2),tension:0},
    {id:'end',x:1,y:rateToY(.5),tension:0}]};
  if(name==='SMASH')return {cycleBeats:16,shape:'hold',points:[
    {id:'start',x:0,y:rateToY(.25),tension:0},{id:'hit',x:12/16,y:rateToY(4),tension:0},
    {id:'release',x:13/16,y:rateToY(1),tension:0},{id:'end',x:1,y:rateToY(1),tension:0}]};
  const values=curves[name]??curves.UP;
  const legacy=Object.fromEntries(['bzY0','bzX1','bzY1','bzX2','bzY2','bzY3'].map((k,i)=>[k,values[i]]));
  const ramp:RampConfig={cycleBeats,shape:'smooth',legacy:{...legacy,spdMin:25,spdMax:75},points:[]};
  // Editable samples sit on the exact legacy curve; editing a point materializes it.
  const anchors=name==='S'?[0,.35,.65,1]:name==='INV-S'?[0,.25,.5,.75,1]:
    name.startsWith('LATE')?[0,.8,1]:name.startsWith('EASE')?[0,.2,1]:name==='SLAM'?[0,.96,1]:[0,.5,1];
  ramp.points=anchors.map((x,i)=>({id:`p${i}`,x,y:rateToY(evaluateRamp(ramp,x)),tension:0}));
  return ramp;
}
export function rampRange(ramp:RampConfig){
  const rates=Array.from({length:257},(_,i)=>evaluateRamp(ramp,i/256));
  return {min:Math.min(...rates),max:Math.max(...rates)};
}
/** Rescale the actual editable curve; no disconnected limits or clipping of peaks. */
export function scaleRampRange(ramp:RampConfig,min:number,max:number):RampConfig {
  min=Math.max(.25,Math.min(4,min));max=Math.max(min,Math.min(4,max));
  const range=rampRange(ramp);
  if(range.max-range.min<1e-8){const value=Math.abs(min-range.min)>1e-8?min:max;return {...ramp,legacy:undefined,points:ramp.points.map(p=>({...p,y:rateToY(value)}))};}
  const points=ramp.legacy?Array.from({length:33},(_,i)=>({id:`p${i}`,x:i/32,y:rateToY(evaluateRamp(ramp,i/32)),tension:0})):ramp.points;
  return {...ramp,legacy:undefined,points:points.map(p=>({...p,y:rateToY(min+(max-min)*(range.max-range.min>1e-8?(evaluateRamp(ramp,p.x)-range.min)/(range.max-range.min):.5))}))};
}
export const RAMP_PREVIEW_PATHS=Object.fromEntries(RAMP_PRESET_NAMES.map(name=>{
  const ramp=rampPreset(name);
  const range=rampRange(ramp),span=Math.max(.001,range.max-range.min);
  return [name,Array.from({length:129},(_,i)=>`${i?'L':'M'}${2+i/128*60},${range.max===range.min?12:22-(evaluateRamp(ramp,i/128)-range.min)/span*20}`).join(' ')];
}));
