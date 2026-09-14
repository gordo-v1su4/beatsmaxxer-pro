import { derived, get, writable } from 'svelte/store';
import { defaultClipTiming, normalizePoints, type ClipTiming, type CurveShape } from '$lib/runtime/timing/envelope';
import { defaultTimingTrigger, TRIGGER_SOURCES, type TimingTriggerConfig } from '$lib/runtime/timing/triggers';

const KEY = 'beatsmaxxer.timing.v1';
// Isolated browser acceptance sessions must not overwrite the user's curves.
const transientQa = import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('qaTimingTransient');
const slotPattern = /^(top|bottom)-[0-4]$/;
export const DEFAULT_TIMING_BUDGET_GIB = 12;
export const TIMING_BUDGET_OPTIONS = [.25,1,2,4,8,12,20,24,32];
export interface TimingSettings { version: 1; capacityRevision: 1; clips: Record<string, ClipTiming>; budgetGiB: number; outputFps: number; preloadHeight:number; trigger: TimingTriggerConfig }
const initial = (): TimingSettings => ({ version: 1, capacityRevision: 1, clips: {}, budgetGiB: DEFAULT_TIMING_BUDGET_GIB, outputFps: 24, preloadHeight:0, trigger:defaultTimingTrigger() });
const finite = (n: unknown, fallback: number, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) ? Math.max(min,Math.min(max,n)) : fallback;

export function parseTimingSettings(raw: string | null): TimingSettings {
  const result = initial();
  try {
    const value = JSON.parse(raw || 'null');
    if (value?.version !== 1) return result;
    // Each origin has separate storage. Migrate the old default once, including
    // previously visited localhost/Tailscale URLs. Subsequent explicit 8 GiB
    // selections carry this revision and remain user-controlled.
    result.budgetGiB = value.capacityRevision !== 1 && value.budgetGiB === 8
      ? DEFAULT_TIMING_BUDGET_GIB : finite(value.budgetGiB,DEFAULT_TIMING_BUDGET_GIB,0.25,32);
    result.outputFps = [24,30,60].includes(value.outputFps) ? value.outputFps : 24;
    result.preloadHeight=[360,540,720].includes(value.preloadHeight)?value.preloadHeight:0;
    const t=value.trigger;
    if(t && typeof t==='object'){
      result.trigger={...result.trigger,
        source:TRIGGER_SOURCES.some(([id])=>id===t.source)?t.source:result.trigger.source,
        channel:typeof t.channel==='string'?t.channel:'all',
        everyBeats:finite(t.everyBeats,4,.125,64),rampChance:finite(t.rampChance,40,0,100),stutterChance:finite(t.stutterChance,100,0,100),
        gapSeconds:finite(t.gapSeconds,.12,0,30),threshold:finite(t.threshold,.45,0,1),seed:Math.round(finite(t.seed,42,0,0xffffffff))};
    }
    for (const [slot, untyped] of Object.entries(value.clips ?? {})) {
      if (!slotPattern.test(slot) || !untyped || typeof untyped !== 'object') continue;
      const c = untyped as ClipTiming, next = defaultClipTiming(slot);
      next.effect = ['ramp','stutter','off'].includes(c.effect) ? c.effect : 'ramp';
      next.lastEffect = next.effect !== 'off' ? next.effect : c.lastEffect === 'stutter' ? 'stutter' : 'ramp';
      next.ramp.cycleBeats = finite(c.ramp?.cycleBeats,2,0.125,32);
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
      result.clips[slot] = next;
    }
  } catch { /* Old or malformed storage never prevents opening the workspace. */ }
  return result;
}

function readSettings() {
  if (transientQa) return initial();
  try { return parseTimingSettings(typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)); }
  catch { return initial(); }
}
export const timingSettings = writable<TimingSettings>(readSettings());
export const selectedTimingSlot = writable('top-0');
export const timingEditorCollapsed = writable(false);
export const timingEditorTab = derived([timingSettings, selectedTimingSlot], ([settings, slot]) => {
  const config = settings.clips[slot] ?? defaultClipTiming(slot);
  return config.effect === 'off' ? config.lastEffect ?? 'ramp' : config.effect;
});
export const timingActive = writable(false);

let saveTimer: ReturnType<typeof setTimeout> | undefined;
timingSettings.subscribe(value => {
  if (transientQa) return;
  if (typeof localStorage === 'undefined') return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY,JSON.stringify(value)); } catch {} },150);
});
export function clipTiming(slot: string) { return get(timingSettings).clips[slot] ?? defaultClipTiming(slot); }
export function setClipTiming(slot: string, config: ClipTiming) {
  if (!slotPattern.test(slot)) return;
  const previous = clipTiming(slot);
  const next = { ...config, lastEffect: config.effect === 'off' ? previous.lastEffect ?? (previous.effect === 'stutter' ? 'stutter' : 'ramp') : config.effect };
  if (JSON.stringify(previous) === JSON.stringify(next)) return;
  if (gesture?.slot !== slot) {
    if (gesture) endTimingGesture();
    remember({ slot, config: structuredClone(previous) });
  }
  applyClip(slot, next);
}

type ClipEdit = { slot: string; config: ClipTiming };
const undo: ClipEdit[] = [], redo: ClipEdit[] = [];
let gesture: ClipEdit | null = null;
export const canUndoTiming = writable(false), canRedoTiming = writable(false);
const notifyHistory = () => { canUndoTiming.set(undo.length > 0); canRedoTiming.set(redo.length > 0); };
function applyClip(slot: string, config: ClipTiming) {
  timingSettings.update(s => ({ ...s, clips: { ...s.clips, [slot]: config } }));
}
function remember(edit: ClipEdit) {
  undo.push(edit); if (undo.length > 60) undo.shift(); redo.length = 0; notifyHistory();
}
export function beginTimingGesture(slot = get(selectedTimingSlot)) {
  if (gesture) endTimingGesture();
  gesture = { slot, config: structuredClone(clipTiming(slot)) };
}
export function endTimingGesture() {
  if (!gesture) return;
  const before = gesture; gesture = null;
  if (JSON.stringify(before.config) !== JSON.stringify(clipTiming(before.slot))) remember(before);
}
function moveHistory(from: ClipEdit[], to: ClipEdit[]) {
  endTimingGesture();
  const edit = from.pop(); if (!edit) return;
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
export interface TimingLive { phase: number; rate: number; sourceSeconds: number; pts: number; state?: 'waiting'|'burst'|'gap'|'continuous'; triggerTime?: number|null; burstEnd?: number|null; time?:number; beat?:number }
export const timingLive = writable<Record<string, TimingLive>>({});
export const timingSchedules = writable<Record<string, import('$lib/runtime/timing/triggers').TimingBurst[]>>({});
