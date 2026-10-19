import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { get, type Writable } from 'svelte/store';

const fixture = vi.hoisted(() => ({
  position: 0,
  constructorFails: false,
  videoTrack: { stop: vi.fn() },
  release: vi.fn(),
  restoreLoop: vi.fn(),
  captureStream: vi.fn(),
  getCanvas: vi.fn(),
  audio: {
    createCaptureStream: vi.fn(), stop: vi.fn(), seek: vi.fn(), start: vi.fn(),
    suspendTrackLooping: vi.fn(),
  },
  download: vi.fn(),
  finalize: vi.fn(),
  prime: vi.fn(),
}));

vi.mock('$lib/audio', () => ({ audioEngine: fixture.audio }));
vi.mock('$lib/export/finalizeRecording',()=>({finalizeRecording:fixture.finalize}));
vi.mock('$lib/export/nativeTimingTake',()=>({prepareNativeTimingTake:vi.fn(async()=>null)}));
vi.mock('$lib/rendering/webgpu/WebGpuEngine', () => ({
  PGM_MONITOR_ID: 'pgm-monitor',
  webGpuEngine: { getCanvas: fixture.getCanvas },
}));
vi.mock('$lib/transport', () => ({ audioTimeline: { getPositionSeconds: () => fixture.position } }));
vi.mock('$lib/stores/arrangement', async () => {
  const { writable } = await import('svelte/store');
  return { arrangementLoopRegion: writable(null) };
});
vi.mock('$lib/stores/transportDisplay', async () => {
  const { writable } = await import('svelte/store');
  return { transportDisplay: writable({ duration: 180, bpm: 125, playing: false }) };
});
vi.mock('$lib/runtime/timing/readiness', async () => {
  const { writable } = await import('svelte/store');
  return { timingPreparationBlocked: writable(false) };
});
vi.mock('$lib/stores/timing', async () => {
  const { writable } = await import('svelte/store');
  return { timingStatus: writable({}),timingCacheCapacity:writable({pending:0}),timingSceneErrors:writable({}) };
});
vi.mock('$lib/arrangement/transportMode', async () => {
  const { writable } = await import('svelte/store');
  return { arrangementMode: writable('live'), arrangementOverridden: writable(false), setArrangementMode: vi.fn() };
});
vi.mock('$lib/arrangement/takeSnapshot', () => ({ applyTakeAt: vi.fn() }));
vi.mock('$lib/arrangement/playbackCut',()=>({primeTakePgmAt:fixture.prime}));

import { arrangementLoopRegion } from '$lib/stores/arrangement';
import { transportDisplay } from '$lib/stores/transportDisplay';
import { arrangementMode, arrangementOverridden, setArrangementMode, type ArrangementMode } from '$lib/arrangement/transportMode';
import { applyTakeAt } from '$lib/arrangement/takeSnapshot';
import {timingCacheCapacity,timingSceneErrors} from '$lib/stores/timing';
import {prepareNativeTimingTake} from '$lib/export/nativeTimingTake';
import { startArrangementExport, cancelArrangementExport, exportState } from '$lib/export/arrangementExport';

// The test double is writable; the production mode deliberately exposes only Readable.
const modeState = arrangementMode as Writable<ArrangementMode>;

