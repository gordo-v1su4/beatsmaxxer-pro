import { useState, useCallback, useEffect, useRef } from 'react';
import { TopBar } from './components/TopBar';
import { EffectModule, CompactModule } from './components/EffectModule';
import { MainViewer, PgmRail } from './components/MainViewer';
import { AudioProvider } from './audio/AudioContext';
import { audioEngine } from './audio/AudioEngine';
import { parseMidi, type MidiNote } from './audio/MidiParser';
import { ClipRegistry } from './media/ClipRegistry';

export type ModuleType =
  | 'transition' | 'speedramp' | 'tapdelay' | 'timesampler'
  | 'punch' | 'shake' | 'orbit' | 'focus';

export interface ModuleConfig {
  id: ModuleType;
  name: string;
  shortName: string;
  accentColor: string;
  params: Record<string, number>;
}

export interface VideoLayer {
  name: string;
  url: string;
  file?: File;
}

export interface MidiLayer {
  name: string;
  notes: MidiNote[];
  duration: number;
}

const MODULES: ModuleConfig[] = [
  {
    id: 'transition',
    name: 'TRANSITION',
    shortName: 'TRANS',
    accentColor: '#22c55e',
    params: {
      type: 0, interval: 36, duration: 40, amount: 60, trig: 0,
      mix: 100, in_: 80, out: 75,
    },
  },
  {
    id: 'speedramp',
    name: 'SPEEDRAMP',
    shortName: 'RAMP',
    accentColor: '#f59e0b',
    params: {
      len: 36, spdMin: 25, spdMax: 75,
      bzY0: 100, bzX1: 35, bzY1: 0, bzX2: 65, bzY2: 0, bzY3: 100,
      mix: 100, in_: 80, out: 70,
    },
  },
  {
    id: 'tapdelay',
    name: 'TAPDELAY',
    shortName: 'DELAY',
    accentColor: '#38bdf8',
    params: {
      type: 1, velCrv: 55, end: 60, start: 25, filterSlider: 60,
      time: 60, feedback: 50, feel: 0,
      scratchMode: 0, scratchDepth: 45,
      mix: 55, in_: 80, out: 65,
    },
  },
  {
    id: 'timesampler',
    name: 'TIMESAMPLER',
    shortName: 'SMPLR',
    accentColor: '#fde047',
    params: {
      mode: 0, size: 50, slices: 8, loops: 2, accent: 0, chance: 60, rate: 43,
      mix: 60, in_: 80, out: 60,
    },
  },
];

/** Second row: camera-language effects (crash zoom, handheld, dolly drift, rack focus). */
const MODULES_B: ModuleConfig[] = [
  {
    id: 'punch',
    name: 'PUNCH ZOOM',
    shortName: 'PUNCH',
    accentColor: '#fb7185',
    params: { dir: 50, amt: 60, snap: 55, mix: 100 },
  },
  {
    id: 'shake',
    name: 'HANDHELD',
    shortName: 'SHAKE',
    accentColor: '#a78bfa',
    params: { hand: 40, impact: 55, sway: 30, mix: 100 },
  },
  {
    id: 'orbit',
    name: 'DRIFT CAM',
    shortName: 'DRIFT',
    accentColor: '#2dd4bf',
    params: { spd: 35, drift: 50, nudge: 40, mix: 100 },
  },
  {
    id: 'focus',
    name: 'RACK FOCUS',
    shortName: 'FOCUS',
    accentColor: '#e2c08d',
    params: { amt: 35, pulse: 55, soft: 45, xeye: 0, mix: 100 },
  },
];

export const ALL_MODULES: ModuleConfig[] = [...MODULES, ...MODULES_B];

const QA_SAMPLE_CLIPS = [
  'hf_20260715_204952_1521dea1-55e8-4838-a74c-2afbb212e243.mp4',
  'hf_20260716_141721_f2b046a6-02fb-43c7-af95-2509f73de473.mp4',
  'hf_20260715_050415_982fb7e8-2da7-4dc4-b45a-175771abd6fd.mp4',
  'hf_20260715_165127_8bb294ab-8a6d-4851-b877-27465d118317.mp4',
  'hf_20260716_133422_03a07843-4356-4649-8b52-a2f9c3aa25dc.mp4',
  'hf_20260715_135712_b69abf83-d0f1-4e2b-8a83-c8f78afb4564.mp4',
  'hf_20260718_061437_6ac38dee-9f5a-4e0d-a8d7-fa094f5eacf6.mp4',
  'hf_20260717_064325_86638b52-4426-432e-bdd5-c09330ac5cf2.mp4',
] as const;

