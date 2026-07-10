import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Upload, X, Film, AudioLines, Music } from 'lucide-react';
import type { ModuleType, ModuleConfig, VideoLayer, MidiLayer } from '../App';
import { Knob } from './Knob';
import { useAudio } from '../audio/AudioContext';
import { audioEngine } from '../audio/AudioEngine';

interface EffectModuleProps {
  config: ModuleConfig;
  params: Record<string, number>;
  onUpdateParam: (param: string, value: number) => void;
  bypassed: boolean;
  muted: boolean;
  onToggleBypass: () => void;
  onToggleMute: () => void;
  videoLayer: VideoLayer | null;
  onSetVideoLayer: (file: File | null) => void;
  midiLayer: MidiLayer | null;
  onSetMidiLayer: (file: File | null) => void;
}

function Screw() {
  return (
    <div style={{
      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
      background: 'radial-gradient(circle at 38% 35%, #2e3135, #131517)',
      border: '1px solid #0d0e0f',
      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.04)',
      position:'relative',
    }}>
      <div style={{ position:'absolute', top:'50%', left:'15%', right:'15%', height:1, background:'rgba(0,0,0,0.6)', transform:'translateY(-50%)' }}/>
      <div style={{ position:'absolute', left:'50%', top:'15%', bottom:'15%', width:1, background:'rgba(0,0,0,0.6)', transform:'translateX(-50%)' }}/>
    </div>
  );
}

function HeaderBtn({ label, active, activeColor, onClick }: {
  label: string; active?: boolean; activeColor?: string; onClick?: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: 18, height: 14,
        background: active ? `linear-gradient(180deg,${activeColor}33,${activeColor}22)` : hov ? '#1e2022' : '#191b1d',
        border: `1px solid ${active ? activeColor+'55' : '#0e1012'}`,
        borderTop: `1px solid ${active ? activeColor+'33' : '#232527'}`,
        borderRadius: 2, cursor:'pointer',
        color: active ? activeColor : hov ? '#7a8090' : '#3a4050',
        fontFamily:'Rajdhani,sans-serif', fontWeight:700, fontSize:8, letterSpacing:'0.05em',
        display:'flex', alignItems:'center', justifyContent:'center',
        boxShadow: active ? `inset 0 1px 3px rgba(0,0,0,0.6),0 0 5px ${activeColor}33` : 'inset 0 1px 2px rgba(0,0,0,0.4)',
        transition:'all 0.08s',
      }}
    >{label}</button>
  );
}

function VertLabel({ text, color }: { text: string; color: string }) {
  return (
    <div style={{
      writingMode:'vertical-rl', transform:'rotate(180deg)',
      fontFamily:'Rajdhani,sans-serif', fontSize:7, fontWeight:700,
      letterSpacing:'0.12em', textTransform:'uppercase',
      color, opacity:0.65, flexShrink:0, lineHeight:1,
    }}>{text}</div>
  );
}

function RackBtn({ label, active, color, onClick, width, height }: {
  label: string; active?: boolean; color?: string; onClick?: () => void;
  width?: number; height?: number;
}) {
  const [hov, setHov] = useState(false);
  const c = color ?? '#666';
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: width ?? 28, height: height ?? 18,
        background: active ? `linear-gradient(180deg,${c}22,${c}11)` : hov ? '#1e2022' : '#181a1c',
        border: `1px solid ${active ? c+'55' : hov ? '#252729' : '#191b1d'}`,
        borderTop: `1px solid ${active ? c+'33' : '#232527'}`,
        borderRadius: 2, cursor:'pointer',
        color: active ? c : hov ? '#5a6070' : '#333840',
        fontFamily:'Rajdhani,sans-serif', fontWeight:700, fontSize:9, letterSpacing:'0.04em',
        display:'flex', alignItems:'center', justifyContent:'center',
        boxShadow: active ? `inset 0 2px 4px rgba(0,0,0,0.6),0 0 6px ${c}22` : 'inset 0 1px 2px rgba(0,0,0,0.4)',
        transition:'all 0.08s', flexShrink:0,
      }}
    >{label}</button>
  );
}

function Section({ label, color, children, noBorder }: {
  label: string; color: string; children: React.ReactNode; noBorder?: boolean;
}) {
  return (
    <div style={{ borderBottom: noBorder ? 'none' : '1px solid #0d0e0f', display:'flex', alignItems:'stretch', flexShrink:0 }}>
      <div style={{
        width: 11, background:'linear-gradient(180deg,#111214,#0f1012)',
        borderRight:'1px solid #0d0e0f',
        display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
      }}>
        <VertLabel text={label} color={color} />
      </div>
      <div style={{ flex:1, padding:'5px 5px' }}>{children}</div>
    </div>
  );
}

function HSlider({ value, onChange, color, label }: {
  value: number; onChange: (v: number) => void; color: string; label?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const update = useCallback((cx: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    onChange(Math.max(0, Math.min(100, ((cx - rect.left) / rect.width) * 100)));
  }, [onChange]);
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); setDrag(true); update(e.clientX);
    const move = (ev: MouseEvent) => update(ev.clientX);
    const up = () => { setDrag(false); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };
  return (
    <div>
      {label && <div style={{ fontSize:7, fontWeight:700, color:'#3a4050', fontFamily:'Rajdhani,sans-serif', letterSpacing:'0.1em', marginBottom:2 }}>{label}</div>}
      <div ref={trackRef} onMouseDown={onMouseDown} style={{
        height:12, background:'#0a0b0c', border:'1px solid #1e2022',
        borderRadius:1, cursor:'ew-resize', position:'relative',
        boxShadow:'inset 0 1px 3px rgba(0,0,0,0.7)', overflow:'hidden',
      }}>
        <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${value}%`, background:`linear-gradient(90deg,${color}22,${color}44)`, borderRight:`2px solid ${color}` }}/>
        {[25,50,75].map(p => <div key={p} style={{ position:'absolute', left:`${p}%`, top:2, bottom:2, width:1, background:'#1e2022' }}/>)}
        <div style={{ position:'absolute', top:1, bottom:1, left:`calc(${value}% - 4px)`, width:8, background:`linear-gradient(180deg,#2e3238,#1c1e22)`, border:`1px solid ${drag?color:'#333840'}`, borderRadius:1, boxShadow:'0 1px 3px rgba(0,0,0,0.5)' }}/>
      </div>
    </div>
  );
}

function MiniDisplay({ value, width }: { value: string; width?: number }) {
  return (
    <div style={{ width:width??60, height:18, background:'#0a0b0c', border:'1px solid #1a1c1e', borderTop:'1px solid #111', borderRadius:2, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'inset 0 2px 4px rgba(0,0,0,0.7)' }}>
      <span style={{ fontFamily:'Share Tech Mono,monospace', fontSize:9, color:'#6a7a8a', letterSpacing:'0.06em' }}>{value}</span>
    </div>
  );
}

function ScreenOverlay() {
  return (
    <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:5 }}>
      <div style={{ position:'absolute', inset:0, backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 1px,rgba(0,0,0,0.15) 1px,rgba(0,0,0,0.15) 2px)', zIndex:2 }}/>
      <div style={{ position:'absolute', left:0, right:0, top:0, height:'30%', background:'linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0))', zIndex:2 }}/>
      <div style={{ position:'absolute', inset:0, boxShadow:'inset 0 0 24px rgba(0,0,0,0.85),inset 2px 2px 5px rgba(0,0,0,0.5),inset -2px -2px 5px rgba(0,0,0,0.4)', zIndex:3 }}/>
    </div>
  );
}

function ScreenBadge({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ position:'absolute', top:4, left:5, zIndex:10, background:'rgba(0,0,0,0.75)', border:`1px solid ${color}44`, borderRadius:2, padding:'1px 5px' }}>
      <span style={{ fontFamily:'Share Tech Mono,monospace', fontSize:7, color, letterSpacing:'0.08em', opacity:0.85 }}>{text}</span>
    </div>
  );
}

function VUMeter({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:1, height:36, justifyContent:'flex-end' }}>
      {Array.from({length:12}).map((_,i) => {
        const thr = ((11-i)/12)*100;
        const lit = value > thr;
        const bc = i<1 ? '#ef4444' : i<3 ? '#eab308' : color;
        return <div key={i} style={{ height:2, width:5, background:lit?bc:'#1a1c1e', borderRadius:0.5, boxShadow:lit?`0 0 3px ${bc}88`:undefined }}/>;
      })}
    </div>
  );
}

/** True if transport moved from tPrev to tNow across any MIDI note-on time (looping by loopDur). */
function midiNoteCrossed(notes: { time: number }[], tPrev: number, tNow: number, loopDur: number): boolean {
  if (notes.length === 0 || loopDur <= 0) return false;
  const tp = ((tPrev % loopDur) + loopDur) % loopDur;
  const tn = ((tNow % loopDur) + loopDur) % loopDur;
  const eps = 1e-4;
  for (const n of notes) {
    const nt = ((n.time % loopDur) + loopDur) % loopDur;
    if (tn > tp) {
      if (nt > tp + eps && nt <= tn + eps) return true;
    } else if (tn < tp - eps) {
      if (nt > tp + eps || nt <= tn + eps) return true;
    }
  }
  return false;
}

