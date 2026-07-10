import { useState, useCallback, useRef } from 'react';
import { TopBar } from './components/TopBar';
import { PresetBrowser } from './components/PresetBrowser';
import { EffectModule, CompactModule } from './components/EffectModule';
import { MainViewer } from './components/MainViewer';
import { AudioProvider } from './audio/AudioContext';
import { parseMidi, type MidiNote } from './audio/MidiParser';

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
      type: 0, interval: 50, duration: 40, amount: 60, trig: 0,
      mix: 100, in_: 80, out: 75,
    },
  },
  {
    id: 'speedramp',
    name: 'SPEEDRAMP',
    shortName: 'RAMP',
    accentColor: '#f59e0b',
    params: {
      len: 50, depth: 60,
      bzY0: 80, bzX1: 35, bzY1: 5, bzX2: 65, bzY2: 5, bzY3: 80,
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
      time: 60, feedback: 50,
      scratchMode: 0, scratchDepth: 45,
      mix: 55, in_: 80, out: 65,
    },
  },
  {
    id: 'timesampler',
    name: 'TIMESAMPLER',
    shortName: 'SMPLR',
    accentColor: '#eab308',
    params: {
      mode: 0, size: 50, repeats: 50, chance: 60, rate: 43,
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
    params: { amt: 35, pulse: 55, soft: 45, mix: 100 },
  },
];

const ALL_MODULES: ModuleConfig[] = [...MODULES, ...MODULES_B];

function moduleRecord<T>(value: T): Record<ModuleType, T> {
  return Object.fromEntries(ALL_MODULES.map(m => [m.id, value])) as Record<ModuleType, T>;
}

const PRESETS = [
  'Big head mode',
  'Cascade Combo',
  'Fog of War',
  'Ghost Room',
  'Lag Spike Delay',
  'Noclip Phase',
  'Overclocked',
  'Resonant Mist',
  'Sizzle Damage',
  'Vortex Spell',
  'World Map Chorus',
];


export function App() {
  const [selectedPreset, setSelectedPreset] = useState('Cascade Combo');
  const [macros, setMacros] = useState({ macro1: 50, macro2: 75, macro3: 30, macro4: 60 });
  const [moduleParams, setModuleParams] = useState<Record<ModuleType, Record<string, number>>>(
    Object.fromEntries(ALL_MODULES.map(m => [m.id, { ...m.params }])) as Record<ModuleType, Record<string, number>>
  );
  const [bypassed, setBypassed] = useState<Record<ModuleType, boolean>>(() => moduleRecord(false));
  const [muted, setMuted] = useState<Record<ModuleType, boolean>>(() => moduleRecord(false));
  const [videoLayers, setVideoLayers] = useState<Record<ModuleType, VideoLayer | null>>(() => moduleRecord<VideoLayer | null>(null));
  const [midiLayers, setMidiLayers] = useState<Record<ModuleType, MidiLayer | null>>(() => moduleRecord<MidiLayer | null>(null));
  const [pgmSource, setPgmSource] = useState<ModuleType>('transition');

  const objectUrlsRef = useRef<string[]>([]);

  const updateParam = useCallback((moduleId: ModuleType, param: string, value: number) => {
    setModuleParams(prev => ({
      ...prev,
      [moduleId]: { ...prev[moduleId], [param]: value },
    }));
  }, []);

  const updateMacro = useCallback((macro: keyof typeof macros, value: number) => {
    setMacros(prev => ({ ...prev, [macro]: value }));
  }, []);

  const toggleBypass = useCallback((moduleId: ModuleType) => {
    setBypassed(prev => ({ ...prev, [moduleId]: !prev[moduleId] }));
  }, []);

  const toggleMute = useCallback((moduleId: ModuleType) => {
    setMuted(prev => ({ ...prev, [moduleId]: !prev[moduleId] }));
  }, []);

  const setModuleVideo = useCallback((moduleId: ModuleType, file: File | null) => {
    setVideoLayers(prev => {
      const current = prev[moduleId];
      if (current?.url?.startsWith('blob:')) URL.revokeObjectURL(current.url);

      if (!file) {
        return { ...prev, [moduleId]: null };
      }

      const url = URL.createObjectURL(file);
      objectUrlsRef.current.push(url);
      return {
        ...prev,
        [moduleId]: {
          name: file.name,
          url,
          file,
        },
      };
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

  const clear = useCallback(() => {
    const resetParams = {} as Record<ModuleType, Record<string, number>>;
    ALL_MODULES.forEach(module => {
      resetParams[module.id] = {};
      Object.keys(module.params).forEach(param => {
        resetParams[module.id][param] = module.params[param];
      });
    });
    setModuleParams(resetParams);
    setMacros({ macro1: 50, macro2: 75, macro3: 30, macro4: 60 });
  }, []);

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

          <PresetBrowser
            presets={PRESETS}
            selectedPreset={selectedPreset}
            onSelectPreset={setSelectedPreset}
            macros={macros}
            onUpdateMacro={updateMacro}
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
              onSelectSource={setPgmSource}
              moduleParams={moduleParams}
              videoLayers={videoLayers}
              midiLayers={midiLayers}
              bypassed={bypassed}
            />
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
              {MODULES.map(module => (
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
                />
              ))}
            </div>
            <div style={{ height: 208, display: 'flex', overflow: 'hidden', flexShrink: 0, borderTop: '2px solid #0d0e0f' }}>
              {MODULES_B.map(module => (
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
