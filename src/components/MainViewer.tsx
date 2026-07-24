import { useState, useEffect } from 'react';
import type { ModuleType, ModuleConfig, VideoLayer, MidiLayer } from '../App';
import { ThreeVisualizer, ScreenOverlay, ScreenBadge, VUMeter } from './EffectModule';
import { useAudio } from '../audio/AudioContext';
import { audioEngine } from '../audio/AudioEngine';
import type { PgmFeel } from '../timesampler/integration';
import { rendererLaneForEffect } from '../render/promotion';

type RailFeel = PgmFeel;

const RAIL_INTERVALS = [
  { label: '1BT', beats: 1 },
  { label: '2BT', beats: 2 },
  { label: '1BR', beats: 4 },
  { label: '2BR', beats: 8 },
  { label: '4BR', beats: 16 },
  { label: '8BR', beats: 32 },
] as const;

function formatIntervalLabel(intervalBeats: number, feel: RailFeel) {
  const base = RAIL_INTERVALS.find((option) => option.beats === intervalBeats)?.label ?? `${intervalBeats}BT`;
  if (feel === 1) return `${base} SW`;
  if (feel === 2) return `${base} DOT`;
  return base;
}

function PgmButton({ index, name, color, active, queued, onClick }: {
  index: number; name: string; color: string; active: boolean; queued: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:6, width:'100%',
      height:34, paddingInline:7,
      background: active ? `linear-gradient(180deg,${color}2e,${color}14)` : 'linear-gradient(180deg,#1a1c1f,#131517)',
      border:`1px solid ${active ? color+'77' : queued ? color+'99' : '#1e2226'}`,
      borderRadius:2, cursor:'pointer',
      boxShadow: active ? `inset 0 2px 5px rgba(0,0,0,0.5), 0 0 10px ${color}33` : 'inset 0 1px 2px rgba(0,0,0,0.4)',
      transition:'all 0.08s',
      animation: queued ? 'pgmQueueBlink 0.55s ease-in-out infinite' : undefined,
      flexShrink:0,
    }}>
      <span style={{
        width:16, height:16, borderRadius:2, flexShrink:0,
        background: active ? color : queued ? color + '55' : '#1e2226',
        color: active || queued ? '#0a0b0c' : '#4a5260',
        fontFamily:'Share Tech Mono,monospace', fontSize:9, fontWeight:700,
        display:'flex', alignItems:'center', justifyContent:'center',
        boxShadow: active ? `0 0 8px ${color}66` : undefined,
      }}>{index}</span>
      <span style={{
        fontFamily:'Rajdhani,sans-serif', fontSize:10, fontWeight:700, letterSpacing:'0.1em',
        color: active || queued ? color : '#4a5260', textTransform:'uppercase',
        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
      }}>{name}</span>
      {active && (
        <span style={{
          marginLeft:'auto', width:6, height:6, borderRadius:'50%', flexShrink:0,
          background:'#ef4444', boxShadow:'0 0 6px #ef4444aa',
        }}/>
      )}
    </button>
  );
}

/** Left-rail channel switcher with Ableton-style launch quantize: clicking arms a
    channel (blinks) and the cut lands on the next bar. RAND hops channels every bar. */