function ThreeVisualizer({ type, color, params, mode, videoUrl, midiLayer, bypassed }: {
  type: ModuleType; color: string; params: Record<string,number>; mode: 'effect'|'output'; videoUrl?: string | null;
  midiLayer?: MidiLayer | null; bypassed?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer|null>(null);
  const materialRef = useRef<THREE.ShaderMaterial|null>(null);
  const frameRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoTextureRef = useRef<THREE.VideoTexture | null>(null);
  const imageTextureRef = useRef<THREE.Texture | null>(null);
  const midiLayerRef = useRef<MidiLayer | null>(null);
  const playingRef = useRef(false);
  const loopRef = useRef({
    lastBeat: 0,
    isStuttering: false,
    stutterVideoTime: 0,
    stutterStartBeat: 0,
    remRepeats: 0,
    beatsPassed: 0,
    lastTransportSec: -1,
    stutterAnchor: 0,
    scratchPongAtBack: true,
  });
  const { state: audioState } = useAudio();

  useEffect(() => {
    midiLayerRef.current = midiLayer ?? null;
  }, [midiLayer]);

  useEffect(() => {
    playingRef.current = audioState.playing;
  }, [audioState.playing]);

  const getUniforms = useCallback(() => {
    const p = (k: string, def = 50) => ((params[k] ?? def) / 100);
    if (type === 'shaper') return {
      uP0: new THREE.Vector4(params.algo ?? 1, p('offset'), p('freq', 30), p('clip', 45)),
      uP1: new THREE.Vector4(p('amount', 70), p('mix', 65), p('in_', 80), p('out', 75)),
      uP2: new THREE.Vector4(0, 0, 0, 0),
    };
    if (type === 'downsampler') return {
      uP0: new THREE.Vector4(p('jitter', 40), params.crushType ?? 0, p('rate', 50), p('bits', 70)),
      uP1: new THREE.Vector4(p('mix', 60), p('in_', 80), p('out', 70), 0),
      uP2: new THREE.Vector4(0, 0, 0, 0),
    };
    if (type === 'tapdelay') return {
      uP0: new THREE.Vector4(params.type ?? 0, p('velCrv', 55), p('end', 70), p('start', 25)),
      uP1: new THREE.Vector4(p('time', 60), p('feedback', 50), p('mix', 55), p('filterSlider', 60)),
      uP2: new THREE.Vector4(p('scratchDepth', 45), params.scratchMode ?? 0, 0, 0),
    };
    return {
      uP0: new THREE.Vector4(params.sync ?? 0, p('notes', 50), p('div', 30), params.engine ?? 2),
      uP1: new THREE.Vector4(p('speed', 40), p('pattern', 60), p('drift', 25), p('freq', 45)),
      uP2: new THREE.Vector4(p('q', 35), p('mix', 50), p('in_', 80), p('out', 60)),
    };
  }, [params, type]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1.0);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);

    // 1x1 black texture keeps uVideoTex bound while the in-shader test pattern is the source
    const fallbackTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    fallbackTexture.needsUpdate = true;
    imageTextureRef.current = fallbackTexture;

    // ping-pong buffers feed the previous output frame back in (real video feedback/trails)
    const rtOpts = {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, stencilBuffer: false,
    };
    const rtW = Math.max(1, container.clientWidth), rtH = Math.max(1, container.clientHeight);
    const rtA = new THREE.WebGLRenderTarget(rtW, rtH, rtOpts);
    const rtB = new THREE.WebGLRenderTarget(rtW, rtH, rtOpts);
    let flip = false;

    const copyMat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: rtA.texture } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `precision mediump float; uniform sampler2D uTex; varying vec2 vUv; void main(){ gl_FragColor = texture2D(uTex, vUv); }`,
    });
    const copyScene = new THREE.Scene();
    const copyGeo = new THREE.PlaneGeometry(2, 2);
    copyScene.add(new THREE.Mesh(copyGeo, copyMat));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:       { value: 0 },
        uResolution: { value: new THREE.Vector2(container.clientWidth, container.clientHeight) },
        uColor:      { value: new THREE.Color(color) },
        uMode:       { value: mode === 'output' ? 1.0 : 0.0 },
        uBypass:     { value: bypassed ? 1.0 : 0.0 },
        uPrevTex:    { value: rtB.texture },
        uBPM:        { value: 128.0 },
        uBeat:       { value: 0.0 },
        uBeatPhase:  { value: 0.0 },
        uAmplitude:  { value: 0.0 },
        uBassAmp:    { value: 0.0 },
        uHighAmp:    { value: 0.0 },
        uFFT0:       { value: new THREE.Vector4() },
        uFFT1:       { value: new THREE.Vector4() },
        uP0:         { value: new THREE.Vector4() },
        uP1:         { value: new THREE.Vector4() },
        uP2:         { value: new THREE.Vector4() },
        uVideoRes:   { value: new THREE.Vector2(16, 9) },
        uVideoTex:   { value: fallbackTexture },
        uHasVideo:   { value: 0.0 },
        uTransportSec: { value: 0.0 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: getFragmentShader(type),
    });
    materialRef.current = mat;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    scene.add(mesh);

    const u = getUniforms();
    mat.uniforms.uP0.value.copy(u.uP0);
    mat.uniforms.uP1.value.copy(u.uP1);
    mat.uniforms.uP2.value.copy(u.uP2);

    const onResize = () => {
      const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
      renderer.setSize(w, h);
      rtA.setSize(w, h);
      rtB.setSize(w, h);
      mat.uniforms.uResolution.value.set(w, h);
    };
    window.addEventListener('resize', onResize);

    let last = performance.now();
    const animate = () => {
      const now = performance.now();
      timeRef.current += (now - last) * 0.001;
      last = now;
      
      const m = materialRef.current;
      if (m) {
        m.uniforms.uTime.value = timeRef.current;
        
        const uBeat = m.uniforms.uBeat.value;
        const st = loopRef.current;
        
        // Tapdelay Stutter Mode (applied across all types for video fx)
        if (type === 'tapdelay' && videoRef.current && m.uniforms.uHasVideo.value > 0.5) {
          const timeP = m.uniforms.uP1.value.x; // STUTTER TIME (0 to 1)
          const freqP = m.uniforms.uP0.value.z; // CHANCE (0 to 1) when not using MIDI
          
          let stutterLen = 1.0;
          if (timeP < 0.2) stutterLen = 0.125;      // 1/32 note
          else if (timeP < 0.4) stutterLen = 0.25;  // 1/16 note
          else if (timeP < 0.6) stutterLen = 0.3333; // 1/8 note triplet
          else if (timeP < 0.8) stutterLen = 0.5;   // 1/8 note
          else stutterLen = 1.0;                    // 1/4 note (1 beat)

          const tNow = audioEngine.getState().time;
          const tPrev = st.lastTransportSec;
          const beatReset = uBeat < st.lastBeat - 0.5;
          const timeBack = tPrev >= 0 && tNow < tPrev - 0.25;
          if (beatReset || timeBack) {
            st.isStuttering = false;
            st.remRepeats = 0;
            st.beatsPassed = 0;
          }

          const midi = midiLayerRef.current;
          const useMidi = !!(midi?.notes?.length);
          let midiHit = false;
          if (!beatReset && !timeBack && useMidi && playingRef.current) {
            const lastT = midi!.notes[midi!.notes.length - 1]!.time;
            const loopDur = Math.max(midi!.duration || 0, lastT + 0.05, 0.25);
            const jump = tPrev >= 0 && Math.abs(tNow - tPrev) > Math.min(2, loopDur * 0.5);
            if (!jump && tPrev >= 0) {
              midiHit = midiNoteCrossed(midi!.notes, tPrev, tNow, loopDur);
            }
          }
          st.lastTransportSec = tNow;

          const scratchMode = Math.min(3, Math.max(0, Math.round(m.uniforms.uP2.value.y)));
          const pDepth = m.uniforms.uP2.value.x;
          const scratchSec = Math.max(1 / 60, Math.min(0.85, (1 + pDepth * 23) / 30));

          const video = videoRef.current;
          const dur = Number.isFinite(video.duration) && video.duration > 0.05 ? video.duration : 1e6;

          const startStutter = () => {
            const bpm = m.uniforms.uBPM.value || 128;
            const beatDuration = 60.0 / bpm;
            const stutterSeconds = stutterLen * beatDuration;
            st.isStuttering = true;
            st.stutterStartBeat = uBeat;
            const repeatsRaw = m.uniforms.uP0.value.y;
            st.remRepeats = Math.max(1, Math.round(repeatsRaw * 8));
            st.stutterAnchor = video.currentTime;

            if (scratchMode === 3) {
              const coin = Math.random() < 0.5 ? -1 : 1;
              st.stutterVideoTime = Math.max(0, Math.min(dur - 0.02, st.stutterAnchor + coin * scratchSec));
              video.currentTime = st.stutterVideoTime;
            } else if (scratchMode === 1 || scratchMode === 2) {
              st.stutterVideoTime = Math.max(0, st.stutterAnchor - scratchSec);
              video.currentTime = st.stutterVideoTime;
              st.scratchPongAtBack = true;
            } else {
              st.stutterVideoTime = Math.max(0, st.stutterAnchor - stutterSeconds);
              video.currentTime = st.stutterVideoTime;
            }
          };

          if (!st.isStuttering) {
            if (useMidi) {
              if (midiHit) startStutter();
            } else if (Math.floor(uBeat) > Math.floor(st.lastBeat) && Math.random() < freqP) {
              startStutter();
            }
          } else {
            if (uBeat - st.stutterStartBeat >= stutterLen) {
              st.remRepeats--;
              if (st.remRepeats > 0) {
                if (scratchMode === 1) {
                  video.currentTime = st.stutterVideoTime;
                } else if (scratchMode === 2) {
                  st.scratchPongAtBack = !st.scratchPongAtBack;
                  video.currentTime = st.scratchPongAtBack ? st.stutterVideoTime : st.stutterAnchor;
                } else if (scratchMode === 3) {
                  const spread = scratchSec * (2 + Math.random() * 5);
                  st.stutterVideoTime = Math.max(0, Math.min(dur - 0.02, st.stutterAnchor + (Math.random() * 2 - 1) * spread));
                  video.currentTime = st.stutterVideoTime;
                } else {
                  video.currentTime = st.stutterVideoTime;
                }
                st.stutterStartBeat = uBeat;
              } else {
                st.isStuttering = false;
              }
            }
          }
          st.lastBeat = uBeat;
        } 
        else if (type === 'bubblegrains' && videoRef.current && m.uniforms.uHasVideo.value > 0.5) {
          const tNowBg = audioEngine.getState().time;
          const tPrevBg = st.lastTransportSec;
          const beatResetBg = uBeat < st.lastBeat - 0.5;
          const timeBackBg = tPrevBg >= 0 && tNowBg < tPrevBg - 0.25;
          if (beatResetBg || timeBackBg) {
            st.isStuttering = false;
            st.remRepeats = 0;
            st.beatsPassed = 0;
          }
          st.lastTransportSec = tNowBg;

          const floorBeat = Math.floor(uBeat);
          const lastFloorBeat = Math.floor(st.lastBeat);
          if (floorBeat > lastFloorBeat) {
            const freq = m.uniforms.uP1.value.w;
            const engine = Math.round(m.uniforms.uP0.value.w);
            const stutterLen = engine + 1;
            
            if (st.isStuttering) {
              st.beatsPassed++;
              if (st.beatsPassed >= stutterLen) {
                st.remRepeats--;
                if (st.remRepeats > 0) {
                  videoRef.current.currentTime = st.stutterVideoTime;
                  st.beatsPassed = 0;
                } else {
                  st.isStuttering = false;
                }
              }
            } else if (Math.random() < freq * 0.35) {
              st.isStuttering = true;
              st.stutterVideoTime = videoRef.current.currentTime;
              st.beatsPassed = 0;
              st.remRepeats = Math.floor(Math.random() * 3) + 1;
            }
          }
          st.lastBeat = uBeat;
        }
      }

      if (videoTextureRef.current) videoTextureRef.current.needsUpdate = true;

      // render into the write buffer while feeding back the previous frame, then blit to screen
      const rtWrite = flip ? rtA : rtB;
      const rtRead = flip ? rtB : rtA;
      mat.uniforms.uPrevTex.value = rtRead.texture;
      renderer.setRenderTarget(rtWrite);
      renderer.render(scene, camera);
      copyMat.uniforms.uTex.value = rtWrite.texture;
      renderer.setRenderTarget(null);
      renderer.render(copyScene, camera);
      flip = !flip;

      frameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', onResize);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      videoTextureRef.current?.dispose();
      imageTextureRef.current?.dispose();
      rtA.dispose();
      rtB.dispose();
      copyGeo.dispose();
      copyMat.dispose();
      renderer.dispose();
      mat.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, color, mode]);

  useEffect(() => {
    if (videoRef.current) {
      if (audioState.playing) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [audioState.playing]);

  useEffect(() => {
    const m = materialRef.current;
    if (!m) return;
    m.uniforms.uColor.value.set(color);
    const u = getUniforms();
    m.uniforms.uP0.value.copy(u.uP0);
    m.uniforms.uP1.value.copy(u.uP1);
    m.uniforms.uP2.value.copy(u.uP2);
  }, [params, color, getUniforms]);

  useEffect(() => {
    const m = materialRef.current;
    if (m) m.uniforms.uBypass.value = bypassed ? 1.0 : 0.0;
  }, [bypassed]);

  useEffect(() => {
    const m = materialRef.current;
    if (!m) return;
    const bands = audioState.fftBands ?? new Array(8).fill(0);
    m.uniforms.uBPM.value = audioState.bpm;
    m.uniforms.uBeat.value = audioState.beat;
    m.uniforms.uBeatPhase.value = audioState.beatPhase;
    m.uniforms.uTransportSec.value = audioState.time;
    m.uniforms.uAmplitude.value = audioState.amplitude;
    m.uniforms.uBassAmp.value = audioState.bassAmp;
    m.uniforms.uHighAmp.value = audioState.highAmp;
    m.uniforms.uFFT0.value.set(bands[0] ?? 0, bands[1] ?? 0, bands[2] ?? 0, bands[3] ?? 0);
    m.uniforms.uFFT1.value.set(bands[4] ?? 0, bands[5] ?? 0, bands[6] ?? 0, bands[7] ?? 0);
  }, [audioState]);

  useEffect(() => {
    const m = materialRef.current;
    if (!m) return;

    videoTextureRef.current?.dispose();
    videoTextureRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
      videoRef.current.load();
      videoRef.current = null;
    }

    if (!videoUrl) {
      m.uniforms.uHasVideo.value = 0.0;
      if (imageTextureRef.current) {
        m.uniforms.uVideoTex.value = imageTextureRef.current;
      }
      return;
    }

    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.addEventListener('loadedmetadata', () => {
      if (m && video.videoWidth > 0 && video.videoHeight > 0) {
        m.uniforms.uVideoRes.value.set(video.videoWidth, video.videoHeight);
      }
    });
    video.play().catch(() => {});
    videoRef.current = video;

    const texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    videoTextureRef.current = texture;

    m.uniforms.uVideoTex.value = texture;
    m.uniforms.uHasVideo.value = 1.0;

    return () => {
      texture.dispose();
      video.pause();
      video.src = '';
      video.load();
    };
  }, [videoUrl]);

  return <div ref={containerRef} style={{ width:'100%', height:'100%' }}/>;
}

