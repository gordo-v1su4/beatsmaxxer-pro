import { useState, useCallback, useRef } from 'react';
import { TopBar } from './components/TopBar';
import { PresetBrowser } from './components/PresetBrowser';
import { EffectModule } from './components/EffectModule';
import { AudioProvider } from './audio/AudioContext';
import { parseMidi, type MidiNote } from './audio/MidiParser';

export type ModuleType = 'shaper' | 'downsampler' | 'tapdelay' | 'timesampler';

export interface ModuleConfig {
  id: ModuleType;
  name: string;
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
    id: 'shaper',
    name: 'SHAPER',
    accentColor: '#22c55e',
    params: {
      algo: 1, offset: 50, freq: 30, clip: 45, amount: 70,
      mix: 65, in_: 80, out: 75,
    },
  },
  {
    id: 'downsampler',
    name: 'DOWNSAMPLER',
    accentColor: '#f59e0b',
    params: {
      jitter: 40, crushType: 0, rate: 50, bits: 70,
      mix: 60, in_: 80, out: 70,
    },
  },
  {
    id: 'tapdelay',
    name: 'TAPDELAY',
    accentColor: '#38bdf8',
    params: {
      type: 1, velCrv: 55, end: 70, start: 25, filterSlider: 60,
      time: 60, feedback: 50,
      scratchMode: 0, scratchDepth: 45,
      mix: 55, in_: 80, out: 65,
    },
  },
  {
    id: 'timesampler',
    name: 'TIMESAMPLER',
    accentColor: '#eab308',
    params: {
      mode: 0, size: 50, repeats: 50, chance: 60, rate: 43,
      mix: 60, in_: 80, out: 60,
    },
  },
];

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

const DEFAULT_VIDEO_LAYERS: Record<ModuleType, VideoLayer | null> = {
  shaper: null,
  downsampler: null,
  tapdelay: null,
  timesampler: null,
};

export function App() {
  const [selectedPreset, setSelectedPreset] = useState('Cascade Combo');
  const [macros, setMacros] = useState({ macro1: 50, macro2: 75, macro3: 30, macro4: 60 });
  const [moduleParams, setModuleParams] = useState<Record<ModuleType, Record<string, number>>>(
    Object.fromEntries(MODULES.map(m => [m.id, { ...m.params }])) as Record<ModuleType, Record<string, number>>
  );
  const [bypassed, setBypassed] = useState<Record<ModuleType, boolean>>({
    shaper: false, downsampler: false, tapdelay: false, timesampler: false,
  });
  const [muted, setMuted] = useState<Record<ModuleType, boolean>>({
    shaper: false, downsampler: false, tapdelay: false, timesampler: false,
  });
  const [videoLayers, setVideoLayers] = useState<Record<ModuleType, VideoLayer | null>>(DEFAULT_VIDEO_LAYERS);
  const [midiLayers, setMidiLayers] = useState<Record<ModuleType, MidiLayer | null>>({
    shaper: null, downsampler: null, tapdelay: null, timesampler: null,
  });

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
    MODULES.forEach(module => {
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
    MODULES.forEach(module => {
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
            overflow: 'hidden',
            background: '#0a0b0c',
            gap: 0,
          }}>
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
              />
            ))}
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

        <div style={{
          height: 52,
          background: 'linear-gradient(180deg, #0e1012 0%, #0a0b0c 100%)',
          borderTop: '1px solid #0d0e0f',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 16,
          paddingRight: 16,
          gap: 0,
          flexShrink: 0,
        }}>
          <BottomStrip modules={MODULES} moduleParams={moduleParams} onUpdateParam={updateParam} />
        </div>
      </div>
    </AudioProvider>
  );
}

function BottomStrip({
  modules, moduleParams, onUpdateParam,
}: {
  modules: ModuleConfig[];
  moduleParams: Record<ModuleType, Record<string, number>>;
  onUpdateParam: (id: ModuleType, param: string, value: number) => void;
}) {
  return (
    <div style={{ display: 'flex', width: '100%', gap: 3 }}>
      <div style={{ width: 220 + 8 + 3, flexShrink: 0, display: 'flex', alignItems: 'center', paddingLeft: 4 }}>
        <ConnectorPanel label="IN">
          <KnobCompact value={75} onChange={() => {}} color="#5a6070" size={32} />
        </ConnectorPanel>
      </div>

      {modules.map(m => {
        const params = moduleParams[m.id];
        return (
          <div key={m.id} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <ConnAB color={m.accentColor} />
            </div>
            <ConnectorPanel label="IN">
              <KnobCompact value={params.in_ ?? 80} onChange={v => onUpdateParam(m.id, 'in_', v)} color={m.accentColor} size={32} />
            </ConnectorPanel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <ConnAB color={m.accentColor} />
            </div>
            <ConnectorPanel label="MIX">
              <KnobCompact value={params.mix ?? 50} onChange={v => onUpdateParam(m.id, 'mix', v)} color={m.accentColor} size={32} />
            </ConnectorPanel>
          </div>
        );
      })}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
        <ConnectorPanel label="OUT">
          <KnobCompact value={70} onChange={() => {}} color="#5a6070" size={32} />
        </ConnectorPanel>
        <ConnectorPanel label="MIX">
          <KnobCompact value={80} onChange={() => {}} color="#5a6070" size={32} />
        </ConnectorPanel>
      </div>
    </div>
  );
}

