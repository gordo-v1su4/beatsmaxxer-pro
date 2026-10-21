import { normalizeTimingRamp } from '$lib/runtime/timing/rampPresets';
import { derived, get, writable } from 'svelte/store';
import { defaultClipTiming, normalizePoints, type ClipTiming, type CurveShape } from '$lib/runtime/timing/envelope';
import { defaultTimingTrigger, TRIGGER_SOURCES, type TimingTriggerConfig } from '$lib/runtime/timing/triggers';
import { arrangementMode } from '$lib/arrangement/transportMode';

const KEY = 'beatsmaxxer.timing.v1';
const PRESET_KEY = 'beatsmaxxer.timing.preset.v1';
const HOT_KEY = 'beatsmaxxer.timing.hmr.v1';
// Isolated browser acceptance sessions must not overwrite the user's curves.
const transientQa = import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('qaTimingTransient');
const slotPattern = /^(top|bottom)-[0-5]$/;
export const DEFAULT_TIMING_BUDGET_GIB = 12;
export const TIMING_BUDGET_OPTIONS = [.25,1,2,4,8,12,20,24,32];
export interface TimingSettings { version: 1; capacityRevision: 1; clips: Record<string, ClipTiming>; budgetGiB: number; outputFps: number; preloadHeight:number; trigger: TimingTriggerConfig; cutOrder?:'balanced'|'random'; scope?: 'global'|'deck'; master?: ClipTiming; deckTriggers?: Record<string,TimingTriggerConfig> }
const initial = (): TimingSettings => ({ version: 1, capacityRevision: 1, clips: {}, budgetGiB: DEFAULT_TIMING_BUDGET_GIB, outputFps: 24, preloadHeight:0, trigger:defaultTimingTrigger(),scope:'global',master:defaultClipTiming('top-0') });
const finite = (n: unknown, fallback: number, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) ? Math.max(min,Math.min(max,n)) : fallback;