function MediaPatchBay({ color, videoLayer, onSetVideoLayer, midiLayer, onSetMidiLayer }: {
  color: string;
  videoLayer: VideoLayer | null;
  onSetVideoLayer: (file: File | null) => void;
  midiLayer: MidiLayer | null;
  onSetMidiLayer: (file: File | null) => void;
}) {
  const videoInputRef = useRef<HTMLInputElement>(null);
  const midiInputRef = useRef<HTMLInputElement>(null);

  const uploadBtnStyle = (active: boolean) => ({
    height:18, paddingInline:5,
    background:'linear-gradient(180deg,#191d22,#121519)',
    border:`1px solid ${active ? color+'44' : '#1a1d22'}`,
    borderTop:'1px solid #252a30',
    borderRadius:2,
    color: active ? color : '#445060',
    display:'flex' as const, alignItems:'center' as const, gap:3,
    cursor:'pointer' as const,
    fontFamily:'Rajdhani,sans-serif', fontSize:7, fontWeight:700, letterSpacing:'0.08em',
    boxShadow: active ? `0 0 8px ${color}22` : 'inset 0 1px 2px rgba(0,0,0,0.4)',
  });

  return (
    <div style={{
      display:'flex', alignItems:'center', gap:3,
      padding:'3px 5px',
      background:'linear-gradient(180deg,#111315,#0d0f11)',
      borderBottom:'1px solid #0d0e0f',
      flexShrink:0,
    }}>
      {/* Video upload */}
      <input ref={videoInputRef} type="file" accept="video/*"
        onChange={(e) => { onSetVideoLayer(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }}
        style={{ display:'none' }}
      />
      <button onClick={() => videoInputRef.current?.click()} style={uploadBtnStyle(!!videoLayer)}>
        <Upload size={8} /> CLIP
      </button>

      {/* Video name display */}
      <div style={{
        flex:1, minWidth:0, height:18,
        background:'#0a0b0c',
        border:'1px solid #171a1d', borderTop:'1px solid #101214', borderRadius:2,
        display:'flex', alignItems:'center', gap:4, paddingInline:5,
        boxShadow:'inset 0 2px 5px rgba(0,0,0,0.75)',
      }}>
        <Film size={8} color={videoLayer ? color : '#3a4050'} />
        <span style={{
          fontFamily:'Share Tech Mono,monospace', fontSize:7, letterSpacing:'0.03em',
          color: videoLayer ? '#c0d7ff' : '#4a5260',
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
        }}>
          {videoLayer?.name ?? 'Test pattern'}
        </span>
      </div>
      {videoLayer && (
        <button onClick={() => onSetVideoLayer(null)} style={{
          width:18, height:18,
          background:'linear-gradient(180deg,#241919,#1b1212)', border:'1px solid #342020', borderRadius:2,
          color:'#c46b6b', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
        }}><X size={8} /></button>
      )}

      {/* Separator */}
      <div style={{ width:1, height:14, background:'#1a1d22', flexShrink:0 }}/>

      {/* MIDI upload */}
      <input ref={midiInputRef} type="file" accept=".mid,.midi"
        onChange={(e) => { onSetMidiLayer(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }}
        style={{ display:'none' }}
      />
      <button onClick={() => midiInputRef.current?.click()} style={uploadBtnStyle(!!midiLayer)}>
        <Music size={8} /> MIDI
      </button>

      {/* MIDI name display */}
      <div style={{
        flex:1, minWidth:0, height:18,
        background:'#0a0b0c',
        border:'1px solid #171a1d', borderTop:'1px solid #101214', borderRadius:2,
        display:'flex', alignItems:'center', gap:4, paddingInline:5,
        boxShadow:'inset 0 2px 5px rgba(0,0,0,0.75)',
      }}>
        <Music size={8} color={midiLayer ? color : '#3a4050'} />
        <span style={{
          fontFamily:'Share Tech Mono,monospace', fontSize:7, letterSpacing:'0.03em',
          color: midiLayer ? '#c0d7ff' : '#4a5260',
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
        }}>
          {midiLayer ? `${midiLayer.name}` : 'No MIDI'}
        </span>
      </div>
      {midiLayer && (
        <button onClick={() => onSetMidiLayer(null)} style={{
          width:18, height:18,
          background:'linear-gradient(180deg,#241919,#1b1212)', border:'1px solid #342020', borderRadius:2,
          color:'#c46b6b', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
        }}><X size={8} /></button>
      )}
    </div>
  );
}

function MidiTimeline({ color, midiLayer }: {
  color: string;
  midiLayer: MidiLayer;
}) {
  const { state } = useAudio();
  const containerRef = useRef<HTMLDivElement>(null);

  const currentTime = state.time;

  // Visible window: show 8 seconds of the timeline, centered on current playhead
  const windowSize = 8;
  const windowStart = currentTime - windowSize / 2;
  const windowEnd = currentTime + windowSize / 2;

  // Filter notes in visible window
  const visibleNotes = midiLayer.notes.filter(
    n => n.time >= windowStart - 0.1 && n.time <= windowEnd + 0.1
  );

  return (
    <div
      ref={containerRef}
      style={{
        position:'relative',
        height: 28,
        background:'#08090a',
        borderBottom:'1px solid #0d0e0f',
        overflow:'hidden',
        flexShrink:0,
        boxShadow:'inset 0 2px 6px rgba(0,0,0,0.8)',
      }}
    >
      {/* Playhead - fixed center line */}
      <div style={{
        position:'absolute',
        left:'50%',
        top:0,
        bottom:0,
        width:1,
        background: color,
        boxShadow:`0 0 6px ${color}88, 0 0 12px ${color}44`,
        zIndex:5,
      }}/>

      {/* Dim center glow */}
      <div style={{
        position:'absolute',
        left:'calc(50% - 12px)',
        top:0,
        bottom:0,
        width:24,
        background:`radial-gradient(ellipse at center, ${color}15, transparent 70%)`,
        zIndex:1,
        pointerEvents:'none',
      }}/>

      {/* Note markers */}
      {visibleNotes.map((note, i) => {
        const pct = ((note.time - windowStart) / windowSize) * 100;
        const opacity = Math.min(1, note.velocity / 127);
        // Brightness based on proximity to playhead
        const dist = Math.abs(note.time - currentTime);
        const glow = dist < 0.05;

        return (
          <div
            key={`${note.time}-${note.note}-${i}`}
            style={{
              position:'absolute',
              left:`${pct}%`,
              top: 2,
              bottom: 2,
              width: glow ? 2 : 1,
              background: color,
              opacity: glow ? 1 : opacity * 0.7 + 0.15,
              boxShadow: glow ? `0 0 6px ${color}, 0 0 10px ${color}88` : `0 0 3px ${color}44`,
              borderRadius: 1,
              zIndex: glow ? 4 : 2,
              transition:'opacity 0.03s',
            }}
          />
        );
      })}

      {/* Label */}
      <div style={{
        position:'absolute', right:5, top:'50%', transform:'translateY(-50%)',
        zIndex:6, pointerEvents:'none',
        display:'flex', alignItems:'center', gap:3,
      }}>
        <span style={{ fontFamily:'Share Tech Mono,monospace', fontSize:7, color:'#566070' }}>
          MIDI
        </span>
      </div>
    </div>
  );
}

function FFTStrip({ color }: { color: string }) {
  const { state } = useAudio();
  const bands = state.fftBands ?? new Array(8).fill(0);
  return (
    <div style={{
      display:'flex', alignItems:'flex-end', gap:2,
      height:26,
      padding:'4px 5px 3px',
      borderBottom:'1px solid #0d0e0f',
      background:'linear-gradient(180deg,#0f1113,#0b0d0f)',
      flexShrink:0,
    }}>
      <AudioLines size={9} color={color} style={{ marginRight: 2, alignSelf:'center' }} />
      {bands.map((b, i) => (
        <div key={i} style={{
          flex:1,
          height: `${Math.max(10, b * 100)}%`,
          background: `linear-gradient(180deg, ${color}, ${color}55)`,
          borderRadius:'1px 1px 0 0',
          boxShadow:`0 0 6px ${color}33`,
          minHeight: 4,
          transition:'height 0.05s linear',
        }} />
      ))}
      <div style={{ width:36, alignSelf:'center', textAlign:'right' }}>
        <span style={{ fontFamily:'Share Tech Mono,monospace', fontSize:7, color:'#566070' }}>
          FFT
        </span>
      </div>
    </div>
  );
}

function DualScreen({ type, color, params, videoLayer, onSetVideoLayer, midiLayer, onSetMidiLayer, bypassed }: {
  type: ModuleType; color: string; params: Record<string,number>; videoLayer: VideoLayer | null; onSetVideoLayer: (file: File | null) => void; midiLayer: MidiLayer | null; onSetMidiLayer: (file: File | null) => void; bypassed: boolean;
}) {
  const { state } = useAudio();
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current++;
    setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type.startsWith('video/')) onSetVideoLayer(file);
    else if (/\.midi?$/i.test(file.name)) onSetMidiLayer(file);
  };

  const mixPct = Math.round(params.mix ?? 50);
  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{ position:'relative', display:'flex', flexDirection:'column', flexShrink:0, background:'#000', borderBottom:'2px solid #0d0e0f' }}
    >
      <MediaPatchBay color={color} videoLayer={videoLayer} onSetVideoLayer={onSetVideoLayer} midiLayer={midiLayer} onSetMidiLayer={onSetMidiLayer} />
      {midiLayer && <MidiTimeline color={color} midiLayer={midiLayer} />}
      <FFTStrip color={color} />
      <div style={{ position:'relative', width:'100%', aspectRatio:'16/9', minHeight:0, height:'auto', background:'#000', borderBottom:'1px solid #111', flexShrink:0 }}>
        <ThreeVisualizer type={type} color={color} params={params} mode="effect" videoUrl={videoLayer?.url} midiLayer={midiLayer} bypassed={bypassed} />
        <ScreenOverlay/>
        <ScreenBadge text="FX PREVIEW · 100% WET" color={color}/>
        <div style={{ position:'absolute', bottom:4, left:5, zIndex:10, background:'rgba(0,0,0,0.7)', borderRadius:2, padding:'0px 4px' }}>
          <span style={{ fontFamily:'Share Tech Mono,monospace', fontSize:6.5, color:'#566070', letterSpacing:'0.08em' }}>
            {videoLayer ? 'SRC · CLIP' : 'SRC · TEST PATTERN'}
          </span>
        </div>
        <div style={{ position:'absolute', top:4, right:5, zIndex:8, display:'flex', gap:2, alignItems:'flex-end' }}>
          <VUMeter value={(state.bassAmp * 100) || (params.in_ ?? 70)} color={color}/>
          <VUMeter value={(state.amplitude * 200) || (params.out ?? 55)} color={color}/>
        </div>
        {state.beatPhase < 0.08 && state.playing && (
          <div style={{ position:'absolute', inset:0, zIndex:4, pointerEvents:'none', border:`1px solid ${color}44`, borderRadius:0, boxShadow:`inset 0 0 12px ${color}22` }}/>
        )}
      </div>
      <div style={{ position:'relative', width:'100%', aspectRatio:'16/9', minHeight:0, height:'auto', background:'#000', flexShrink:0 }}>
        <ThreeVisualizer type={type} color={color} params={params} mode="output" videoUrl={videoLayer?.url} midiLayer={midiLayer} bypassed={bypassed} />
        <ScreenOverlay/>
        <ScreenBadge
          text={bypassed ? 'OUTPUT · BYPASSED' : `OUTPUT · MIX ${mixPct}%`}
          color={bypassed ? '#ef4444' : color}
        />
      </div>
      {dragOver && (
        <div style={{
          position:'absolute', inset:3, zIndex:20, pointerEvents:'none',
          border:`2px dashed ${color}`, borderRadius:4,
          background:'rgba(0,0,0,0.55)', backdropFilter:'blur(1px)',
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4,
        }}>
          <Upload size={18} color={color} />
          <span style={{ fontFamily:'Rajdhani,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.15em', color }}>
            DROP CLIP / MIDI
          </span>
        </div>
      )}
    </div>
  );
}

