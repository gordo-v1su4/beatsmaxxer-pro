import { useRef, useState } from 'react';
import { Undo2, Redo2, Shuffle, X, AlignJustify, Play, Square, Upload, Music4, Disc3, Pause } from 'lucide-react';
import { useAudio } from '../audio/AudioContext';
import { shaderCtl } from './EffectModule';

interface TopBarProps {
  onRandomize: () => void;
  onClear: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function TopBar({ onRandomize, onClear, onUndo, onRedo }: TopBarProps) {
  const { state, playing, togglePlay, setBPM, unlockBPM, tapTempo, loadAudioFile, clearUploadedTrack } = useAudio();
  const [tapFlash, setTapFlash] = useState(false);
  const [bpmEdit, setBpmEdit] = useState<string | null>(null);
  const [fxFrozen, setFxFrozen] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const commitBpm = () => {
    if (bpmEdit !== null) {
      const v = parseFloat(bpmEdit);
      if (Number.isFinite(v) && v >= 60 && v <= 200) setBPM(v);
    }
    setBpmEdit(null);
  };

  const handleTap = () => {
    tapTempo();
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 100);
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await loadAudioFile(file);
    e.target.value = '';
  };

  const beatOn = state.beatPhase < 0.15;
  const analysisReady = state.analysisStatus === 'ready';
  const analysisBusy = state.analysisStatus === 'analyzing';
  const analysisFallback = state.analysisStatus === 'fallback';
  const analysisFailed = state.analysisStatus === 'error';

