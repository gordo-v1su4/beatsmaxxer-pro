import { useState, useRef, useEffect } from 'react';
import type { ModuleType, ModuleConfig, VideoLayer, MidiLayer } from '../App';
import { ThreeVisualizer, ScreenOverlay, ScreenBadge, VUMeter } from './EffectModule';
import { useAudio } from '../audio/AudioContext';

interface MainViewerProps {
  modules: ModuleConfig[];
  pgmSource: ModuleType;
  onSelectSource: (id: ModuleType) => void;
  moduleParams: Record<ModuleType, Record<string, number>>;
  videoLayers: Record<ModuleType, VideoLayer | null>;
  midiLayers: Record<ModuleType, MidiLayer | null>;
  bypassed: Record<ModuleType, boolean>;
}

function PgmButton({ index, name, color, active, queued, onClick }: {
  index: number; name: string; color: string; active: boolean; queued: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:4, width:'100%',
      height:24, paddingInline:5,
      background: active ? `linear-gradient(180deg,${color}2e,${color}14)` : 'linear-gradient(180deg,#1a1c1f,#131517)',
      border:`1px solid ${active ? color+'77' : queued ? color+'99' : '#1e2226'}`,
      borderRadius:2, cursor:'pointer',
      boxShadow: active ? `inset 0 2px 5px rgba(0,0,0,0.5), 0 0 10px ${color}33` : 'inset 0 1px 2px rgba(0,0,0,0.4)',
      transition:'all 0.08s',
      animation: queued ? 'pgmQueueBlink 0.55s ease-in-out infinite' : undefined,
    }}>
      <span style={{
        width:13, height:13, borderRadius:2, flexShrink:0,
        background: active ? color : queued ? color + '55' : '#1e2226',
        color: active ? '#0a0b0c' : queued ? '#0a0b0c' : '#4a5260',
        fontFamily:'Share Tech Mono,monospace', fontSize:8, fontWeight:700,
        display:'flex', alignItems:'center', justifyContent:'center',
        boxShadow: active ? `0 0 8px ${color}66` : undefined,
      }}>{index}</span>
      <span style={{
        fontFamily:'Rajdhani,sans-serif', fontSize:8.5, fontWeight:700, letterSpacing:'0.08em',
        color: active ? color : queued ? color : '#4a5260', textTransform:'uppercase',
        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
      }}>{name}</span>
      {active && (
        <span style={{
          marginLeft:'auto', width:5, height:5, borderRadius:'50%', flexShrink:0,
          background:'#ef4444', boxShadow:'0 0 6px #ef4444aa',
        }}/>
      )}
    </button>
  );
}

/** Broadcast-style program monitor with Ableton-style launch quantize: clicking a
    source arms it (button blinks) and the cut lands on the next bar. RAND hops to a
    random channel every bar. */
export function MainViewer({ modules, pgmSource, onSelectSource, moduleParams, videoLayers, midiLayers, bypassed }: MainViewerProps) {
  const { state } = useAudio();
  const [queued, setQueued] = useState<ModuleType | null>(null);
  const [autoRand, setAutoRand] = useState(false);
  const lastBarRef = useRef(-1);

  const active = modules.find(m => m.id === pgmSource) ?? modules[0];
  const clip = videoLayers[active.id];

  // commit queued/random switches on the bar boundary
  useEffect(() => {
    const bar = Math.floor(state.beat / 4);
    if (bar === lastBarRef.current) return;
    const firstTick = lastBarRef.current === -1;
    lastBarRef.current = bar;
    if (firstTick || !state.playing) return;
    if (queued) {
      onSelectSource(queued);
      setQueued(null);
    } else if (autoRand) {
      const others = modules.filter(m => m.id !== pgmSource);
      onSelectSource(others[Math.floor(Math.random() * others.length)].id);
    }
  }, [state.beat, state.playing, queued, autoRand, modules, pgmSource, onSelectSource]);

  const handleSelect = (id: ModuleType) => {
    if (id === pgmSource) { setQueued(null); return; }
    if (!state.playing) { setQueued(null); onSelectSource(id); return; }
    setQueued(prev => (prev === id ? null : id));
  };

  return (
    <div style={{
      display:'flex', flexShrink:0, height:196, gap:0,
      background:'linear-gradient(180deg,#101214,#0c0d0f)',
      borderBottom:'2px solid #0d0e0f',
    }}>
      <style>{`@keyframes pgmQueueBlink { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.9); } }`}</style>

      {/* PGM source select */}
      <div style={{
        width:250, flexShrink:0, display:'flex', flexDirection:'column', gap:4,
        padding:'6px 8px', borderRight:'1px solid #0d0e0f',
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{
            fontFamily:'Rajdhani,sans-serif', fontSize:8, fontWeight:700,
            letterSpacing:'0.18em', color:'#3a4050',
          }}>PGM SOURCE · CUTS ON BAR</span>
          <button
            onClick={() => setAutoRand(v => !v)}
            title="Auto-switch to a random channel every bar"
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
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, flex:1, alignContent:'start' }}>
          {modules.map((m, i) => (
            <PgmButton
              key={m.id}
              index={i + 1}
              name={m.shortName}
              color={m.accentColor}
              active={pgmSource === m.id}
              queued={queued === m.id}
              onClick={() => handleSelect(m.id)}
            />
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingInline:2 }}>
          <span style={{ fontFamily:'Share Tech Mono,monospace', fontSize:8, color:'#4a5260' }}>
            {Math.round(state.bpm)} BPM{state.bpmLocked ? ' · M' : ''}
          </span>
          <span style={{ fontFamily:'Share Tech Mono,monospace', fontSize:8, color: queued ? modules.find(m => m.id === queued)?.accentColor : '#33383f' }}>
            {queued ? `NEXT BAR → ${modules.find(m => m.id === queued)?.shortName}` : `BAR ${Math.max(1, Math.floor(state.beat / 4) + 1)}`}
          </span>
          <span style={{
            width:7, height:7, borderRadius:'50%',
            background: state.playing && state.beatPhase < 0.15 ? active.accentColor : '#1e2226',
            boxShadow: state.playing && state.beatPhase < 0.15 ? `0 0 6px ${active.accentColor}` : undefined,
            transition:'background 0.05s',
          }}/>
        </div>
      </div>

      {/* program monitor */}
      <div style={{ flex:1, display:'flex', alignItems:'stretch', justifyContent:'center', padding:6, minWidth:0 }}>
        <div style={{
          position:'relative', aspectRatio:'16/9', height:'100%', maxWidth:'100%',
          background:'#000', border:'1px solid #1a1c1e', borderRadius:2, overflow:'hidden',
        }}>
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
          <div style={{ position:'absolute', top:4, right:5, zIndex:8, display:'flex', gap:2, alignItems:'flex-end' }}>
            <VUMeter value={state.bassAmp * 100} color={active.accentColor}/>
            <VUMeter value={state.amplitude * 200} color={active.accentColor}/>
          </div>
          <div style={{
            position:'absolute', inset:0, zIndex:6, pointerEvents:'none',
            border:`1px solid ${active.accentColor}44`,
          }}/>
        </div>
      </div>
    </div>
  );
}