function ShaperControls({ params, onUpdate, color }: { params: Record<string,number>; onUpdate:(p:string,v:number)=>void; color:string }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1 }}>
      <Section label="TYPE" color={color}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:3 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
            <span style={{ fontSize:7, fontWeight:700, letterSpacing:'0.1em', color:'#3a4050', fontFamily:'Rajdhani,sans-serif' }}>ALGO</span>
            <div style={{ display:'flex', gap:2 }}>
              {[1,2,3,4].map(n => (
                <RackBtn key={n} label={String(n)} active={Math.round(params.algo??1)===n} color={color} onClick={()=>onUpdate('algo',n)}/>
              ))}
            </div>
          </div>
          <Knob label="OFFSET" value={params.offset??50} onChange={v=>onUpdate('offset',v)} size="sm" color={color}/>
        </div>
      </Section>
      <div style={{ borderBottom:'1px solid #0d0e0f', background:'#0c0d0e', padding:'4px 5px', display:'flex', gap:3, alignItems:'center', flexShrink:0 }}>
        <ShaperBars algo={Math.round(params.algo??1)} amount={params.amount??70} freq={params.freq??30} color={color}/>
      </div>
      <Section label="RAMP" color={color} noBorder>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Knob label="FREQ" value={params.freq??30} onChange={v=>onUpdate('freq',v)} size="sm" color={color}/>
          <Knob label="CLIP" value={params.clip??45} onChange={v=>onUpdate('clip',v)} size="sm" color={color}/>
          <Knob label="AMT" value={params.amount??70} onChange={v=>onUpdate('amount',v)} size="sm" color={color}/>
        </div>
      </Section>
    </div>
  );
}