class FakeRecorder {
  static isTypeSupported() { return true; }
  state = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { if (fixture.constructorFails) throw new Error('Recorder construction failed'); }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['recorded video']) });
    this.onstop?.();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  fixture.position = 0;
  fixture.constructorFails = false;
  fixture.finalize.mockResolvedValue(new Blob(['finalized video'],{type:'video/webm'}));
  vi.mocked(prepareNativeTimingTake).mockResolvedValue(null);
  modeState.set('live');
  arrangementOverridden.set(false);
  arrangementLoopRegion.set({ startSeconds: 30, endSeconds: 60 });
  transportDisplay.update(s => ({ ...s, duration: 180, bpm: 125, playing: false }));
  exportState.set({ status: 'idle' });
  timingCacheCapacity.set({usedBytes:0,requiredBytes:0,pending:0});timingSceneErrors.set({});
  fixture.audio.createCaptureStream.mockReturnValue({
    stream: { getAudioTracks: () => [{}] }, release: fixture.release,
  });
  fixture.audio.suspendTrackLooping.mockReturnValue(fixture.restoreLoop);
  fixture.audio.seek.mockImplementation((position: number) => { fixture.position = position; });
  fixture.audio.start.mockImplementation(async () => {
    transportDisplay.update(s => ({ ...s, playing: true }));
  });
  fixture.captureStream.mockReturnValue({
    getVideoTracks: () => [fixture.videoTrack], getTracks: () => [fixture.videoTrack],
  });
  fixture.getCanvas.mockImplementation((id:string) => id === 'pgm' ? { captureStream:fixture.captureStream } : null);
  vi.mocked(setArrangementMode).mockImplementation(async mode => {
    modeState.set(mode);
    return { loaded: 0, failed: [] };
  });
  vi.mocked(applyTakeAt).mockResolvedValue(undefined);
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('MediaStream', class { constructor(_tracks: unknown[]) {} });
  vi.stubGlobal('document', {
    body: { appendChild: vi.fn() },
    createElement: () => ({ click: fixture.download, remove: vi.fn(), href: '', download: '' }),
  });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:recording');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('arrangement export lifecycle', () => {
  test('does not stop a loop before its requested end',async()=>{
    const running=startArrangementExport({range:'loop',fps:24});
    try{
      await vi.advanceTimersByTimeAsync(50);
      fixture.position=59.98;await vi.advanceTimersByTimeAsync(50);
      expect(get(exportState).status).toBe('recording');
      expect(fixture.finalize).not.toHaveBeenCalled();
      fixture.position=60;await vi.advanceTimersByTimeAsync(50);await running;
    }finally{cancelArrangementExport();await vi.advanceTimersByTimeAsync(50);await running;}
  });
  test('primes the loop source and lets it paint before capturing video',async()=>{
    const frames:FrameRequestCallback[]=[];
    vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.push(callback);return frames.length;});
    const running=startArrangementExport({range:'loop',fps:24});
    try{
      await vi.advanceTimersByTimeAsync(0);
      expect(fixture.prime).toHaveBeenCalledWith(30,125);
      expect(fixture.captureStream).not.toHaveBeenCalled();
      frames.shift()!(0);await vi.advanceTimersByTimeAsync(0);
      expect(fixture.captureStream).not.toHaveBeenCalled();
      frames.shift()!(16);await vi.advanceTimersByTimeAsync(0);
      expect(fixture.captureStream).toHaveBeenCalledOnce();
      fixture.position=60;await vi.advanceTimersByTimeAsync(50);await running;
    }finally{
      cancelArrangementExport();while(frames.length)frames.shift()!(32);
      await vi.advanceTimersByTimeAsync(50);await running;
    }
  });
  test('waits for future section banks before starting song playback',async()=>{
    timingCacheCapacity.set({usedBytes:0,requiredBytes:0,pending:1});
    const running=startArrangementExport({range:'song',fps:24});
    await vi.advanceTimersByTimeAsync(100);
    expect(get(exportState).status).toBe('preparing');
    expect(fixture.audio.start).not.toHaveBeenCalled();
    timingCacheCapacity.set({usedBytes:0,requiredBytes:0,pending:0});
    await vi.advanceTimersByTimeAsync(50);
    expect(fixture.audio.start).toHaveBeenCalledOnce();
    fixture.position=180;
    await vi.advanceTimersByTimeAsync(50);await running;
    expect(fixture.download).toHaveBeenCalledOnce();
  });

  test('refuses a take with a failed future section bank',async()=>{
    timingSceneErrors.set({'chorus.mp4':'GPU capacity exceeded'});
    await startArrangementExport({range:'song',fps:24});
    expect(get(exportState)).toEqual({status:'error',message:'Could not prepare section clip chorus.mp4: GPU capacity exceeded'});
    expect(fixture.audio.start).not.toHaveBeenCalled();
    expect(fixture.download).not.toHaveBeenCalled();
    expect(fixture.release).toHaveBeenCalledOnce();
  });
  test('finalizes recorded frames at the selected file FPS before downloading', async () => {
    const running=startArrangementExport({range:'loop',fps:24});
    await vi.advanceTimersByTimeAsync(50);
    fixture.position=60;
    await vi.advanceTimersByTimeAsync(50);
    await running;
    expect(fixture.finalize).toHaveBeenCalledWith(expect.any(Blob),24,expect.any(Object));
    expect(fixture.download).toHaveBeenCalledOnce();
  });

  test('keeps finalization exclusive and cancels without a download', async () => {
    fixture.finalize.mockImplementationOnce((_blob,_fps,options)=>new Promise((_resolve,reject)=>{
      options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});
    }));
    const running=startArrangementExport({range:'loop',fps:24});
    await vi.advanceTimersByTimeAsync(50);
    fixture.position=60;
    await vi.advanceTimersByTimeAsync(50);
    expect(get(exportState).status).toBe('finalizing');
    await startArrangementExport({range:'song',fps:60});
    expect(fixture.audio.createCaptureStream).toHaveBeenCalledOnce();
    cancelArrangementExport();
    await running;
    expect(get(exportState).status).toBe('idle');
    expect(fixture.download).not.toHaveBeenCalled();
    expect(fixture.release).toHaveBeenCalledOnce();
    expect(fixture.restoreLoop).toHaveBeenCalledOnce();
  });

  test('reports finalization failure instead of saving the variable-rate recording', async () => {
    fixture.finalize.mockRejectedValueOnce(new Error('No video encoder available'));
    const running=startArrangementExport({range:'loop',fps:24});
    await vi.advanceTimersByTimeAsync(50);
    fixture.position=60;
    await vi.advanceTimersByTimeAsync(50);
    await running;
    expect(get(exportState)).toEqual({status:'error',message:'No video encoder available'});
    expect(fixture.download).not.toHaveBeenCalled();
    expect(fixture.release).toHaveBeenCalledOnce();
    expect(fixture.restoreLoop).toHaveBeenCalledOnce();
  });
  test('records the visible Arrange monitor instead of the hidden main PGM canvas', async () => {
    const hiddenCapture = vi.fn(() => { throw new Error('Hidden canvas has no painted capture frames'); });
    fixture.getCanvas.mockImplementation((id:string) => ({
      captureStream: id === 'pgm-monitor' ? fixture.captureStream : hiddenCapture,
    }));
    const running = startArrangementExport({range:'loop',fps:24});
    await vi.advanceTimersByTimeAsync(50);
    fixture.position = 60;
    await vi.advanceTimersByTimeAsync(50);
    await running;
    expect(fixture.download).toHaveBeenCalledOnce();
    expect(hiddenCapture).not.toHaveBeenCalled();
  });

  test('passes the original-resolution frame provider to finalization and releases it on failure',async()=>{
    const release=vi.fn(),video={width:1280,height:720,frame:vi.fn()} as any;
    vi.mocked(prepareNativeTimingTake).mockResolvedValue({video,release});
    fixture.finalize.mockRejectedValueOnce(new Error('native encoder failed'));
    const running=startArrangementExport({range:'loop',fps:24});
    await vi.advanceTimersByTimeAsync(50);fixture.position=60;await vi.advanceTimersByTimeAsync(50);await running;
    expect(fixture.finalize.mock.calls[0][2].nativeVideo).toBe(video);
    expect(release).toHaveBeenCalledOnce();
    expect(fixture.download).not.toHaveBeenCalled();
    expect(get(exportState)).toMatchObject({status:'error',message:'native encoder failed'});
  });

  test('does not silently export preview pixels when the original source cannot be decoded',async()=>{
    vi.mocked(prepareNativeTimingTake).mockRejectedValueOnce(new Error('Original clip unavailable'));
    const running=startArrangementExport({range:'loop',fps:24});
    await vi.advanceTimersByTimeAsync(50);fixture.position=60;await vi.advanceTimersByTimeAsync(50);await running;
    expect(fixture.finalize).not.toHaveBeenCalled();expect(fixture.download).not.toHaveBeenCalled();
    expect(get(exportState)).toMatchObject({status:'error',message:'Original clip unavailable'});
    expect(fixture.release).toHaveBeenCalledOnce();
  });

  test('exports at 24 FPS without song looping and restores the workspace loop', async () => {
    const running = startArrangementExport({ range: 'song', fps: 24 });
    await vi.advanceTimersByTimeAsync(50);
    expect(get(exportState).status).toBe('recording');
    expect(fixture.audio.suspendTrackLooping).toHaveBeenCalledOnce();
    expect(fixture.captureStream).toHaveBeenCalledWith(24);
    expect(get(arrangementLoopRegion)).toBeNull();
    fixture.position = 180;
    await vi.advanceTimersByTimeAsync(50);
    await running;
    expect(fixture.download).toHaveBeenCalledOnce();
    expect(get(exportState).status).toBe('idle');
    expect(fixture.restoreLoop).toHaveBeenCalledOnce();
    expect(get(arrangementLoopRegion)).toEqual({ startSeconds: 30, endSeconds: 60 });
    expect(get(arrangementMode)).toBe('live');
    expect(fixture.release).toHaveBeenCalledOnce();
    expect(fixture.videoTrack.stop).toHaveBeenCalledOnce();
  });

  test('cleans up streams and loop state when recorder construction fails', async () => {
    fixture.constructorFails = true;
    await startArrangementExport({ range: 'loop', fps: 24 });
    expect(get(exportState)).toEqual({ status: 'error', message: 'Recorder construction failed' });
    expect(fixture.release).toHaveBeenCalledOnce();
    expect(fixture.videoTrack.stop).toHaveBeenCalledOnce();
    expect(fixture.restoreLoop).toHaveBeenCalledOnce();
    expect(fixture.download).not.toHaveBeenCalled();
    expect(get(arrangementMode)).toBe('live');
  });

  test('cancels preparation before opening the recorder and rejects a second export', async () => {
    let finishRecall!: () => void;
    vi.mocked(setArrangementMode).mockImplementationOnce(() => new Promise(resolve => {
      finishRecall = () => resolve({ loaded: 0, failed: [] });
    }));
    const running = startArrangementExport({ range: 'song', fps: 24 });
    expect(get(exportState).status).toBe('preparing');
    await startArrangementExport({ range: 'song', fps: 24 });
    expect(fixture.audio.createCaptureStream).toHaveBeenCalledOnce();
    cancelArrangementExport();
    finishRecall();
    await running;
    expect(get(exportState).status).toBe('idle');
    expect(fixture.captureStream).not.toHaveBeenCalled();
    expect(fixture.release).toHaveBeenCalledOnce();
    expect(fixture.restoreLoop).toHaveBeenCalledOnce();
  });

  test('does not download a partial file when playback refuses to start', async () => {
    fixture.audio.start.mockResolvedValue(undefined);
    const running = startArrangementExport({ range: 'song', fps: 24 });
    await vi.advanceTimersByTimeAsync(4100);
    await running;
    expect(get(exportState)).toMatchObject({ status: 'error' });
    expect(fixture.download).not.toHaveBeenCalled();
    expect(fixture.release).toHaveBeenCalledOnce();
    expect(fixture.restoreLoop).toHaveBeenCalledOnce();
  });

  test('reuses PLAY without recapturing the live workspace or preserving a manual override', async () => {
    modeState.set('play');
    arrangementOverridden.set(true);
    const running = startArrangementExport({ range: 'loop', fps: 24 });
    await vi.advanceTimersByTimeAsync(50);
    expect(applyTakeAt).toHaveBeenCalledWith(30, 125);
    expect(setArrangementMode).not.toHaveBeenCalled();
    expect(get(arrangementOverridden)).toBe(false);
    fixture.position = 60;
    await vi.advanceTimersByTimeAsync(50);
    await running;
    expect(get(arrangementMode)).toBe('play');
  });
});
