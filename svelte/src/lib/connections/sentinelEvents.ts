import type { TimingChannel, TimingEvent } from '$lib/runtime/timing/triggers';

export const LIGHT_ROLES = ['Drums', 'Vocals', 'Synth / Keys', 'Backing vocals'] as const;
export const LIGHT_TARGETS = ['Off', 'Drums · floor / terrace', 'Vocals · moving heads', 'Synth · pixel chase', 'Backing vocals · accents', 'Keys · wing movement'] as const;
export function defaultLightTarget(name:string):number {
  if(/back.*vocal/i.test(name))return 4;
  if(/\bvocals?\b/i.test(name))return 2;
  if(/\bdrums?\b/i.test(name))return 1;
  if(/\bsynths?\b/i.test(name))return 3;
  if(/\bkeys?\b|keyboard|piano/i.test(name))return 5;
  return 0;
}
export function defaultLightChannels(channels: readonly TimingChannel[]): string[] {
  const find = (pattern: RegExp) => channels.find(c => pattern.test(c.name))?.name ?? '';
  return [find(/\bdrums?\b/i), find(/\bvocals?\b/i) && (channels.find(c => /\bvocals?\b/i.test(c.name) && !/back/i.test(c.name))?.name ?? ''), find(/\bsynths?\b/i) || find(/\bkeys?\b|keyboard|piano/i), find(/back.*vocal/i)];
}

/** Chords/transcription clusters are one attack, with the strongest velocity. */
export function lightEvents(events: readonly TimingEvent[]): TimingEvent[] {
  const out: TimingEvent[] = [];
  for (const e of [...events].sort((a,b)=>a.time-b.time)) {
    if (!Number.isFinite(e.time) || !Number.isFinite(e.strength) || e.time < 0) continue;
    const previous = out.at(-1);
    if (previous && e.time - previous.time <= .025) previous.strength = Math.max(previous.strength, e.strength);
    else out.push({time:e.time, strength:Math.max(0, Math.min(1,e.strength))});
  }
  return out;
}
function upperBound(events: readonly TimingEvent[], time: number) {
  let lo=0, hi=events.length;
  while(lo<hi) { const mid=(lo+hi)>>>1; if(events[mid].time<=time)lo=mid+1; else hi=mid; }
  return lo;
}
export class LightEventCursor {
  private previous: number | null = null;
  private generation = -1;
  private cursor = 0;
  private lastHit = -Infinity;
  count = 0;
  envelope = 0;
  phase = 1;
  constructor(readonly events: readonly TimingEvent[]) {}
  sample(position: number, generation: number, playing: boolean, wallSeconds: number, threshold: number, gapSeconds: number, decaySeconds: number) {
    // Re-anchor instead of replaying skipped notes after a seek, loop or pause.
    if (this.previous === null || generation !== this.generation || position < this.previous || !playing) {
      this.cursor=upperBound(this.events,position-.001);
      this.previous=position; this.generation=generation; this.lastHit=-Infinity;
      this.envelope=0; this.phase=1;
      return;
    }
    while(this.cursor<this.events.length && this.events[this.cursor].time<=position) {
      const event=this.events[this.cursor++];
      if (event.time >= this.previous-.001 && event.strength >= threshold && wallSeconds-this.lastHit>=gapSeconds) {
        this.count++; this.envelope=event.strength; this.lastHit=wallSeconds;
      }
    }
    this.previous=position;
    const age=wallSeconds-this.lastHit;
    this.phase=Math.min(1,age/Math.max(.02,decaySeconds));
    this.envelope = age>=decaySeconds ? 0 : this.envelope;
  }
}