function ShaperBars({ algo, amount, freq, color }: { algo:number; amount:number; freq:number; color:string }) {
  const { state } = useAudio();
  const bars = 14;
  return (
    <div style={{ flex:1, height:44, background:'#0a0b0c', border:'1px solid #1a1c1e', borderRadius:1, display:'flex', alignItems:'flex-end', gap:1, padding:'2px 2px 0', overflow:'hidden', position:'relative', boxShadow:'inset 0 2px 4px rgba(0,0,0,0.5)' }}>
      {Array.from({length:bars}).map((_,i) => {
        const phase = (i/bars)*Math.PI*2 + state.beatPhase * Math.PI * (1 + freq / 50);
        let h = 0.3;
        if(algo===1) h=(Math.sin(phase)*0.5+0.5);
        else if(algo===2) h=Math.abs(Math.sin(phase));
        else if(algo===3) h=Math.sin(phase)>0?0.9:0.1;
        else h=Math.abs(Math.sin(phase*1.7+0.3))*0.8+0.15;
        h = h*(amount/100)*0.85+0.08;
        const beatBump = state.bassAmp * 0.3;
        h = Math.min(1, h + beatBump);
        const pct = Math.max(5, Math.min(100, h*100));
        const isClip = pct > (freq/100)*85+10;
        return <div key={i} style={{ flex:1, height:`${pct}%`, background:isClip?`linear-gradient(180deg,#ff4422,${color}88)`:`linear-gradient(180deg,${color},${color}66)`, borderRadius:'1px 1px 0 0', boxShadow:`0 0 3px ${color}44`, transition:'height 0.05s ease' }}/>;
      })}
    </div>
  );
}

function DownsamplerControls({ params, onUpdate, color }: { params: Record<string,number>; onUpdate:(p:string,v:number)=>void; color:string }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1 }}>
      <Section label="CRUSH" color={color}>
        <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'space-between' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
            <span style={{ fontSize:7, fontWeight:700, color:'#3a4050', fontFamily:'Rajdhani,sans-serif', letterSpacing:'0.1em' }}>MODE</span>
            <div style={{ display:'flex', gap:2 }}>
              {['PIX','BIT','GLT'].map((t,i) => (
                <RackBtn key={t} label={t} active={Math.round(params.crushType??0)===i} color={color} onClick={()=>onUpdate('crushType',i)} width={26}/>
              ))}
            </div>
          </div>
          <Knob label="JITTER" value={params.jitter??40} onChange={v=>onUpdate('jitter',v)} size="sm" color={color}/>
        </div>
      </Section>
      <div style={{ borderBottom:'1px solid #0d0e0f', background:'#0c0d0e', padding:'4px 5px', flexShrink:0 }}>
        <PixelPreview jitter={params.jitter??40} mode={Math.round(params.crushType??0)} color={color}/>
      </div>
      <Section label="RATE" color={color} noBorder>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Knob label="RATE" value={params.rate??50} onChange={v=>onUpdate('rate',v)} size="sm" color={color}/>
          <Knob label="BITS" value={params.bits??70} onChange={v=>onUpdate('bits',v)} size="sm" color={color}/>
          <Knob label="MIX" value={params.mix??60} onChange={v=>onUpdate('mix',v)} size="sm" color={color}/>
        </div>
      </Section>
    </div>
  );
}

function PixelPreview({ jitter, mode, color }: { jitter:number; mode:number; color:string }) {
  const { state } = useAudio();
  const cols = 14, rows = 4;
  const pulse = state.bassAmp;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
      {Array.from({length:rows}).map((_,r) => (
        <div key={r} style={{ display:'flex', gap:1 }}>
          {Array.from({length:cols}).map((_,c) => {
            const val = Math.sin(r*3.1+c*1.7+jitter*0.1+state.beatPhase*6)*0.5+0.5;
            const glitch = mode===2 && ((c + r + state.beat) % 5 === 0);
            const bit = mode===1 ? Math.round(val) : val;
            const bright = glitch ? 1 : (bit*(jitter/100)*0.8+0.1) * (1 + pulse*0.5);
            return <div key={c} style={{ flex:1, height:6, background:glitch?`rgba(255,50,50,${bright})`:`${color}${Math.round(Math.min(1,bright)*180).toString(16).padStart(2,'0')}`, borderRadius:0.5 }}/>;
          })}
        </div>
      ))}
    </div>
  );
}