export function parseTimingSettings(raw: string | null): TimingSettings {
  const result = initial();
  try {
    const value = JSON.parse(raw || 'null');
    if (value?.version !== 1) return result;
    result.cutOrder=value.cutOrder==='random'?'random':'balanced';
    result.scope=value.scope==='global'?'global':'deck';
    if(value.master)result.master=parseTimingSettings(JSON.stringify({version:1,clips:{'top-0':value.master}})).clips['top-0'];
    result.deckTriggers={};
    for(const [slot,trigger] of Object.entries(value.deckTriggers??{}))if(slotPattern.test(slot))result.deckTriggers[slot]=parseTimingSettings(JSON.stringify({version:1,trigger})).trigger;
    // Each origin has separate storage. Migrate the old default once, including
    // previously visited localhost/Tailscale URLs. Subsequent explicit 8 GiB
    // selections carry this revision and remain user-controlled.
    result.budgetGiB = value.capacityRevision !== 1 && value.budgetGiB === 8
      ? DEFAULT_TIMING_BUDGET_GIB : finite(value.budgetGiB,DEFAULT_TIMING_BUDGET_GIB,0.25,32);
    result.outputFps = [24,30,60].includes(value.outputFps) ? value.outputFps : 24;
    result.preloadHeight=[270,360,540,720].includes(value.preloadHeight)?value.preloadHeight:0;
    const t=value.trigger;
    if(t && typeof t==='object'){
      result.trigger={...result.trigger,
        source:TRIGGER_SOURCES.some(([id])=>id===t.source)?t.source:result.trigger.source,
        channel:typeof t.channel==='string'?t.channel:'all',
density:finite(t.density,100,10,100),repeatStyle:t.repeatStyle==='fixed'?'fixed':'energy',
        everyBeats:finite(t.everyBeats,4,.125,64),rampChance:finite(t.rampChance,40,0,100),stutterChance:finite(t.stutterChance,100,0,100),
        gapSeconds:finite(t.gapSeconds,.12,0,30),threshold:finite(t.threshold,.45,0,1),seed:Math.round(finite(t.seed,42,0,0xffffffff))};
    }
    for (const [slot, untyped] of Object.entries(value.clips ?? {})) {
      if (!slotPattern.test(slot) || !untyped || typeof untyped !== 'object') continue;
      const c = untyped as ClipTiming, next = defaultClipTiming(slot);
      next.effect = ['ramp','stutter','timesampler','off'].includes(c.effect) ? c.effect : 'ramp';
      next.lastEffect = next.effect !== 'off' ? next.effect : c.lastEffect === 'timesampler' ? 'timesampler' : c.lastEffect === 'stutter' ? 'stutter' : 'ramp';
      next.ramp.cycleBeats = finite(c.ramp?.cycleBeats,2,0.125,32);
      next.ramp.cycleMode = c.ramp?.cycleMode === 'random' ? 'random' : 'fixed';
      const cycleChoices = Array.isArray(c.ramp?.cycleChoices) ? c.ramp.cycleChoices.filter(n => typeof n === 'number' && Number.isFinite(n) && n >= .125 && n <= 32).slice(0,4) : [];
      next.ramp.cycleChoices = cycleChoices.length ? cycleChoices : [1,2,4,8];
      const shapes: CurveShape[] = ['linear','smooth','tension','hold','sine'];
      next.ramp.shape = shapes.includes(c.ramp?.shape) ? c.ramp.shape : 'smooth';
      if (Array.isArray(c.ramp?.points) && c.ramp.points.length >= 2) {
        const pts = normalizePoints(c.ramp.points.slice(0,128).filter(p => p && typeof p.id === 'string' && Number.isFinite(p.x) && Number.isFinite(p.y)));
        if (pts.length >= 2) {
          pts[0].x = 0; pts[pts.length-1].x = 1;
          next.ramp.points = pts;
        }
      }
      if (c.ramp?.legacy && typeof c.ramp.legacy === 'object') {
        next.ramp.legacy = Object.fromEntries(Object.entries(c.ramp.legacy).filter(([,v]) => Number.isFinite(v)));
      }
      next.stutter.division = finite(c.stutter?.division,0.5,0.125,4);
      next.stutter.repeats = Math.round(finite(c.stutter?.repeats,4,1,16));
      next.stutter.slices = Math.round(finite(c.stutter?.slices,8,1,64));
      next.stutter.mode = ['repeat','hold','jump'].includes(c.stutter?.mode) ? c.stutter.mode : 'repeat';
      next.stutter.groove = ['straight','swing','dotted'].includes(c.stutter?.groove??'') ? c.stutter.groove : 'straight';
      const controls=c.sampler?.controls;
      for(const key of ['size','rate','chance','mix'])next.sampler.controls[key]=finite(controls?.[key],next.sampler.controls[key],0,100);
      next.sampler.controls.slices=Math.round(finite(controls?.slices,8,1,64));
      next.sampler.controls.loops=Math.round(finite(controls?.loops,1,1,16));
      next.sampler.controls.mode=Math.round(finite(controls?.mode,0,0,5));
      next.sampler.controls.accent=Math.round(finite(controls?.accent,0,0,2));
      next.sampler.groove = ['straight','swing','dotted'].includes(c.sampler?.groove) ? c.sampler.groove : 'straight';
      next.sampler.behavior = c.sampler?.behavior==='phrase'?'phrase':c.sampler?.behavior==='continuous'?'continuous':'hit';
      next.sampler.launchBeats = c.sampler?.launchBeats===4?4:1;
      next.sampler.retrigger = c.sampler?.retrigger==='restart'?'restart':'finish';
      result.clips[slot] = { ...next, ramp: normalizeTimingRamp(next.ramp) };
    }
  } catch { /* Old or malformed storage never prevents opening the workspace. */ }
  return result;
}

