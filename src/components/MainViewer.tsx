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

function PgmButton({ index, name, color, active, onClick }: {
  index: number; name: string; color: string; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:6, width:'100%',
      height:34, paddingInline:8,
      background: active ? `linear-gradient(180deg,${color}2e,${color}14)` : 'linear-gradient(180deg,#1a1c1f,#131517)',
      border:`1px solid ${active ? color+'77' : '#1e2226'}`,
      borderTop:`1px solid ${active ? color+'44' : '#272b30'}`,
      borderRadius:2, cursor:'pointer',
      boxShadow: active ? `inset 0 2px 5px rgba(0,0,0,0.5), 0 0 10px ${color}33` : 'inset 0 1px 2px rgba(0,0,0,0.4)',
      transition:'all 0.08s',
    }}>
      <span style={{
        width:16, height:16, borderRadius:2, flexShrink:0,
        background: active ? color : '#1e2226',
        color: active ? '#0a0b0c' : '#4a5260',
        fontFamily:'Share Tech Mono,monospace', fontSize:9, fontWeight:700,
        display:'flex', alignItems:'center', justifyContent:'center',
        boxShadow: active ? `0 0 8px ${color}66` : undefined,
      }}>{index}</span>
      <span style={{
        fontFamily:'Rajdhani,sans-serif', fontSize:9, fontWeight:700, letterSpacing:'0.1em',
        color: active ? color : '#4a5260', textTransform:'uppercase',
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

/** Broadcast-style program monitor: shows the selected module's mixed output,
    switchable between the four effect columns like a vision mixer. */
export function MainViewer({ modules, pgmSource, onSelectSource, moduleParams, videoLayers, midiLayers, bypassed }: MainViewerProps) {
  const { state } = useAudio();
  const active = modules.find(m => m.id === pgmSource) ?? modules[0];
  const clip = videoLayers[active.id];

  return (
    <div style={{
      display:'flex', flexShrink:0, height:230, gap:0,
      background:'linear-gradient(180deg,#101214,#0c0d0f)',
      borderBottom:'2px solid #0d0e0f',
    }}>
      {/* PGM source select */}
      <div style={{
        width:150, flexShrink:0, display:'flex', flexDirection:'column', gap:4,
        padding:'8px 8px', borderRight:'1px solid #0d0e0f',
      }}>
        <span style={{
          fontFamily:'Rajdhani,sans-serif', fontSize:8, fontWeight:700,
          letterSpacing:'0.18em', color:'#3a4050',
        }}>PGM SOURCE</span>
        {modules.map((m, i) => (
          <PgmButton
            key={m.id}
            index={i + 1}
            name={m.name}
            color={m.accentColor}
            active={pgmSource === m.id}
            onClick={() => onSelectSource(m.id)}
          />
        ))}
        <div style={{ flex:1 }}/>
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          paddingInline:2,
        }}>
          <span style={{ fontFamily:'Share Tech Mono,monospace', fontSize:8, color:'#4a5260' }}>
            {Math.round(state.bpm)} BPM
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
          {/* on-air frame */}
          <div style={{
            position:'absolute', inset:0, zIndex:6, pointerEvents:'none',
            border:`1px solid ${active.accentColor}44`,
          }}/>
        </div>
      </div>
    </div>
  );
}