function TapDelayControls({ params, onUpdate, color }: { params: Record<string,number>; onUpdate:(p:string,v:number)=>void; color:string }) {
  const { state: audioState, tapTempo } = useAudio();
  const [tapFlash, setTapFlash] = useState(false);

  const handleTap = useCallback(() => {
    tapTempo();
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 120);
    onUpdate('time', Math.max(0, Math.min(100, (60000/audioState.bpm)/2000*100)));
  }, [tapTempo, onUpdate, audioState.bpm]);

  const stutterMode = Math.round(params.type ?? 0) === 1;
  const labelStyle = { fontSize:9, fontWeight:700 as const, color:'#4a5565', fontFamily:'Rajdhani,sans-serif', letterSpacing:'0.1em' };

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1 }}>
      <Section label="TYPE" color={color}>
        <div style={{ display:'flex', gap:2 }}>
          {['Pan','Stutter','Filter'].map((t,i) => (
            <RackBtn key={t} label={t} active={Math.round(params.type??0)===i} color={color} onClick={()=>onUpdate('type',i)} width={i===1?44:34}/>
          ))}
        </div>
      </Section>
      <div style={{ padding:'4px 5px', borderBottom:'1px solid #0d0e0f', flexShrink:0 }}>
        <button onClick={handleTap} style={{
          height:44, width:'100%',
          background: tapFlash ? 'linear-gradient(180deg,#1a2030,#141820)' : 'linear-gradient(180deg,#1c1e22,#141618)',
          border:`1px solid ${tapFlash?'#3b82f666':'#1e2226'}`,
          borderTop:`1px solid ${tapFlash?'#3b82f644':'#272b30'}`,
          borderRadius:3, cursor:'pointer',
          color: tapFlash ? '#3b82f6' : '#3a4050',
          fontFamily:'Orbitron,sans-serif', fontWeight:700, fontSize:14, letterSpacing:'0.25em',
          boxShadow: tapFlash?'inset 0 3px 8px rgba(0,0,0,0.8),0 0 12px rgba(59,130,246,0.25)':'inset 0 1px 2px rgba(0,0,0,0.4)',
          transition:'all 0.08s',
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2,
        }}>
          TAP
          <span style={{ fontSize:8, letterSpacing:'0.05em', color:tapFlash?'#3b82f688':'#2a3040', fontFamily:'Rajdhani,sans-serif' }}>
            {Math.round(audioState.bpm)} BPM
          </span>
        </button>
      </div>

      {stutterMode ? (
        <>
          <Section label="LEN" color={color}>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <div style={labelStyle}>STUTTER LENGTH</div>
              <div style={{ display:'flex', gap:2 }}>
                {[
                  { l: '1/32', val: 10 },
                  { l: '1/16', val: 30 },
                  { l: '1/8T', val: 50 },
                  { l: '1/8', val: 70 },
                  { l: '1/4', val: 90 },
                ].map((v) => {
                   const isActive = Math.abs((params.time??60) - v.val) <= 10;
                   return <RackBtn key={v.l} label={v.l} active={isActive} color={color} onClick={()=>onUpdate('time',v.val)} width={28}/>;
                })}
              </div>
            </div>
          </Section>

          <Section label="RPT" color={color}>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <div style={labelStyle}>REPEATS</div>
              <div style={{ display:'flex', gap:2 }}>
                {[1, 2, 4, 6, 8].map((n) => {
                  const currentRepeats = Math.round((params.velCrv ?? 25) / 100 * 8) || 1;
                  const isActive = currentRepeats === n;
                  return <RackBtn key={n} label={`${n}×`} active={isActive} color={color} onClick={()=>onUpdate('velCrv', (n / 8) * 100)} width={28}/>;
                })}
              </div>
            </div>
          </Section>

          <Section label="SCR" color={color}>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <div style={labelStyle}>MOTION</div>
              <div style={{ display:'flex', gap:2, flexWrap:'wrap' }}>
                {[
                  { l: 'BEAT', v: 0 },
                  { l: 'LOOP', v: 1 },
                  { l: 'PONG', v: 2 },
                  { l: 'RND', v: 3 },
                ].map((o) => (
                  <RackBtn
                    key={o.l}
                    label={o.l}
                    active={Math.round(params.scratchMode ?? 0) === o.v}
                    color={color}
                    onClick={() => onUpdate('scratchMode', o.v)}
                    width={30}
                  />
                ))}
              </div>
              <HSlider value={params.scratchDepth ?? 45} onChange={(v) => onUpdate('scratchDepth', v)} color={color} label="DEPTH (≈frames)" />
            </div>
          </Section>

          <Section label="TRIG" color={color} noBorder>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <div style={labelStyle}>CHANCE</div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ flex:1 }}>
                  <HSlider value={params.end??70} onChange={v=>onUpdate('end',v)} color={color}/>
                </div>
                <MiniDisplay value={`${Math.round(params.end??70)}%`} width={36}/>
              </div>
            </div>
          </Section>
        </>
      ) : (
        <>
          <Section label="TIME" color={color}>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <HSlider value={params.time??60} onChange={v=>onUpdate('time',v)} color={color} label="DELAY TIME"/>
              <HSlider value={params.feedback??50} onChange={v=>onUpdate('feedback',v)} color={color} label="FEEDBACK"/>
            </div>
          </Section>
          <Section label="TRIG" color={color} noBorder>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <Knob label="CHANCE" value={params.end??70} onChange={v=>onUpdate('end',v)} size="sm" color={color}/>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function BubbleGrainsControls({ params, onUpdate, color }: { params: Record<string,number>; onUpdate:(p:string,v:number)=>void; color:string }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1 }}>
      <Section label="TIME" color={color}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:3 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
            <div style={{ display:'flex', alignItems:'center', gap:3 }}>
              <span style={{ fontSize:7, fontWeight:700, color:'#3a4050', letterSpacing:'0.1em', fontFamily:'Rajdhani,sans-serif' }}>SYNC</span>
              <RackBtn label="ON" active={!!params.sync} color={color} onClick={()=>onUpdate('sync',params.sync?0:1)} width={24}/>
            </div>
            <MiniDisplay value={params.sync?'SYNC':'FREE'} width={52}/>
          </div>
          <Knob label="MOD" value={params.notes??50} onChange={v=>onUpdate('notes',v)} size="sm" color={color}/>
          <Knob label="DIV" value={params.div??30} onChange={v=>onUpdate('div',v)} size="sm" color={color}/>
        </div>
      </Section>
      <Section label="ENG" color={color}>
        <div style={{ display:'flex', gap:2, alignItems:'center' }}>
          <span style={{ fontSize:7, fontWeight:700, color:'#3a4050', fontFamily:'Rajdhani,sans-serif', letterSpacing:'0.1em' }}>ENGINE</span>
          {[0,1,2,3].map(n => (
            <RackBtn key={n} label={String(n)} active={Math.round(params.engine??2)===n} color={color} onClick={()=>onUpdate('engine',n)}/>
          ))}
        </div>
      </Section>
      <Section label="SHPE" color={color}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Knob label="SPD" value={params.speed??40} onChange={v=>onUpdate('speed',v)} size="sm" color={color}/>
          <Knob label="PAT" value={params.pattern??60} onChange={v=>onUpdate('pattern',v)} size="sm" color={color}/>
          <Knob label="DFT" value={params.drift??25} onChange={v=>onUpdate('drift',v)} size="sm" color={color}/>
        </div>
      </Section>
      <Section label="FILT" color={color} noBorder>
        <div style={{ display:'flex', justifyContent:'space-around', alignItems:'center' }}>
          <Knob label="FREQ" value={params.freq??45} onChange={v=>onUpdate('freq',v)} size="sm" color={color}/>
          <Knob label="Q" value={params.q??35} onChange={v=>onUpdate('q',v)} size="sm" color={color}/>
        </div>
      </Section>
    </div>
  );
}

function MixSection({ params, onUpdate, color }: { params:Record<string,number>; onUpdate:(p:string,v:number)=>void; color:string }) {
  const [routeA, setRouteA] = useState(true);
  const [routeB, setRouteB] = useState(false);
  return (
    <div style={{
      background:'linear-gradient(180deg,#111214,#0f1012)',
      borderTop:'2px solid #0d0e0f', padding:'5px 5px 5px 3px',
      display:'flex', alignItems:'flex-end', gap:3, flexShrink:0,
    }}>
      <VertLabel text="MIX" color={color}/>
      <div style={{ flex:1, display:'flex', justifyContent:'space-around', alignItems:'flex-end' }}>
        <Knob label="IN" value={params.in_??80} onChange={v=>onUpdate('in_',v)} size="sm" color={color}/>
        <Knob label="MIX" value={params.mix??50} onChange={v=>onUpdate('mix',v)} size="sm" color={color}/>
        <Knob label="OUT" value={params.out??60} onChange={v=>onUpdate('out',v)} size="sm" color={color}/>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
        <RackBtn label="A" active={routeA} color={color} onClick={()=>setRouteA(v=>!v)} width={18} height={14}/>
        <RackBtn label="B" active={routeB} color={color} onClick={()=>setRouteB(v=>!v)} width={18} height={14}/>
      </div>
    </div>
  );
}