function readSettings() {
  if(import.meta.hot){
    if(import.meta.hot.data.settings)return parseTimingSettings(JSON.stringify(import.meta.hot.data.settings));
    try{
      const saved=JSON.parse(sessionStorage.getItem(HOT_KEY)||'null');sessionStorage.removeItem(HOT_KEY);
      if(saved?.url===location.href&&Date.now()-saved.at<30000)return parseTimingSettings(JSON.stringify(saved.settings));
    }catch{}
  }
  if (transientQa) return readTimingPreset()??initial();
  try { return parseTimingSettings(typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)); }
  catch { return initial(); }
}
export const timingSettings = writable<TimingSettings>(readSettings());
export const timingPresetStatus=writable('');
export function readTimingPreset():TimingSettings|null {
  try{const raw=localStorage.getItem(PRESET_KEY);return raw?parseTimingSettings(raw):null;}catch{return null;}
}
export function saveTimingPreset(){
  if(get(arrangementMode)!=='live')return;
  try{localStorage.setItem(PRESET_KEY,JSON.stringify(get(timingSettings)));timingPresetStatus.set('PRESET SAVED');}
  catch{timingPresetStatus.set('STORAGE UNAVAILABLE');}
}
export function loadTimingPreset(){
  if(get(arrangementMode)!=='live')return;
  const preset=readTimingPreset();
  if(!preset){timingPresetStatus.set('NO SAVED PRESET');return;}
  endTimingGesture();remember({settings:structuredClone(get(timingSettings))});
  timingSettings.set(preset);timingPresetStatus.set('PRESET LOADED');
}
if(import.meta.hot){
  import.meta.hot.dispose(data=>{data.settings=structuredClone(get(timingSettings));});
  import.meta.hot.on('vite:beforeFullReload',()=>{
    try{sessionStorage.setItem(HOT_KEY,JSON.stringify({url:location.href,at:Date.now(),settings:get(timingSettings)}));}catch{}
  });
}
export const selectedTimingSlot = writable('top-0');
export const timingEditorCollapsed = writable(false);
export const timingEditorTab = derived([timingSettings, selectedTimingSlot], ([settings, slot]) => {
  const config = settings.clips[slot] ?? defaultClipTiming(slot);
  return config.effect === 'off' ? config.lastEffect ?? 'ramp' : config.effect;
});
export const timingActive = writable(false);
export const timingClipRestrictions = writable<Record<string,string>>({});
export const RIFE_RAMP_ONLY = 'This RIFE clip needs a Speedramp slot or Timesampler. Load an original clip for Stutter.';
export function allowTimingClip(slot:string, factor:number, config=clipTiming(slot)) {
  const effect=config.effect;
  const allowed=factor<=1 || effect!=='stutter';
  timingClipRestrictions.update(s=>s[slot]===(allowed?'':RIFE_RAMP_ONLY)?s:({...s,[slot]:allowed?'':RIFE_RAMP_ONLY}));
  return allowed;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
timingSettings.subscribe(value => {
  if (transientQa) return;
  if (typeof localStorage === 'undefined') return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY,JSON.stringify(value)); } catch {} },150);
});
const effectiveCache=new WeakMap<TimingSettings,Map<string,ClipTiming>>();
export function effectiveClipTiming(settings: TimingSettings, slot: string) {
  let cached=effectiveCache.get(settings);
  if(!cached){cached=new Map();effectiveCache.set(settings,cached);}
  const hit=cached.get(slot);if(hit)return hit;
  const clip=settings.clips[slot]??defaultClipTiming(slot);
  const result=settings.scope!=='deck'&&settings.master?{...clip,ramp:settings.master.ramp,stutter:settings.master.stutter,sampler:settings.master.sampler}:clip;
  cached.set(slot,result);return result;
}
export function effectiveTimingTrigger(settings: TimingSettings, slot: string) {
  return settings.scope==='deck'?settings.deckTriggers?.[slot]??settings.trigger:settings.trigger;
}
/** Musical triggers own PGM; its independent interval controls are inactive. */
export function timingPgmFollowsTriggers(settings: TimingSettings, usableSlots: readonly string[]) {
  return usableSlots.some(slot=>effectiveClipTiming(settings,slot).effect!=='off'
    && !['pgm','beat','continuous'].includes(effectiveTimingTrigger(settings,slot).source));
}
export function clipTiming(slot: string) { return effectiveClipTiming(get(timingSettings),slot); }
export function setClipTiming(slot: string, config: ClipTiming) {
  if(get(arrangementMode)!=='live')return;
  if (!slotPattern.test(slot)) return;
  if(!allowTimingClip(slot,get(timingStatus)[slot]?.interpolationFactor??1,config))return;
  const previous = clipTiming(slot);
  const next = { ...config, lastEffect: config.effect === 'off' ? previous.lastEffect ?? (previous.effect === 'stutter' ? 'stutter' : 'ramp') : config.effect };
  if (JSON.stringify(previous) === JSON.stringify(next)) return;
  if(get(timingSettings).scope!=='deck'){
    if(gesture?.slot!==slot){endTimingGesture();remember({settings:structuredClone(get(timingSettings))});}
    timingSettings.update(s=>({...s,master:next,clips:{...s.clips,[slot]:{...(s.clips[slot]??defaultClipTiming(slot)),effect:next.effect,lastEffect:next.lastEffect}}}));
    return;
  }
  if (gesture?.slot !== slot) {
    if (gesture) endTimingGesture();
    remember({ slot, config: structuredClone(previous) });
  }
  applyClip(slot, next);
}

