import { computeSpeedRampRate } from '$lib/runtime/speedramp';

export type CurveShape = 'linear' | 'smooth' | 'tension' | 'hold' | 'sine';
export type Snap = 'off' | 'bar' | 'beat' | '16th' | '32nd' | '64th';
export interface CurvePoint { id: string; x: number; y: number; tension: number }
export interface RampConfig {
  cycleBeats: number;
  shape: CurveShape;
  points: CurvePoint[];
  legacy?: Record<string, number>;
}
export interface StutterConfig { division: number; repeats: number; mode: 'repeat' | 'hold' | 'jump'; slices: number; groove?: 'straight' | 'swing' | 'dotted' }
export interface ClipTiming { effect: 'ramp' | 'stutter' | 'off'; lastEffect?: 'ramp' | 'stutter'; ramp: RampConfig; stutter: StutterConfig }
export const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
export const rateToY = (rate: number) => clamp01((rate - 0.25) / 3.75);
export const yToRate = (y: number) => 0.25 + clamp01(y) * 3.75;

export function defaultClipTiming(slot?: string): ClipTiming {
  const index = slot && /^(top|bottom)-[0-4]$/.test(slot)
    ? Number(slot.split('-')[1]) + (slot.startsWith('bottom') ? 5 : 0) : 0;
  const effect = index % 2 === 0 ? 'ramp' : 'stutter';
  return {
    effect,
    lastEffect: effect,
    // Smooth editable default; the COSINE preset retains the exact R&D curve.
    ramp: { cycleBeats: 2, shape: 'smooth', points: [
      { id: 'start', x: 0, y: rateToY(1), tension: 0 },
      { id: 'peak', x: 0.5, y: rateToY(2), tension: 0 },
      { id: 'end', x: 1, y: rateToY(1), tension: 0 }
    ] },
    stutter: { division: 0.5, repeats: 4, mode: 'repeat', slices: 8 }
  };
}

export function normalizePoints(points: CurvePoint[]): CurvePoint[] {
  const result: CurvePoint[] = [];
  for (const point of points.map(p => ({ ...p, x: clamp01(p.x), y: clamp01(p.y),
    tension: Math.max(-1, Math.min(1, Number.isFinite(p.tension) ? p.tension : 0)) })).sort((a,b) => a.x-b.x)) {
    if (result.length && Math.abs(result[result.length-1].x - point.x) < 1e-6) result[result.length-1] = point;
    else result.push(point);
  }
  return result;
}

export const SNAP_BEATS = { bar: 4, beat: 1, '16th': 0.25, '32nd': 0.125, '64th': 0.0625 };
export function snapRate(rate: number): number { return Math.round(rate*4)/4; }
export function snapPosition(x: number, snap: Snap, cycleBeats: number) {
  if (snap === 'off') return clamp01(x);
  const beats = SNAP_BEATS[snap];
  const step = beats / Math.max(0.125, cycleBeats);
  return clamp01(Math.round(x / step) * step);
}

/** Keep dragged anchors on a free grid line, never nearly stacked on a neighbour. */
export function constrainPointX(points: CurvePoint[], index: number, x: number, snap: Snap, cycleBeats: number): number {
  if (index === 0) return 0;
  if (index === points.length-1) return 1;
  const left=points[index-1].x, right=points[index+1].x;
  if(snap==='off') return Math.max(left+.001,Math.min(right-.001,clamp01(x)));
  const step=SNAP_BEATS[snap]/cycleBeats;
  const min=(Math.floor((left+1e-9)/step)+1)*step;
  const max=(Math.ceil((right-1e-9)/step)-1)*step;
  if(min>max+1e-9)return points[index].x;
  return Math.max(min,Math.min(max,snapPosition(x,snap,cycleBeats)));
}

// Monotone cubic tangents shared by display and playback. Rising intermediate
// anchors keep their slope; extrema flatten without overshooting adjacent rates.
function smoothTangent(points: CurvePoint[], i: number): number {
  if(i===0 || i===points.length-1)return 0;
  const h0=points[i].x-points[i-1].x,h1=points[i+1].x-points[i].x;
  if(h0<=0 || h1<=0)return 0;
  const d0=(points[i].y-points[i-1].y)/h0,d1=(points[i+1].y-points[i].y)/h1;
  if(d0*d1<=0)return 0;
  const w0=2*h1+h0,w1=h1+2*h0;
  return (w0+w1)/(w0/d0+w1/d1);
}
function smoothCoefficients(points: CurvePoint[], i:number) {
  const a=points[i],b=points[i+1],h=b.x-a.x,delta=b.y-a.y;
  const m0=smoothTangent(points,i)*h,m1=smoothTangent(points,i+1)*h;
  return [a.y,m0,3*delta-2*m0-m1,-2*delta+m0+m1];
}

export function evaluateRamp(ramp: RampConfig, phase: number): number {
  const x = clamp01(phase);
  if (ramp.legacy) return computeSpeedRampRate(Math.min(x,1-1e-9) * 4, { ...ramp.legacy, len: 36 });
  const points = ramp.points;
  if (!points.length) return 1;
  if (x <= points[0].x) return yToRate(points[0].y);
  if (x >= points[points.length-1].x) return yToRate(points[points.length-1].y);
  let i = 0;
  while (i < points.length-2 && x >= points[i+1].x) i++;
  const a = points[i], b = points[i+1];
  let t = (x-a.x) / Math.max(1e-9,b.x-a.x);
  if(ramp.shape==='smooth'){
    const [c0,c1,c2,c3]=smoothCoefficients(points,i);
    return yToRate(c0+t*(c1+t*(c2+t*c3)));
  }
  if (ramp.shape === 'hold') t = 0;
  else if (ramp.shape === 'sine') t = (1-Math.cos(Math.PI*t))/2;
  else if (ramp.shape === 'tension') {
    const power = a.tension >= 0 ? 1+a.tension*9 : 1/(1-a.tension*9);
    t = Math.pow(t,power);
  }
  return yToRate(a.y+(b.y-a.y)*t);
}

/** Integral of rate over normalized phase, including complete repeated cycles. */
export function integratedRamp(ramp: RampConfig, phase: number): number {
  const cycles = Math.floor(phase), fraction = phase-cycles;
  function area(end:number) {
    if (ramp.legacy) {
      const steps=128,dx=end/steps;
      let sum=0;
      for(let i=0;i<steps;i++)sum+=evaluateRamp(ramp,(i+.5)*dx)*dx;
      return sum;
    }
    const points=ramp.points;
    if(!points.length)return end;
    let sum=Math.min(end,points[0].x)*yToRate(points[0].y);
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1],length=b.x-a.x;
      if(end<=a.x || length<=0)break;
      const t=Math.min(1,(end-a.x)/length);
      if(ramp.shape==='smooth'){
        const [c0,c1,c2,c3]=smoothCoefficients(points,i);
        sum+=length*(.25*t+3.75*(c0*t+c1*t*t/2+c2*t**3/3+c3*t**4/4));
        continue;
      }
      let blend=t*t/2;
      if(ramp.shape==='hold')blend=0;
      else if(ramp.shape==='sine')blend=(t-Math.sin(Math.PI*t)/Math.PI)/2;
      else if(ramp.shape==='tension'){const power=a.tension>=0?1+a.tension*9:1/(1-a.tension*9);blend=t**(power+1)/(power+1);}
      sum+=length*(yToRate(a.y)*t+(yToRate(b.y)-yToRate(a.y))*blend);
    }
    const last=points[points.length-1];
    return sum+Math.max(0,end-last.x)*yToRate(last.y);
  }
  return cycles*area(1)+area(fraction);
}