export function EffectModule({ config, params, onUpdateParam, bypassed, muted, onToggleBypass, onToggleMute, videoLayer, onSetVideoLayer, midiLayer, onSetMidiLayer }: EffectModuleProps) {
  const { id, name, accentColor } = config;
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{
      flex:1, minWidth:0,
      background:'#131416',
      borderRight:'1px solid #0d0e0f',
      display:'flex', flexDirection:'column',
      opacity: muted ? 0.35 : bypassed ? 0.55 : 1,
      filter: bypassed ? 'saturate(0.15) brightness(0.6)' : undefined,
      position:'relative', overflow:'hidden',
    }}>
      <div style={{
        display:'flex', alignItems:'center', padding:'0 5px', height:26,
        background:'linear-gradient(180deg,#1e2124,#181a1c 55%,#141618 100%)',
        borderBottom:'1px solid #0d0e0f', borderTop:'1px solid #252729',
        gap:3, flexShrink:0,
      }}>
        <Screw/>
        <div style={{ display:'flex', flexDirection:'column', gap:1.5, marginLeft:1 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ display:'flex', gap:1.5 }}>
              <div style={{ width:2, height:2, background:'#2a2e34', borderRadius:'50%' }}/>
              <div style={{ width:2, height:2, background:'#2a2e34', borderRadius:'50%' }}/>
            </div>
          ))}
        </div>
        <span style={{
          fontFamily:'Rajdhani,sans-serif', fontSize:10, fontWeight:700,
          letterSpacing:'0.14em', textTransform:'uppercase', color:'#7a8090', flex:1, marginLeft:3,
        }}>{name}</span>
        <button
          onClick={() => setCollapsed(v => !v)}
          title={collapsed ? 'Expand controls' : 'Collapse controls'}
          style={{ width:12, height:12, border:'1px solid #1e2226', borderRadius:2, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', background:'linear-gradient(180deg,#1c1e22,#141618)', padding:0 }}
        >
          <svg width={7} height={4} viewBox="0 0 7 4" style={{ transform: collapsed ? 'rotate(180deg)' : undefined, transition:'transform 0.15s' }}>
            <path d="M0 0 L3.5 4 L7 0" fill="none" stroke={collapsed ? accentColor : '#3a4050'} strokeWidth={1.2}/>
          </svg>
        </button>
        <HeaderBtn label="B" active={bypassed} activeColor="#ef4444" onClick={onToggleBypass}/>
        <HeaderBtn label="M" active={muted} activeColor="#eab308" onClick={onToggleMute}/>
        <Screw/>
      </div>

      <DualScreen type={id} color={accentColor} params={params} videoLayer={videoLayer} onSetVideoLayer={onSetVideoLayer} midiLayer={midiLayer} onSetMidiLayer={onSetMidiLayer} bypassed={bypassed} />

      {!collapsed && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflowY:'auto', overflowX:'hidden' }}>
          {id==='shaper' && <ShaperControls params={params} onUpdate={onUpdateParam} color={accentColor}/>}
          {id==='downsampler' && <DownsamplerControls params={params} onUpdate={onUpdateParam} color={accentColor}/>}
          {id==='tapdelay' && <TapDelayControls params={params} onUpdate={onUpdateParam} color={accentColor}/>}
          {id==='bubblegrains' && <BubbleGrainsControls params={params} onUpdate={onUpdateParam} color={accentColor}/>}
        </div>
      )}
      {collapsed && <div style={{ flex:1 }}/>}

      <MixSection params={params} onUpdate={onUpdateParam} color={accentColor}/>
    </div>
  );
}