type ClipEdit = { slot: string; config: ClipTiming };
type TimingEdit = ClipEdit | { trigger: TimingTriggerConfig } | {settings:TimingSettings};
const undo: TimingEdit[] = [], redo: TimingEdit[] = [];
let gesture: (ClipEdit & {settings?:TimingSettings}) | null = null;
export const canUndoTiming = writable(false), canRedoTiming = writable(false);
const notifyHistory = () => { canUndoTiming.set(undo.length > 0); canRedoTiming.set(redo.length > 0); };
function applyClip(slot: string, config: ClipTiming) {
  timingSettings.update(s => ({ ...s, clips: { ...s.clips, [slot]: { ...config, ramp: normalizeTimingRamp(config.ramp) } } }));
}
function remember(edit: TimingEdit) {
  undo.push(edit); if (undo.length > 60) undo.shift(); redo.length = 0; notifyHistory();
}
export function beginTimingGesture(slot = get(selectedTimingSlot)) {
  if (gesture) endTimingGesture();
  gesture = { slot, config: structuredClone(clipTiming(slot)),settings:get(timingSettings).scope==='global'?structuredClone(get(timingSettings)):undefined };
}
export function endTimingGesture() {
  if (!gesture) return;
  const before = gesture; gesture = null;
  if (JSON.stringify(before.config) !== JSON.stringify(clipTiming(before.slot))) remember(before.settings?{settings:before.settings}:{slot:before.slot,config:before.config});
}
export function setTimingTrigger(patch: Partial<TimingTriggerConfig>) {
  if(get(arrangementMode)!=='live')return;
  const settings=get(timingSettings),slot=get(selectedTimingSlot);
  const previous = effectiveTimingTrigger(settings,slot);
  const next = { ...previous, ...patch };
  if (JSON.stringify(previous) === JSON.stringify(next)) return;
  endTimingGesture();
  remember({ settings: structuredClone(settings) });
  timingSettings.update(s => s.scope==='deck'?{...s,deckTriggers:{...s.deckTriggers,[slot]:next}}:({ ...s, trigger: next }));
}
export function setTimingScope(scope:'global'|'deck') {
  if(get(arrangementMode)!=='live')return;
  if(get(timingSettings).scope===scope)return;
  endTimingGesture();remember({settings:structuredClone(get(timingSettings))});
  timingSettings.update(s=>({...s,scope,master:scope==='global'?(s.master??structuredClone(effectiveClipTiming(s,get(selectedTimingSlot)))):s.master}));
}
export function setTimingCutOrder(cutOrder:'balanced'|'random') {
  if(get(arrangementMode)!=='live'||(get(timingSettings).cutOrder??'balanced')===cutOrder)return;
  endTimingGesture();remember({settings:structuredClone(get(timingSettings))});
  timingSettings.update(s=>({...s,cutOrder}));
}
function moveHistory(from: TimingEdit[], to: TimingEdit[]) {
  if(get(arrangementMode)!=='live')return;
  endTimingGesture();
  const edit = from.pop(); if (!edit) return;
  if ('settings' in edit) {
    to.push({settings:structuredClone(get(timingSettings))});timingSettings.set(edit.settings);notifyHistory();return;
  }
  if ('trigger' in edit) {
    to.push({ trigger: structuredClone(get(timingSettings).trigger) });
    timingSettings.update(s => ({ ...s, trigger: edit.trigger }));
    notifyHistory(); return;
  }
  to.push({ slot: edit.slot, config: structuredClone(clipTiming(edit.slot)) });
  applyClip(edit.slot, edit.config); selectedTimingSlot.set(edit.slot); notifyHistory();
}
export const undoTiming = () => moveHistory(undo, redo);
export const redoTiming = () => moveHistory(redo, undo);
export function resetTimingHistory() { undo.length = 0; redo.length = 0; gesture = null; notifyHistory(); }
export function toggleTimingBypass(slot: string) {
  const config = clipTiming(slot);
  setClipTiming(slot, { ...config, effect: config.effect === 'off' ? config.lastEffect ?? 'ramp' : 'off' });
}

export interface TimingSlotStatus {
  state: 'queued' | 'loading' | 'ready' | 'error';
  frames: number; total: number; bytes: number; message?: string; fps?: number;
  interpolationFactor?: number;
  requiredBytes?: number;
}
export const timingStatus = writable<Record<string, TimingSlotStatus>>({});
/** Actual resident allocations include shared clips and cached song sections. */
export const timingCacheCapacity = writable({ usedBytes: 0, requiredBytes: 0, pending: 0 });
export const timingSceneErrors=writable<Record<string,string>>({});
export interface TimingLive { samplerQueuedAt?: number|null; samplerNormal?: number; samplerTrace?: readonly {normal:number;source:number}[]; sourceDurationSeconds?: number; sourceTimelineSeconds?: number; phase: number; rate: number; sourceSeconds: number; pts: number; state?: 'waiting'|'burst'|'gap'|'continuous'; triggerTime?: number|null; burstEnd?: number|null; time?:number; beat?:number }
export const timingLive = writable<Record<string, TimingLive>>({});
export const timingSchedules = writable<Record<string, import('$lib/runtime/timing/triggers').TimingBurst[]>>({});
export const timingSceneStatus=writable<Record<string,{state:'loading'|'ready'|'error';message?:string}>>({});