function ConnAB({ color }: { color: string }) {
  const [selA, setSelA] = useState(true);
  return (
    <>
      <button onClick={() => setSelA(true)} style={{
        width: 16, height: 10,
        background: selA ? `linear-gradient(180deg, ${color}44, ${color}22)` : 'linear-gradient(180deg, #1c1e22, #141618)',
        border: `1px solid ${selA ? color + '66' : '#1e2226'}`,
        borderRadius: 1, cursor: 'pointer',
        fontFamily: 'Rajdhani, sans-serif', fontSize: 7, fontWeight: 700,
        color: selA ? color : '#3a4050',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>A</button>
      <button onClick={() => setSelA(false)} style={{
        width: 16, height: 10,
        background: !selA ? `linear-gradient(180deg, ${color}44, ${color}22)` : 'linear-gradient(180deg, #1c1e22, #141618)',
        border: `1px solid ${!selA ? color + '66' : '#1e2226'}`,
        borderRadius: 1, cursor: 'pointer',
        fontFamily: 'Rajdhani, sans-serif', fontSize: 7, fontWeight: 700,
        color: !selA ? color : '#3a4050',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>B</button>
    </>
  );
}

function ConnectorPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      {children}
      <span style={{
        fontFamily: 'Rajdhani, sans-serif', fontSize: 7, fontWeight: 700,
        letterSpacing: '0.1em', color: '#2e3440', textTransform: 'uppercase',
      }}>{label}</span>
    </div>
  );
}

function KnobCompact({ value, onChange, color, size }: {
  value: number; onChange: (v: number) => void; color: string; size: number;
}) {
  const startYRef = useRef(0);
  const startValRef = useRef(value);
  const dim = size;
  const r = dim / 2 - 4;
  const cx = dim / 2;
  const cy = dim / 2;
  const norm = value / 100;
  const startAngle = 225;
  const totalArc = 270;
  const curAngle = startAngle + norm * totalArc;
  const toXY = (a: number) => ({
    x: cx + r * Math.cos((a - 90) * Math.PI / 180),
    y: cy + r * Math.sin((a - 90) * Math.PI / 180),
  });
  const sRad = (startAngle - 90) * Math.PI / 180;
  const eRad = (startAngle + totalArc - 90) * Math.PI / 180;
  const bgS = { x: cx + r * Math.cos(sRad), y: cy + r * Math.sin(sRad) };
  const bgE = { x: cx + r * Math.cos(eRad), y: cy + r * Math.sin(eRad) };
  const actE = toXY(curAngle);
  const la = norm * totalArc > 180 ? 1 : 0;

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startYRef.current = e.clientY;
    startValRef.current = value;
    document.body.style.cursor = 'ns-resize';
    const move = (ev: MouseEvent) => {
      const d = startYRef.current - ev.clientY;
      onChange(Math.max(0, Math.min(100, startValRef.current + d * 0.5)));
    };
    const up = () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <svg width={dim} height={dim} style={{ cursor: 'ns-resize', display: 'block' }} onMouseDown={onMouseDown}>
      <circle cx={cx} cy={cy} r={dim / 2 - 1} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={dim / 2 - 2} fill="#161819" stroke="#0d0e0f" strokeWidth={1} />
      <path d={`M ${bgS.x} ${bgS.y} A ${r} ${r} 0 1 1 ${bgE.x} ${bgE.y}`} fill="none" stroke="#1a1c1e" strokeWidth={2} strokeLinecap="round" />
      {norm > 0 && (
        <path d={`M ${bgS.x} ${bgS.y} A ${r} ${r} 0 ${la} 1 ${actE.x} ${actE.y}`} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
      )}
      <line
        x1={cx} y1={cy}
        x2={cx + (r - 3) * Math.cos((curAngle - 90) * Math.PI / 180)}
        y2={cy + (r - 3) * Math.sin((curAngle - 90) * Math.PI / 180)}
        stroke="#7a8090" strokeWidth={1.5} strokeLinecap="round"
      />
    </svg>
  );
}