export function PgmRail({ modules, pgmSource, onSelectSource }: {
  modules: ModuleConfig[];
  pgmSource: ModuleType;
  onSelectSource: (id: ModuleType) => void;
}) {
  const { state } = useAudio();
  const [queued, setQueued] = useState<ModuleType | null>(null);
  const [autoRand, setAutoRand] = useState(false);
  const [randIntervalBeats, setRandIntervalBeats] = useState(4);
  const [randFeel, setRandFeel] = useState<RailFeel>(0);
  useEffect(() => {
    audioEngine.configurePgmSchedule({
      active: pgmSource,
      sources: modules.map((module) => module.id),
      queued,
      autoRandom: autoRand,
      intervalBeats: randIntervalBeats,
      feel: randFeel,
    });
  }, [
    queued,
    autoRand,
    modules,
    pgmSource,
    randIntervalBeats,
    randFeel,
  ]);

  useEffect(() => {
    return audioEngine.subscribePgmSelection((source) => {
      const selected = source as ModuleType;
      if (selected !== pgmSource) {
        onSelectSource(selected);
      }
      setQueued((current) => current === selected ? null : current);
    });
  }, [pgmSource, onSelectSource]);

  const handleSelect = (id: ModuleType) => {
    if (id === pgmSource) { setQueued(null); return; }
    if (!audioEngine.getTransportSample().playing) {
      setQueued(null);
      onSelectSource(id);
      return;
    }
    setQueued(prev => (prev === id ? null : id));
  };

  const queuedModule = modules.find(m => m.id === queued);
  const active = modules.find(m => m.id === pgmSource) ?? modules[0];
  const quantizeLabel = formatIntervalLabel(randIntervalBeats, randFeel);

  return (
    <div style={{
      width: 190, flexShrink: 0,
      background: 'linear-gradient(180deg,#111214,#0d0e10)',
      borderRight: '1px solid #0d0e0f',
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '8px 8px',
      overflow: 'hidden',
    }}>
      <style>{`@keyframes pgmQueueBlink { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.9); } }`}</style>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{
          fontFamily:'Rajdhani,sans-serif', fontSize:9, fontWeight:700,
          letterSpacing:'0.18em', color:'#3a4050',
        }}>PGM SOURCE</span>
        <button
          onClick={() => setAutoRand(v => !v)}
          title={`Auto-switch to a random channel on the next ${quantizeLabel} boundary`}
          style={{
            height:16, paddingInline:6,
            background: autoRand ? 'linear-gradient(180deg,#ef444433,#ef444418)' : 'linear-gradient(180deg,#1a1c1f,#131517)',
            border:`1px solid ${autoRand ? '#ef444488' : '#1e2226'}`,
            borderRadius:2, cursor:'pointer',
            color: autoRand ? '#ef4444' : '#4a5260',
            fontFamily:'Rajdhani,sans-serif', fontSize:8, fontWeight:700, letterSpacing:'0.1em',
            boxShadow: autoRand ? '0 0 8px #ef444433' : undefined,
            animation: autoRand ? 'pgmQueueBlink 1.1s ease-in-out infinite' : undefined,
          }}
        >RAND</button>
      </div>
      <span style={{
        fontFamily:'Share Tech Mono,monospace', fontSize:7, color:'#33383f', letterSpacing:'0.06em',
      }}>{`CUTS ON NEXT ${quantizeLabel}`}</span>

      <div style={{ display:'flex', flexDirection:'column', gap:3, marginTop:2 }}>
        <div style={{ display:'flex', gap:2, flexWrap:'wrap' }}>
          {RAIL_INTERVALS.map((option) => (
            <button
              key={option.label}
              onClick={() => setRandIntervalBeats(option.beats)}
              style={{
                height:16,
                minWidth:26,
                paddingInline:4,
                background: randIntervalBeats === option.beats ? `linear-gradient(180deg,${active.accentColor}22,${active.accentColor}12)` : 'linear-gradient(180deg,#17191c,#121416)',
                border:`1px solid ${randIntervalBeats === option.beats ? `${active.accentColor}55` : '#1e2226'}`,
                borderRadius:2,
                cursor:'pointer',
                color: randIntervalBeats === option.beats ? active.accentColor : '#556070',
                fontFamily:'Rajdhani,sans-serif',
                fontSize:7.5,
                fontWeight:700,
                letterSpacing:'0.08em',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:2 }}>
          {[
            { label: 'STR8', value: 0 as RailFeel },
            { label: 'SWNG', value: 1 as RailFeel },
            { label: 'DOT', value: 2 as RailFeel },
          ].map((option) => (
            <button
              key={option.label}
              onClick={() => setRandFeel(option.value)}
              style={{
                height:16,
                flex:1,
                background: randFeel === option.value ? `linear-gradient(180deg,${active.accentColor}22,${active.accentColor}12)` : 'linear-gradient(180deg,#17191c,#121416)',
                border:`1px solid ${randFeel === option.value ? `${active.accentColor}55` : '#1e2226'}`,
                borderRadius:2,
                cursor:'pointer',
                color: randFeel === option.value ? active.accentColor : '#556070',
                fontFamily:'Rajdhani,sans-serif',
                fontSize:7.5,
                fontWeight:700,
                letterSpacing:'0.08em',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:2 }}>
        {modules.map((m, i) => (
          <PgmButton
            key={m.id}
            index={i + 1}
            name={m.name}
            color={m.accentColor}
            active={pgmSource === m.id}
            queued={queued === m.id}
            onClick={() => handleSelect(m.id)}
          />
        ))}
      </div>

      <div style={{ flex:1 }}/>

      <div style={{
        background:'#0a0b0c', border:'1px solid #171a1d', borderRadius:2,
        padding:'5px 6px', display:'flex', flexDirection:'column', gap:3,
        boxShadow:'inset 0 2px 5px rgba(0,0,0,0.7)',
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:'Share Tech Mono,monospace', fontSize:8, color:'#6a7a8a' }}>
            {Math.round(state.bpm)} BPM{state.bpmLocked ? '·M' : ''}
          </span>
          <span style={{
            width:7, height:7, borderRadius:'50%',
            background: state.playing && state.beatPhase < 0.15 ? active.accentColor : '#1e2226',
            boxShadow: state.playing && state.beatPhase < 0.15 ? `0 0 6px ${active.accentColor}` : undefined,
            transition:'background 0.05s',
          }}/>
        </div>
        <span style={{ fontFamily:'Share Tech Mono,monospace', fontSize:8, color: queuedModule ? queuedModule.accentColor : '#4a5260' }}>
          {queuedModule
            ? `NEXT ${quantizeLabel} → ${queuedModule.shortName}`
            : `BAR ${Math.max(1, Math.floor(state.beat / 4) + 1)} · PGM ${active.shortName}`}
        </span>
        <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:18, opacity:0.6 }}>
          {(state.fftBands ?? []).map((b, i) => (
            <div key={i} style={{
              flex:1, minHeight:2,
              height:`${Math.max(8, b * 100)}%`,
              background:`linear-gradient(180deg, ${active.accentColor}, ${active.accentColor}44)`,
              borderRadius:'1px 1px 0 0',
            }}/>
          ))}
          <span style={{ fontFamily:'Share Tech Mono,monospace', fontSize:6.5, color:'#3a4050', marginLeft:3 }}>FFT</span>
        </div>
      </div>
    </div>
  );
}

/** Program monitor strip: the selected module's mixed output, full width. */
export function MainViewer({ modules, pgmSource, moduleParams, videoLayers, midiLayers, bypassed }: {
  modules: ModuleConfig[];
  pgmSource: ModuleType;
  moduleParams: Record<ModuleType, Record<string, number>>;
  videoLayers: Record<ModuleType, VideoLayer | null>;
  midiLayers: Record<ModuleType, MidiLayer | null>;
  bypassed: Record<ModuleType, boolean>;
}) {
  const { state } = useAudio();
  const active = modules.find(m => m.id === pgmSource) ?? modules[0];
  const clip = videoLayers[active.id];

  return (
    <div style={{
      // grows fastest so the program monitor is always the biggest panel
      flex: '3 1 0%', minHeight: 190, display:'flex', alignItems:'center', justifyContent:'center',
      background:'linear-gradient(180deg,#101214,#0c0d0f)',
      borderBottom:'2px solid #0d0e0f',
      padding: 6, minWidth: 0,
      containerType: 'size',
    }}>
      <div style={{
        // largest 16:9 rectangle that fits BOTH the width and height of the cell
        position:'relative', aspectRatio:'16/9',
        width: 'min(100%, calc(100cqh * 16 / 9))',
        background:'#000', border:'1px solid #1a1c1e', borderRadius:2, overflow:'hidden',
      }}
        data-pgm-renderer-lane={rendererLaneForEffect(active.id)}
      >
        <ThreeVisualizer
          key={active.id}
          type={active.id}
          color={active.accentColor}
          params={moduleParams[active.id]}
          mode="output"
          videoUrl={clip?.url}
          midiLayer={midiLayers[active.id]}
          bypassed={bypassed[active.id]}
        />
        <ScreenOverlay/>
        <ScreenBadge
          text={bypassed[active.id]
            ? `PGM · ${active.name} · BYPASSED`
            : `PGM · ${active.name} · MIX ${Math.round(moduleParams[active.id].mix ?? 50)}%`}
          color={bypassed[active.id] ? '#ef4444' : active.accentColor}
        />
        <div style={{ position:'absolute', bottom:4, left:5, zIndex:10, background:'rgba(0,0,0,0.7)', borderRadius:2, padding:'0px 4px' }}>
          <span style={{ fontFamily:'Share Tech Mono,monospace', fontSize:6.5, color:'#566070', letterSpacing:'0.08em' }}>
            {clip ? clip.name : 'SRC · TEST PATTERN'}
          </span>
        </div>
        <div style={{ position:'absolute', top:4, right:5, zIndex:8, display:'flex', gap:2, alignItems:'flex-end', opacity:0.5 }}>
          <VUMeter value={state.bassAmp * 100} color={active.accentColor}/>
          <VUMeter value={state.amplitude * 200} color={active.accentColor}/>
        </div>
        <div style={{
          position:'absolute', inset:0, zIndex:6, pointerEvents:'none',
          border:`1px solid ${active.accentColor}44`,
        }}/>
      </div>
    </div>
  );
}