  return (
    <div style={{
      height: 46,
      background: 'linear-gradient(180deg, #202224 0%, #18191b 60%, #141516 100%)',
      borderBottom: '2px solid #0a0b0c',
      borderTop: '1px solid #2a2c2e',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 8px',
      flexShrink: 0,
      boxShadow: '0 2px 10px rgba(0,0,0,0.7)',
      position: 'relative',
      zIndex: 10,
      gap: 6,
    }}>
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        onChange={handleAudioUpload}
        style={{ display: 'none' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 220 }}>
        <button style={{ background:'none', border:'none', cursor:'pointer', padding:'3px', color:'#454a52', display:'flex', alignItems:'center' }}>
          <AlignJustify size={13} />
        </button>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: playing ? '#22c55e' : '#333a42',
          boxShadow: playing ? '0 0 6px #22c55e88' : 'none',
          transition: 'all 0.2s',
        }} />
        <span style={{ fontFamily:'Orbitron,sans-serif', fontSize:10, fontWeight:700, letterSpacing:'0.14em', color:'#7a8090' }}>
          BEATSURFING
        </span>
        <span style={{ color:'#2a3040', fontSize:11 }}>×</span>
        <span style={{ fontFamily:'Orbitron,sans-serif', fontSize:10, fontWeight:700, letterSpacing:'0.14em', color:'#556070' }}>
          CHE
        </span>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:4, flex:1, justifyContent:'center' }}>
        <button
          onClick={togglePlay}
          style={{
            height: 26, paddingInline: 10,
            background: playing
              ? 'linear-gradient(180deg,#1a2a1a,#121c12)'
              : 'linear-gradient(180deg,#1c2020,#141818)',
            borderStyle: 'solid',
            borderWidth: 1,
            borderColor: `${playing ? '#22c55e33' : '#252729'} ${playing ? '#22c55e44' : '#1e2226'} ${playing ? '#22c55e44' : '#1e2226'} ${playing ? '#22c55e44' : '#1e2226'}`,
            borderRadius: 3, cursor:'pointer',
            color: playing ? '#22c55e' : '#4a5565',
            display:'flex', alignItems:'center', gap:4,
            fontFamily:'Rajdhani,sans-serif', fontWeight:700, fontSize:9,
            letterSpacing:'0.1em',
            boxShadow: playing ? '0 0 8px rgba(34,197,94,0.2)' : 'inset 0 1px 3px rgba(0,0,0,0.5)',
            transition:'all 0.1s',
          }}
        >
          {playing ? <Square size={9} /> : <Play size={9} />}
          {playing ? 'STOP' : 'PLAY'}
        </button>

        <button
          onClick={() => audioInputRef.current?.click()}
          style={{
            height: 26, paddingInline: 8,
            background: 'linear-gradient(180deg,#191d24,#12161c)',
            borderStyle: 'solid',
            borderWidth: 1,
            borderColor: '#29313c #20262e #20262e #20262e',
            borderRadius: 3,
            cursor:'pointer',
            color: state.usingUploadedTrack ? '#38bdf8' : '#516072',
            display:'flex', alignItems:'center', gap:4,
            fontFamily:'Rajdhani,sans-serif', fontWeight:700, fontSize:9, letterSpacing:'0.1em',
            boxShadow: state.usingUploadedTrack ? '0 0 8px rgba(56,189,248,0.18)' : 'inset 0 1px 3px rgba(0,0,0,0.5)',
          }}
        >
          <Upload size={10} />
          SONG
        </button>

        {state.usingUploadedTrack && (
          <button
            onClick={clearUploadedTrack}
            style={{
              height: 26, paddingInline: 8,
              background: 'linear-gradient(180deg,#241919,#1b1212)',
              borderStyle: 'solid',
              borderWidth: 1,
              borderColor: '#462828 #382020 #382020 #382020',
              borderRadius: 3,
              cursor:'pointer',
              color: '#d56b6b',
              display:'flex', alignItems:'center', gap:4,
              fontFamily:'Rajdhani,sans-serif', fontWeight:700, fontSize:9, letterSpacing:'0.1em',
            }}
          >
            <X size={10} />
            REMOVE
          </button>
        )}

        <div style={{ width:1, height:20, background:'#1e2226' }}/>

        <div style={{ display:'flex', alignItems:'center', gap:3 }}>
          <div
            title={state.bpmLocked ? 'Manual BPM (click badge to re-enable auto-detect)' : 'Click number to type BPM'}
            style={{
              height: 26, paddingInline: 8,
              background: 'linear-gradient(180deg,#0e1012,#0a0c0e)',
              border: '1px solid #1a1c1e',
              borderRadius: 2,
              display:'flex', alignItems:'center', gap:5,
              boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.7)',
            }}>
            <div style={{
              width: 6, height: 6, borderRadius:'50%',
              background: beatOn && playing ? '#f59e0b' : '#1e2226',
              boxShadow: beatOn && playing ? '0 0 5px #f59e0b' : 'none',
              transition:'background 0.04s, box-shadow 0.04s',
              flexShrink: 0,
            }}/>
            {bpmEdit !== null ? (
              <input
                autoFocus
                value={bpmEdit}
                onChange={e => setBpmEdit(e.target.value.replace(/[^0-9.]/g, ''))}
                onBlur={commitBpm}
                onKeyDown={e => { if (e.key === 'Enter') commitBpm(); if (e.key === 'Escape') setBpmEdit(null); }}
                style={{
                  width: 34, background:'transparent', border:'none', outline:'none',
                  fontFamily:'Share Tech Mono,monospace', fontSize:13, color:'#ffd77a', letterSpacing:'0.05em',
                }}
              />
            ) : (
              <span
                onClick={() => setBpmEdit(String(Math.round(state.bpm)))}
                style={{ fontFamily:'Share Tech Mono,monospace', fontSize:13, color:'#e2a030', letterSpacing:'0.05em', lineHeight:1, cursor:'text' }}
              >
                {Math.round(state.bpm).toString().padStart(3,'0')}
              </span>
            )}
            <span
              onClick={() => { if (state.bpmLocked) unlockBPM(); }}
              style={{
                fontFamily:'Rajdhani,sans-serif', fontSize:7, fontWeight:700, letterSpacing:'0.1em',
                color: state.bpmLocked ? '#e2a030' : '#4a5060',
                cursor: state.bpmLocked ? 'pointer' : 'default',
              }}
            >
              {state.bpmLocked ? 'BPM·M' : 'BPM·A'}
            </span>
          </div>

          <div style={{
            height: 26, paddingInline: 6,
            background: 'linear-gradient(180deg,#0e1012,#0a0c0e)',
            border: '1px solid #1a1c1e', borderRadius: 2,
            display:'flex', alignItems:'center', gap:3,
            boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.7)',
          }}>
            {[0,1,2,3].map(i => {
              const beatInBar = Math.floor(state.beat) % 4;
              const active = i === beatInBar && playing;
              return (
                <div key={i} style={{
                  width: 7, height: 7, borderRadius: 1,
                  background: active ? '#38bdf8' : '#1a1e24',
                  boxShadow: active ? '0 0 5px #38bdf8' : 'none',
                  border: `1px solid ${active ? '#38bdf844' : '#141618'}`,
                  transition: 'all 0.05s',
                }}/>
              );
            })}
          </div>

          <div style={{
            width: 58, height: 26, position:'relative',
            background:'#0a0b0c', border:'1px solid #1a1c1e', borderRadius:2,
            overflow:'hidden',
          }}>
            <div style={{
              position:'absolute', left:0, top:0, bottom:0,
              width:`${state.beatPhase * 100}%`,
              background: `linear-gradient(90deg,#22c55e22,#22c55e55)`,
              borderRight: playing ? '1px solid #22c55e' : 'none',
              transition: state.beatPhase < 0.05 ? 'none' : 'width 0.02s linear',
            }}/>
            <span style={{ position:'absolute', right:3, top:'50%', transform:'translateY(-50%)', fontFamily:'Share Tech Mono,monospace', fontSize:7, color:'#3a4050' }}>
              {state.beatPhase.toFixed(2)}
            </span>
          </div>
        </div>

        <div style={{ width:1, height:20, background:'#1e2226' }}/>

        <div
          title={
            analysisFailed
              ? state.analysisError ?? 'Essentia analysis failed'
              : analysisReady
                ? `Rhythm analysis active${state.analysisConfidence !== null ? ` · ${(state.analysisConfidence * 100).toFixed(0)}% confidence` : ''}`
                : analysisFallback
                  ? `Realtime beat fallback${state.analysisError ? ` · ${state.analysisError}` : ''}`
                : analysisBusy
                  ? 'Rhythm analysis is processing the uploaded song'
                  : 'Realtime fallback beat detection'
          }
          style={{
            height: 26,
            paddingInline: 7,
            background: 'linear-gradient(180deg,#0e1012,#0a0c0e)',
            border: `1px solid ${analysisFailed ? '#4b2323' : analysisReady ? '#204236' : analysisBusy ? '#24425a' : '#1a1c1e'}`,
            borderRadius: 2,
            display:'flex',
            alignItems:'center',
            gap:4,
            boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.7)',
            color: analysisFailed ? '#f87171' : analysisReady ? '#4ade80' : analysisBusy ? '#38bdf8' : '#4a5060',
            fontFamily:'Rajdhani,sans-serif',
            fontWeight:700,
            fontSize:9,
            letterSpacing:'0.1em',
          }}
        >
          <Disc3 size={10} />
          {analysisFailed ? 'RHY·ERR' : analysisReady ? 'RHY·ON' : analysisFallback ? 'RHY·RT' : analysisBusy ? 'RHY·...' : 'RHY·OFF'}
        </div>

        <button
          onClick={handleTap}
          style={{
            height: 26, paddingInline: 8,
            background: tapFlash ? 'linear-gradient(180deg,#1a2a3a,#111c28)' : 'linear-gradient(180deg,#161a1e,#101418)',
            border: `1px solid ${tapFlash ? '#38bdf866' : '#1e2226'}`,
            borderRadius: 3, cursor:'pointer',
            color: tapFlash ? '#38bdf8' : '#3a4555',
            fontFamily:'Rajdhani,sans-serif', fontWeight:700, fontSize:9, letterSpacing:'0.1em',
            boxShadow: tapFlash ? '0 0 8px rgba(56,189,248,0.3)' : 'inset 0 1px 3px rgba(0,0,0,0.5)',
            transition:'all 0.05s',
          }}
        >
          TAP
        </button>

        <div style={{ width:1, height:20, background:'#1e2226' }}/>

        <TopBtn icon={<Undo2 size={10} />} label="UNDO" onClick={onUndo} />
        <TopBtn icon={<Redo2 size={10} />} label="REDO" onClick={onRedo} />
        <TopBtn icon={<Shuffle size={10} />} label="RANDOMIZE" onClick={onRandomize} accent />
        <TopBtn icon={<X size={10} />} label="CLEAR" onClick={onClear} danger />

        <div style={{ width:1, height:20, background:'#1e2226' }}/>

        <button
          onClick={() => { shaderCtl.paused = !shaderCtl.paused; setFxFrozen(shaderCtl.paused); }}
          title={fxFrozen ? 'Resume the FX preview shaders' : 'Freeze all FX preview shaders (if the motion gets distracting)'}
          style={{
            height: 26, paddingInline: 7,
            background: fxFrozen ? 'linear-gradient(180deg,#2a1a1a,#1c1212)' : 'linear-gradient(180deg,#191b1d,#131517)',
            borderStyle: 'solid',
            borderWidth: 1,
            borderColor: `${fxFrozen ? '#ef444444' : '#222428'} ${fxFrozen ? '#ef444466' : '#1a1c1e'} ${fxFrozen ? '#ef444466' : '#1a1c1e'} ${fxFrozen ? '#ef444466' : '#1a1c1e'}`,
            borderRadius: 3, cursor:'pointer',
            color: fxFrozen ? '#ef4444' : '#3a4050',
            fontFamily:'Rajdhani,sans-serif', fontWeight:700, fontSize:9, letterSpacing:'0.1em',
            display:'flex', alignItems:'center', gap:4,
            boxShadow: fxFrozen ? '0 0 8px rgba(239,68,68,0.25)' : 'inset 0 1px 2px rgba(0,0,0,0.4)',
            transition:'all 0.1s',
          }}
        >
          {fxFrozen ? <Play size={10}/> : <Pause size={10}/>}
          {fxFrozen ? 'FX RUN' : 'FX HOLD'}
        </button>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:280, justifyContent:'flex-end' }}>
        <div style={{
          display:'flex', alignItems:'center', gap:6,
          height: 28,
          minWidth: 154,
          maxWidth: 200,
          paddingInline: 8,
          background:'linear-gradient(180deg,#101214,#0b0d0f)',
          border:'1px solid #171a1d',
          borderRadius:3,
          boxShadow:'inset 0 2px 5px rgba(0,0,0,0.7)',
          overflow:'hidden',
        }}>
          {state.usingUploadedTrack ? <Music4 size={11} color="#38bdf8" /> : <Disc3 size={11} color="#556070" />}
          <span style={{
            fontFamily:'Share Tech Mono,monospace',
            fontSize:9,
            color: state.usingUploadedTrack ? '#8ec5ff' : '#556070',
            letterSpacing:'0.03em',
            whiteSpace:'nowrap',
            overflow:'hidden',
            textOverflow:'ellipsis',
          }}>
            {state.trackName}
          </span>
        </div>

        <div style={{ display:'flex', gap:1, alignItems:'flex-end', height:22 }}>
          {Array.from({length:16}).map((_,i) => {
            const threshold = i / 16;
            const lit = playing && state.amplitude * 3.4 > threshold;
            const c = i > 13 ? '#ef4444' : i > 10 ? '#eab308' : '#22c55e';
            return (
              <div key={i} style={{
                width: 3,
                height: 4 + (i < 8 ? i : 15-i),
                background: lit ? c : '#1a1e24',
                boxShadow: lit ? `0 0 3px ${c}66` : 'none',
                borderRadius: 0.5,
                transition: 'background 0.04s',
              }}/>
            );
          })}
        </div>

        <span style={{ fontFamily:'Share Tech Mono,monospace', fontSize:9, color:'#2e3440', letterSpacing:'0.06em' }}>
          CHEat code:e590
        </span>
      </div>
    </div>
  );
}

function TopBtn({ icon, label, onClick, accent, danger }: {
  icon: React.ReactNode; label: string; onClick?: () => void; accent?: boolean; danger?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const c = danger ? '#ef4444' : accent ? '#22c55e' : '#6a7080';
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        height: 26, paddingInline: 7,
        background: hov
          ? `linear-gradient(180deg,${c}18,${c}0c)`
          : 'linear-gradient(180deg,#191b1d,#131517)',
        borderStyle: 'solid',
        borderWidth: 1,
        borderColor: `${hov ? c+'22' : '#222428'} ${hov ? c+'33' : '#1a1c1e'} ${hov ? c+'33' : '#1a1c1e'} ${hov ? c+'33' : '#1a1c1e'}`,
        borderRadius: 3, cursor:'pointer',
        color: hov ? c : '#3a4050',
        fontFamily:'Rajdhani,sans-serif', fontWeight:700, fontSize:9, letterSpacing:'0.1em',
        display:'flex', alignItems:'center', gap:4,
        transition:'all 0.1s',
        boxShadow:'inset 0 1px 2px rgba(0,0,0,0.4)',
      }}
    >
      {icon}{label}
    </button>
  );
}