const QA_SAMPLE_AUDIO = 'redline.wav';

function moduleRecord<T>(value: T): Record<ModuleType, T> {
  return Object.fromEntries(ALL_MODULES.map(m => [m.id, value])) as Record<ModuleType, T>;
}

function joinQaUrl(baseUrl: string, fileName: string) {
  const trimmed = baseUrl.replace(/\/+$/, '');
  const encodedPath = fileName
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `${trimmed}/${encodedPath}`;
}

export function App() {
  const [moduleParams, setModuleParams] = useState<Record<ModuleType, Record<string, number>>>(
    Object.fromEntries(ALL_MODULES.map(m => [m.id, { ...m.params }])) as Record<ModuleType, Record<string, number>>
  );
  const [bypassed, setBypassed] = useState<Record<ModuleType, boolean>>(() => moduleRecord(false));
  const [muted, setMuted] = useState<Record<ModuleType, boolean>>(() => moduleRecord(false));
  const [videoLayers, setVideoLayers] = useState<Record<ModuleType, VideoLayer | null>>(() => moduleRecord<VideoLayer | null>(null));
  const [midiLayers, setMidiLayers] = useState<Record<ModuleType, MidiLayer | null>>(() => moduleRecord<MidiLayer | null>(null));
  const [pgmSource, setPgmSource] = useState<ModuleType>('transition');
  const [queuedPgmSource, setQueuedPgmSource] = useState<ModuleType | null>(null);
  const [overlapPgmSource, setOverlapPgmSource] = useState<ModuleType | null>(null);
  const [clipRegistryVersion, setClipRegistryVersion] = useState(0);
  const [orderTop, setOrderTop] = useState<ModuleType[]>(MODULES.map(m => m.id));
  const [orderBottom, setOrderBottom] = useState<ModuleType[]>(MODULES_B.map(m => m.id));

  const clipRegistryRef = useRef(new ClipRegistry());
  const clipRuntimeRef = useRef<{
    removeClip(id: string): Promise<boolean>;
  } | null>(null);
  const pendingClipRemovalsRef = useRef(new Set<ModuleType>());
  const registryLifecycleRef = useRef(0);
  const overlapTimerRef = useRef<number | null>(null);
  const qaSeedRef = useRef(false);

  const updateParam = useCallback((moduleId: ModuleType, param: string, value: number) => {
    setModuleParams(prev => ({
      ...prev,
      [moduleId]: { ...prev[moduleId], [param]: value },
    }));
  }, []);

  const toggleBypass = useCallback((moduleId: ModuleType) => {
    setBypassed(prev => ({ ...prev, [moduleId]: !prev[moduleId] }));
  }, []);

  const toggleMute = useCallback((moduleId: ModuleType) => {
    setMuted(prev => ({ ...prev, [moduleId]: !prev[moduleId] }));
  }, []);

  const setModuleVideo = useCallback((moduleId: ModuleType, file: File | null) => {
    if (!file) {
      setVideoLayers(prev => ({ ...prev, [moduleId]: null }));
      const runtime = clipRuntimeRef.current;
      if (runtime) {
        void runtime.removeClip(moduleId).finally(() => {
          setClipRegistryVersion(version => version + 1);
        });
      } else {
        pendingClipRemovalsRef.current.add(moduleId);
      }
      return;
    }

    pendingClipRemovalsRef.current.delete(moduleId);
    const clip = clipRegistryRef.current.registerFile(moduleId, file);
    setVideoLayers(prev => ({
      ...prev,
      [moduleId]: {
        name: clip.name,
        url: clip.url,
        file,
      },
    }));
    setClipRegistryVersion(version => version + 1);
  }, []);

  const handleClipRuntimeChange = useCallback((
    runtime: { removeClip(id: string): Promise<boolean> } | null,
  ) => {
    clipRuntimeRef.current = runtime;
    if (!runtime || pendingClipRemovalsRef.current.size === 0) return;
    const pending = [...pendingClipRemovalsRef.current];
    pendingClipRemovalsRef.current.clear();
    void Promise.allSettled(
      pending.map((moduleId) => runtime.removeClip(moduleId)),
    ).then(() => {
      setClipRegistryVersion(version => version + 1);
    });
  }, []);

  const setModuleMidi = useCallback(async (moduleId: ModuleType, file: File | null) => {
    if (!file) {
      setMidiLayers(prev => ({ ...prev, [moduleId]: null }));
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const data = parseMidi(buffer);
      setMidiLayers(prev => ({
        ...prev,
        [moduleId]: { name: file.name, notes: data.notes, duration: data.duration },
      }));
    } catch (err) {
      console.error('Failed to parse MIDI file:', err);
    }
  }, []);

  const randomize = useCallback(() => {
    const newParams = {} as Record<ModuleType, Record<string, number>>;
    ALL_MODULES.forEach(module => {
      newParams[module.id] = {};
      Object.keys(module.params).forEach(param => {
        const existing = module.params[param];
        newParams[module.id][param] = typeof existing === 'number' ? Math.floor(Math.random() * 100) : existing;
      });
    });
    setModuleParams(newParams);
  }, []);

  // drop draggedId in front of targetId within its own row
  const reorderModules = useCallback((draggedId: ModuleType, targetId: ModuleType) => {
    const apply = (setList: React.Dispatch<React.SetStateAction<ModuleType[]>>) => {
      setList(prev => {
        if (!prev.includes(draggedId) || !prev.includes(targetId) || draggedId === targetId) return prev;
        const list = prev.filter(x => x !== draggedId);
        list.splice(list.indexOf(targetId), 0, draggedId);
        return list;
      });
    };
    apply(setOrderTop);
    apply(setOrderBottom);
  }, []);

  const clear = useCallback(() => {
    const resetParams = {} as Record<ModuleType, Record<string, number>>;
    ALL_MODULES.forEach(module => {
      resetParams[module.id] = {};
      Object.keys(module.params).forEach(param => {
        resetParams[module.id][param] = module.params[param];
      });
    });
    setModuleParams(resetParams);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV || qaSeedRef.current) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('qa') !== 'sample-media') return;

    qaSeedRef.current = true;

    const baseUrl = (params.get('qaMediaBase') || '/__qa/media').trim();
    const audioName = (params.get('qaAudio') || QA_SAMPLE_AUDIO).trim();
    const clipNames = (params.get('qaClips') || QA_SAMPLE_CLIPS.join(','))
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const orderedModuleIds = [...MODULES.map((module) => module.id), ...MODULES_B.map((module) => module.id)];
    const requestedPgm = params.get('qaPgm') as ModuleType | null;

    const qaLayers = {} as Partial<
      Record<ModuleType, VideoLayer>
    >;
    orderedModuleIds.forEach((moduleId, index) => {
      const clipName = clipNames[index % clipNames.length];
      const url = joinQaUrl(baseUrl, clipName);
      clipRegistryRef.current.registerUrl(moduleId, clipName, url);
      qaLayers[moduleId] = { name: clipName, url };
    });
    setVideoLayers((prev) => ({ ...prev, ...qaLayers }));
    setClipRegistryVersion(version => version + 1);

    if (requestedPgm && ALL_MODULES.some((module) => module.id === requestedPgm)) {
      setPgmSource(requestedPgm);
    }

    void (async () => {
      try {
        await audioEngine.loadAudioUrl(joinQaUrl(baseUrl, audioName), audioName, {
          analysisUrl: `/__qa/rhythm?file=${encodeURIComponent(audioName)}`,
        });
        if (params.get('qaAutoplay') !== '0') {
          await audioEngine.start();
        }
      } catch (error) {
        console.error('Failed to preload QA sample media', error);
      }
    })();
  }, []);

  useEffect(() => {
    const lifecycle = ++registryLifecycleRef.current;
    return () => {
      queueMicrotask(() => {
        if (registryLifecycleRef.current !== lifecycle) return;
        if (overlapTimerRef.current !== null) {
          window.clearTimeout(overlapTimerRef.current);
        }
        clipRegistryRef.current.dispose();
      });
    };
  }, []);

  const selectPgmSource = useCallback((next: ModuleType) => {
    setPgmSource((current) => {
      if (current === next) return current;
      setOverlapPgmSource(current);
      if (overlapTimerRef.current !== null) {
        window.clearTimeout(overlapTimerRef.current);
      }
      overlapTimerRef.current = window.setTimeout(() => {
        setOverlapPgmSource(null);
        overlapTimerRef.current = null;
      }, 250);
      return next;
    });
  }, []);

  const moduleById = Object.fromEntries(ALL_MODULES.map(m => [m.id, m])) as Record<ModuleType, ModuleConfig>;

  return (
    <AudioProvider>
      <div style={{
        width: '100vw',
        height: '100vh',
        background: '#0a0b0c',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'Rajdhani, sans-serif',
      }}>
        <TopBar onRandomize={randomize} onClear={clear} />

        <div style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          background: '#0a0b0c',
        }}>
          <div style={{
            width: 8,
            flexShrink: 0,
            background: 'linear-gradient(90deg, #0d0e0f 0%, #161819 60%, #0f1012 100%)',
            borderRight: '1px solid #0d0e0f',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            paddingTop: 12,
            paddingBottom: 12,
          }}>
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 35%, #2a2d32, #111)',
                border: '1px solid #0a0b0c',
                marginLeft: 1,
              }} />
            ))}
          </div>

          <PgmRail
            modules={ALL_MODULES}
            pgmSource={pgmSource}
            onSelectSource={selectPgmSource}
            onQueueChange={setQueuedPgmSource}
          />

          <div style={{ width: 3, background: '#0d0e0f', flexShrink: 0 }} />

          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: '#0a0b0c',
            gap: 0,
          }}>
            <MainViewer
              modules={ALL_MODULES}
              pgmSource={pgmSource}
              moduleParams={moduleParams}
              videoLayers={videoLayers}
              midiLayers={midiLayers}
              bypassed={bypassed}
              clipRegistry={clipRegistryRef.current}
              clipRegistryVersion={clipRegistryVersion}
              queuedPgmSource={queuedPgmSource}
              overlapPgmSource={overlapPgmSource}
              onClipRuntimeChange={handleClipRuntimeChange}
            />
            <div style={{ height: 'clamp(420px, calc((100vw - 206px) * 9 / 64 + 244px), 544px)', flexShrink: 0.15, minHeight: 300, display: 'flex', overflow: 'hidden' }}>
              {orderTop.map(mid => moduleById[mid]).map(module => (
                <EffectModule
                  key={module.id}
                  config={module}
                  params={moduleParams[module.id]}
                  onUpdateParam={(param, value) => updateParam(module.id, param, value)}
                  bypassed={bypassed[module.id]}
                  muted={muted[module.id]}
                  onToggleBypass={() => toggleBypass(module.id)}
                  onToggleMute={() => toggleMute(module.id)}
                  videoLayer={videoLayers[module.id]}
                  onSetVideoLayer={(file) => setModuleVideo(module.id, file)}
                  midiLayer={midiLayers[module.id]}
                  onSetMidiLayer={(file) => setModuleMidi(module.id, file)}
                  isOnAir={pgmSource === module.id}
                  onModuleDrop={(dragged) => reorderModules(dragged, module.id)}
                />
              ))}
            </div>
            <div style={{ height: 'clamp(240px, calc((100vw - 206px) * 9 / 64 + 96px), 404px)', flexShrink: 0.15, minHeight: 176, display: 'flex', overflow: 'hidden', borderTop: '2px solid #0d0e0f' }}>
              {orderBottom.map(mid => moduleById[mid]).map(module => (
                <CompactModule
                  key={module.id}
                  config={module}
                  params={moduleParams[module.id]}
                  onUpdateParam={(param, value) => updateParam(module.id, param, value)}
                  bypassed={bypassed[module.id]}
                  onToggleBypass={() => toggleBypass(module.id)}
                  videoLayer={videoLayers[module.id]}
                  onSetVideoLayer={(file) => setModuleVideo(module.id, file)}
                  isOnAir={pgmSource === module.id}
                  onModuleDrop={(dragged) => reorderModules(dragged, module.id)}
                />
              ))}
            </div>
          </div>

          <div style={{
            width: 8,
            flexShrink: 0,
            background: 'linear-gradient(270deg, #0d0e0f 0%, #161819 60%, #0f1012 100%)',
            borderLeft: '1px solid #0d0e0f',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            paddingTop: 12,
            paddingBottom: 12,
          }}>
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 35%, #2a2d32, #111)',
                border: '1px solid #0a0b0c',
                marginLeft: 1,
              }} />
            ))}
          </div>
        </div>

      </div>
    </AudioProvider>
  );
}