function getFragmentShader(type: ModuleType): string {
  const common = `
    precision highp float;
    uniform float uTime;
    uniform vec2  uResolution;
    uniform vec2  uVideoRes;
    uniform vec3  uColor;
    uniform float uMode;
    uniform float uBypass;
    uniform float uBPM;
    uniform float uBeat;
    uniform float uBeatPhase;
    uniform float uAmplitude;
    uniform float uBassAmp;
    uniform float uHighAmp;
    uniform vec4 uFFT0;
    uniform vec4 uFFT1;
    uniform vec4 uP0;
    uniform vec4 uP1;
    uniform vec4 uP2;
    uniform sampler2D uVideoTex;
    uniform sampler2D uPrevTex;
    uniform float uHasVideo;
    varying vec2 vUv;

    #define PI  3.14159265359
    #define TAU 6.28318530718

    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float beatPulse(float sharpness){ return exp(-uBeatPhase * sharpness); }
    float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

    vec3 rgb2hsv(vec3 c){
      vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0*d + e)), d / (q.x + e), q.x);
    }

    vec3 sampleVideo(vec2 uv){
      float screenAspect = uResolution.x / uResolution.y;
      float videoAspect = uVideoRes.x / max(1.0, uVideoRes.y);
      vec2 scale = vec2(1.0);
      if (screenAspect > videoAspect) {
         scale.y = screenAspect / videoAspect;
      } else {
         scale.x = videoAspect / screenAspect;
      }
      vec2 suv = (uv - 0.5) * scale + 0.5;
      return texture2D(uVideoTex, clamp(suv, 0.0, 1.0)).rgb;
    }

    vec3 smpteBar(float i){
      if(i < 0.5) return vec3(0.82);
      if(i < 1.5) return vec3(0.82, 0.82, 0.0);
      if(i < 2.5) return vec3(0.0, 0.82, 0.82);
      if(i < 3.5) return vec3(0.0, 0.82, 0.0);
      if(i < 4.5) return vec3(0.82, 0.0, 0.82);
      if(i < 5.5) return vec3(0.82, 0.0, 0.0);
      return vec3(0.0, 0.0, 0.82);
    }

    /* Animated broadcast-style test card, used as the source when no clip is loaded
       so every effect previews on real picture content. */
    vec3 testPattern(vec2 uv){
      float t = uTime;
      float aspect = uResolution.x / uResolution.y;
      vec3 col;
      if(uv.y > 0.60){
        col = smpteBar(floor(uv.x * 7.0)) * 0.9;
        col *= 0.82 + 0.18 * smoothstep(0.0, 0.03, abs(fract(uv.x * 7.0) - 0.5));
      } else if(uv.y > 0.47){
        col = vec3(floor(uv.x * 10.0) / 9.0);
      } else if(uv.y > 0.40){
        col = vec3(uv.x);
      } else {
        col = vec3(0.045, 0.05, 0.06);
        vec2 g = fract(uv * vec2(aspect * 6.0, 6.0));
        col += vec3(0.06, 0.07, 0.08) * step(0.95, max(g.x, g.y));
        // beat-synced orbiting beacon
        float ang = -uBeat * 0.25 * TAU;
        vec2 c = vec2(0.5, 0.20);
        vec2 op = c + vec2(cos(ang) * 0.30 / aspect, sin(ang) * 0.13);
        float d = length(vec2((uv.x - op.x) * aspect, uv.y - op.y));
        col += uColor * (smoothstep(0.045, 0.0, d) * 1.6 + smoothstep(0.15, 0.0, d) * 0.25);
        // bouncing block
        float bx = abs(fract(t * 0.11) * 2.0 - 1.0);
        vec2 bp = vec2(mix(0.05, 0.95, bx), 0.20);
        float blk = step(max(abs(uv.x - bp.x) * aspect, abs(uv.y - bp.y) * 3.0), 0.055);
        col = mix(col, vec3(0.92), blk);
      }
      // full-height sweep bar (reads motion for delays/trails)
      float sx = fract(t * 0.18);
      col += vec3(1.0, 0.97, 0.9) * smoothstep(0.012, 0.0, abs(uv.x - sx)) * 0.85;
      // beat flash marker, top-left
      float mk = step(max(abs(uv.x - 0.035) * aspect, abs(uv.y - 0.945)), 0.045);
      col = mix(col, uColor, mk * beatPulse(10.0) * 0.9);
      return clamp(col, 0.0, 1.0);
    }

    vec3 sampleSource(vec2 uv){
      uv = clamp(uv, 0.0, 1.0);
      if(uHasVideo > 0.5) return sampleVideo(uv);
      return testPattern(uv);
    }

    vec3 finishPx(vec3 col, vec2 uv){
      float vign = 1.0 - dot(uv - 0.5, uv - 0.5) * 0.7;
      float scan = 0.97 + 0.03 * sin(uv.y * uResolution.y * PI);
      return col * vign * scan;
    }
  `;

  if (type === 'shaper') {
    return `${common}
    /* Waveshaper as a video effect: a transfer curve applied to each color channel.
       ALGO 1 sine fold (solarize), 2 triangle fold, 3 hard clip (contrast), 4 saw wrap. */
    float shapeCurve(float x, float algo, float offset, float freq, float clip, float drive){
      float v = (x - 0.5) * drive + (offset - 0.5) * 1.5;
      float f = 1.0 + freq * 5.0;
      float y;
      if(algo < 1.5)      y = sin(v * f);
      else if(algo < 2.5) y = abs(fract(v * f * 0.35 + 0.25) * 4.0 - 2.0) - 1.0;
      else if(algo < 3.5) y = clamp(v * f, -1.0, 1.0);
      else                y = fract(v * f * 0.35 + 0.5) * 2.0 - 1.0;
      float c = mix(1.0, 0.18, clip);
      return clamp(y, -c, c) / c * 0.5 + 0.5;
    }
    void main(){
      vec2 uv = vUv;
      float algo   = floor(uP0.x + 0.5);
      float offset = uP0.y;
      float freq   = uP0.z;
      float clip   = uP0.w;
      float amount = uP1.x;
      float mix_   = uP1.y;
      float pulse  = beatPulse(6.0);
      float drive  = 0.6 + amount * 3.2 + uBassAmp * 1.4;

      vec3 dry = sampleSource(uv);
      vec3 wet = vec3(
        shapeCurve(dry.r, algo, offset, freq, clip, drive),
        shapeCurve(dry.g, algo, offset, freq, clip, drive),
        shapeCurve(dry.b, algo, offset, freq, clip, drive)
      );
      wet *= 1.0 + pulse * 0.08;

      float wetAmt = uMode < 0.5 ? 1.0 : mix_;
      if(uBypass > 0.5 && uMode > 0.5) wetAmt = 0.0;
      vec3 col = mix(dry, wet, wetAmt);

      if(uMode < 0.5){
        // live transfer-curve scope inset (in = x, out = y)
        vec2 s = (uv - vec2(0.035, 0.06)) / vec2(0.30, 0.42);
        if(s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0){
          col *= 0.30;
          float box = max(abs(s.x - 0.5), abs(s.y - 0.5));
          col += uColor * (step(box, 0.5) - step(box, 0.47)) * 0.35;
          col += vec3(0.5) * smoothstep(0.02, 0.0, abs(s.y - s.x)) * 0.35;
          float cy = shapeCurve(s.x, algo, offset, freq, clip, drive);
          col += uColor * smoothstep(0.05, 0.0, abs(s.y - cy)) * 1.3;
        }
      }
      gl_FragColor = vec4(finishPx(col, uv), 1.0);
    }`;
  }

  if (type === 'downsampler') {
    return `${common}
    /* Sample-rate + bit-depth reduction as video: RATE = spatial resolution (pixelate),
       BITS = color depth (posterize), JITTER = analog line glitch.
       PIX = dithered pixelate, BIT = harsh posterize, GLT = glitch (RGB split + block corruption). */
    void main(){
      vec2 uv = vUv;
      float t = uTime;
      float jitter    = uP0.x;
      float crushType = floor(uP0.y + 0.5);
      float rate      = uP0.z;
      float bits      = uP0.w;
      float mix_      = uP1.x;
      float pulse = beatPulse(8.0);
      float bass  = uFFT0.x;
      float aspect = uResolution.x / uResolution.y;

      // pixelate: RATE up = coarser sampling, bass momentarily crunches harder
      float pxCount = mix(240.0, 10.0, clamp(rate + bass * 0.15 + pulse * rate * 0.1, 0.0, 1.0));
      vec2 grid = vec2(pxCount, max(4.0, pxCount / aspect));
      vec2 pUv = (floor(uv * grid) + 0.5) / grid;

      // analog jitter: random scanline bands displace horizontally
      float row = floor(uv.y * 64.0);
      float band = step(1.0 - jitter * 0.35 - pulse * 0.12, hash(vec2(row, floor(t * 12.0))));
      float disp = (hash(vec2(row + 7.0, floor(t * 12.0))) - 0.5) * band * jitter * (crushType > 1.5 ? 0.35 : 0.10);
      vec2 st = pUv + vec2(disp, 0.0);

      vec3 wet;
      if(crushType > 1.5){
        float split = jitter * 0.02 + pulse * 0.012;
        wet.r = sampleSource(st + vec2(split, 0.0)).r;
        wet.g = sampleSource(st).g;
        wet.b = sampleSource(st - vec2(split, 0.0)).b;
        // block corruption on random macro-cells
        vec2 bc = floor(uv * vec2(8.0, 6.0));
        float bh = hash(bc + floor(t * 6.0));
        if(bh > 1.0 - jitter * 0.3){
          wet = sampleSource(fract(st + vec2(bh * 0.3, -bh * 0.2))).brg;
        }
      } else {
        wet = sampleSource(st);
      }

      // posterize: BITS up = more levels (cleaner); beat drops levels for a crush hit
      float levels = crushType < 0.5 ? mix(6.0, 32.0, bits) : mix(2.0, 14.0, bits);
      levels = max(2.0, levels - pulse * 5.0 * (1.0 - bits));
      float dith = crushType < 0.5 ? (hash(floor(uv * grid)) - 0.5) / levels : 0.0;
      wet = clamp(floor((wet + dith) * levels) / (levels - 1.0), 0.0, 1.0);

      wet *= 1.0 + pulse * 0.1;
      float wetAmt = uMode < 0.5 ? 1.0 : mix_;
      if(uBypass > 0.5 && uMode > 0.5) wetAmt = 0.0;
      vec3 dry = sampleSource(uv);
      gl_FragColor = vec4(finishPx(mix(dry, wet, wetAmt), uv), 1.0);
    }`;
  }

  if (type === 'tapdelay') {
    return `${common}
    /* Real video echo: the previous OUTPUT frame is fed back in (uPrevTex ping-pong),
       so trails/feedback behave like an actual video delay line.
       PAN = directional smear, STUTTER = zoom feedback tunnel, FILTER = luma-keyed tinted trails. */
    void main(){
      vec2 uv = vUv;
      float typeIdx  = floor(uP0.x + 0.5);
      float delayT   = uP1.x;
      float feedback = uP1.y;
      float mix_     = uP1.z;
      float filtPos  = uP1.w;
      float pulse = beatPulse(6.0);

      // where the echo image drifts each frame
      float amt = mix(0.004, 0.045, delayT);
      vec2 pUv;
      if(typeIdx < 0.5){
        float dir = sin(uBeat * PI * 0.5 + uv.y * 2.0);
        pUv = uv + vec2(dir * amt, 0.0);
      } else if(typeIdx < 1.5){
        pUv = (uv - 0.5) * (1.0 - amt * 1.6) + 0.5;
        pUv.x += sin(uBeat * PI * 0.5) * amt * 0.3;
      } else {
        pUv = uv + vec2(0.0, (filtPos - 0.5) * amt * 2.0);
      }
      vec3 prev = texture2D(uPrevTex, clamp(pUv, 0.0, 1.0)).rgb;

      float fb = clamp(feedback * 0.93 + pulse * 0.03, 0.0, 0.97);
      vec3 cur = sampleSource(uv);
      vec3 wet;
      if(typeIdx > 1.5){
        float k = smoothstep(filtPos * 0.9, filtPos * 0.9 + 0.2, luma(prev));
        wet = max(cur, prev * fb * mix(vec3(1.0), uColor * 1.5, 0.4) * (0.35 + k * 0.65));
      } else {
        wet = max(cur, prev * fb);
      }
      wet *= 1.0 + pulse * 0.08;

      float wetAmt = uMode < 0.5 ? 1.0 : mix_;
      if(uBypass > 0.5 && uMode > 0.5) wetAmt = 0.0;
      gl_FragColor = vec4(finishPx(mix(cur, wet, wetAmt), uv), 1.0);
    }`;
  }

  return `${common}
  /* Granular video: the frame is cut into grains that re-sample the source at shuffled
     offsets. SPD = re-trigger rate (SYNC quantizes to beat DIVisions), PAT = grain count,
     DFT = shuffle distance, MOD = fraction of grains active, ENGINE = grain geometry.
     FREQ/Q = hue-isolation filter (band-pass for color). */
  void main(){
    vec2 uv = vUv;
    float sync    = uP0.x;
    float notes   = uP0.y;
    float div     = uP0.z;
    float engine  = floor(uP0.w + 0.5);
    float speed   = uP1.x;
    float pattern = uP1.y;
    float drift   = uP1.z;
    float freq    = uP1.w;
    float q       = uP2.x;
    float mix_    = uP2.y;
    float pulse = beatPulse(5.0);
    float aspect = uResolution.x / uResolution.y;

    // grain clock: free-running, or quantized to beat divisions when SYNC is on
    float ts = uTime * (0.5 + speed * 6.0);
    if(sync > 0.5){
      float divs = 1.0 + floor(div * 7.0);
      ts = (floor(uBeat) + floor(uBeatPhase * divs) / divs) * (1.0 + speed * 4.0);
    }
    float seed = floor(ts);

    float cells = mix(4.0, 16.0, pattern);
    vec2 gv = vec2(cells, max(2.0, floor(cells / aspect)));
    vec2 cellId;
    if(engine < 1.5)      cellId = floor(uv * gv);                        // 0/1: blocks
    else if(engine < 2.5) cellId = vec2(0.0, floor(uv.y * gv.y * 1.5));   // 2: h-slices
    else                  cellId = vec2(floor(uv.x * gv.x * 1.5), 0.0);   // 3: v-slices

    float act = step(1.0 - notes * 0.85, hash(cellId + vec2(seed * 0.13, seed * 0.71)));
    vec2 offs = (vec2(
      hash(cellId + vec2(seed * 0.31 + 1.7, 2.3)),
      hash(cellId + vec2(4.1, seed * 0.17 + 8.9))
    ) - 0.5) * drift * (0.55 + pulse * 0.2);
    vec3 wet = sampleSource(uv + offs * act);
    if(engine > 0.5 && engine < 1.5){
      // soft grains: round falloff inside each cell
      vec2 lc = fract(uv * gv) - 0.5;
      wet = mix(sampleSource(uv), wet, smoothstep(0.5, 0.15, length(lc)));
    }

    // hue isolation: keep hues near FREQ, desaturate the rest; Q sets band width/strength
    vec3 hsv = rgb2hsv(wet);
    float hd = abs(hsv.x - freq);
    hd = min(hd, 1.0 - hd);
    float bw = mix(0.5, 0.05, q);
    float keep = smoothstep(bw, bw * 0.4, hd);
    vec3 mono = vec3(luma(wet)) * 0.55;
    wet = mix(wet, mix(mono, wet, keep), q);

    wet *= 1.0 + pulse * 0.1;
    float wetAmt = uMode < 0.5 ? 1.0 : mix_;
    if(uBypass > 0.5 && uMode > 0.5) wetAmt = 0.0;
    vec3 dry = sampleSource(uv);
    gl_FragColor = vec4(finishPx(mix(dry, wet, wetAmt), uv), 1.0);
  }`;
}
