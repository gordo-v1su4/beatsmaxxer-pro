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
  isOnAir?: boolean;
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

export function ScreenOverlay() {
  return (
    <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:5 }}>
      <div style={{ position:'absolute', inset:0, backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 1px,rgba(0,0,0,0.15) 1px,rgba(0,0,0,0.15) 2px)', zIndex:2 }}/>
      <div style={{ position:'absolute', left:0, right:0, top:0, height:'30%', background:'linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0))', zIndex:2 }}/>
      <div style={{ position:'absolute', inset:0, boxShadow:'inset 0 0 24px rgba(0,0,0,0.85),inset 2px 2px 5px rgba(0,0,0,0.5),inset -2px -2px 5px rgba(0,0,0,0.4)', zIndex:3 }}/>
    </div>
  );
}

export function ScreenBadge({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ position:'absolute', top:4, left:5, zIndex:10, background:'rgba(0,0,0,0.75)', border:`1px solid ${color}44`, borderRadius:2, padding:'1px 5px' }}>
      <span style={{ fontFamily:'Share Tech Mono,monospace', fontSize:7, color, letterSpacing:'0.08em', opacity:0.85 }}>{text}</span>
    </div>
  );
}

export function VUMeter({ value, color }: { value: number; color: string }) {
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

export function ThreeVisualizer({ type, color, params, mode, videoUrl, midiLayer, bypassed }: {
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
  const paramsRef = useRef(params);
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
    srcTime: 0,
    bassEma: 0.05,
  });
  const { state: audioState } = useAudio();

  useEffect(() => {
    midiLayerRef.current = midiLayer ?? null;
  }, [midiLayer]);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    playingRef.current = audioState.playing;
  }, [audioState.playing]);

  const getUniforms = useCallback(() => {
    const p = (k: string, def = 50) => ((params[k] ?? def) / 100);
    if (type === 'transition') return {
      uP0: new THREE.Vector4(params.type ?? 0, p('interval', 50), p('duration', 40), p('amount', 60)),
      uP1: new THREE.Vector4(p('mix', 100), p('in_', 80), p('out', 75), 0),
      uP2: new THREE.Vector4(0, 0, 0, 0),
    };
    if (type === 'speedramp') return {
      uP0: new THREE.Vector4(p('len', 50), p('depth', 60), p('mix', 100), p('in_', 80)),
      uP1: new THREE.Vector4(p('out', 70), 0, 0, 0),
      uP2: new THREE.Vector4(0, 0, 0, 0),
    };
    if (type === 'tapdelay') return {
      uP0: new THREE.Vector4(params.type ?? 0, p('velCrv', 55), p('end', 70), p('start', 25)),
      uP1: new THREE.Vector4(p('time', 60), p('feedback', 50), p('mix', 55), p('filterSlider', 60)),
      uP2: new THREE.Vector4(p('scratchDepth', 45), params.scratchMode ?? 0, 0, 0),
    };
    return {
      uP0: new THREE.Vector4(params.mode ?? 0, p('size', 50), p('repeats', 50), p('chance', 60)),
      uP1: new THREE.Vector4(p('rate', 43), p('mix', 60), p('in_', 80), p('out', 60)),
      uP2: new THREE.Vector4(0, 0, 0, 0),
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
        uSrcTime:    { value: 0 },
        uAux1:       { value: 0 },
        uAux2: { value: 0 },
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
      const dt = (now - last) * 0.001;
      timeRef.current += dt;
      last = now;

      const m = materialRef.current;
      if (m) {
        m.uniforms.uTime.value = timeRef.current;
        m.uniforms.uSrcTime.value = timeRef.current;

        const uBeat = m.uniforms.uBeat.value;
        const st = loopRef.current;

        // FFT onset strength: how far current bass energy sits above its running
        // average. Weights beat-quantized triggers toward actual musical hits.
        const bassNow = m.uniforms.uBassAmp.value;
        st.bassEma = st.bassEma * 0.97 + bassNow * 0.03;
        const onsetStr = Math.max(0, Math.min(1.5, bassNow / Math.max(0.02, st.bassEma) - 1.0));

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
            } else if (Math.floor(uBeat) > Math.floor(st.lastBeat) && Math.random() < freqP * (0.35 + onsetStr)) {
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
        else if (type === 'timesampler') {
          // Time-remap sampler: chops source time into beat-synced chunks.
          // Drives video.currentTime for loaded clips and uSrcTime for the test pattern.
          const mode = Math.round(m.uniforms.uP0.value.x);
          const sizeP = m.uniforms.uP0.value.y;
          const repeatsP = m.uniforms.uP0.value.z;
          const chance = m.uniforms.uP0.value.w;
          const rate = 0.25 + m.uniforms.uP1.value.x * 1.75;
          const bypass = m.uniforms.uBypass.value > 0.5;
          const chunkBeats = sizeP < 0.2 ? 0.25 : sizeP < 0.4 ? 0.5 : sizeP < 0.6 ? 1 : sizeP < 0.8 ? 2 : 4;
          const bpm = m.uniforms.uBPM.value || 128;
          const chunkSec = chunkBeats * (60 / bpm);

          const video = m.uniforms.uHasVideo.value > 0.5 ? videoRef.current : null;
          const dur = video && Number.isFinite(video.duration) && video.duration > 0.05 ? video.duration : 1e6;
          if (video && Math.abs(video.playbackRate - rate) > 0.01) video.playbackRate = rate;

          const tNow = audioEngine.getState().time;
          const tPrev = st.lastTransportSec;
          const beatReset = uBeat < st.lastBeat - 0.5;
          const timeBack = tPrev >= 0 && tNow < tPrev - 0.25;
          if (beatReset || timeBack || bypass) {
            st.isStuttering = false;
            st.remRepeats = 0;
          }

          const midi = midiLayerRef.current;
          const useMidi = !!(midi?.notes?.length);
          let midiHit = false;
          if (!beatReset && !timeBack && !bypass && useMidi && playingRef.current) {
            const lastT = midi!.notes[midi!.notes.length - 1]!.time;
            const loopDur = Math.max(midi!.duration || 0, lastT + 0.05, 0.25);
            const jump = tPrev >= 0 && Math.abs(tNow - tPrev) > Math.min(2, loopDur * 0.5);
            if (!jump && tPrev >= 0) {
              midiHit = midiNoteCrossed(midi!.notes, tPrev, tNow, loopDur);
            }
          }
          st.lastTransportSec = tNow;

          // the remapped source clock: follows the clip when loaded, free-runs otherwise
          if (video) st.srcTime = video.currentTime;
          else st.srcTime += dt * rate;

          const seek = (tSec: number) => {
            st.srcTime = tSec;
            if (video) video.currentTime = Math.max(0, Math.min(dur - 0.02, ((tSec % dur) + dur) % dur));
          };
          const startChunk = () => {
            st.isStuttering = true;
            st.stutterAnchor = st.srcTime;
            st.stutterStartBeat = uBeat;
            st.remRepeats = Math.max(1, Math.round(repeatsP * 8));
            st.scratchPongAtBack = false;
            st.beatsPassed = 0;
          };

          if (!st.isStuttering) {
            if (!bypass) {
              if (useMidi) {
                if (midiHit) startChunk();
              } else if (Math.floor(uBeat) > Math.floor(st.lastBeat) && Math.random() < chance * (0.35 + onsetStr)) {
                startChunk();
              }
            }
          } else if (uBeat - st.stutterStartBeat >= chunkBeats) {
            st.remRepeats--;
            if (st.remRepeats > 0) {
              st.beatsPassed++;
              if (mode === 1) {
                // REV: each repeat steps a chunk further back
                seek(st.stutterAnchor - st.beatsPassed * chunkSec);
              } else if (mode === 2) {
                // PONG: alternate chunk start / chunk end
                st.scratchPongAtBack = !st.scratchPongAtBack;
                seek(st.scratchPongAtBack ? st.stutterAnchor + chunkSec : st.stutterAnchor);
              } else if (mode === 3) {
                // RAND: jump to a random nearby position
                seek(st.stutterAnchor + (Math.random() * 2 - 1) * chunkSec * 4.0);
              } else {
                // LOOP: classic beat repeat
                seek(st.stutterAnchor);
              }
              st.stutterStartBeat = uBeat;
            } else {
              st.isStuttering = false;
            }
          }
          st.lastBeat = uBeat;

          m.uniforms.uSrcTime.value = st.srcTime;
          m.uniforms.uAux1.value = st.isStuttering ? 1.0 : 0.0;
          m.uniforms.uAux2.value = st.isStuttering
            ? Math.min(1, Math.max(0, (uBeat - st.stutterStartBeat) / chunkBeats))
            : 0.0;
        }
        else if (type === 'transition') {
          // Transition clock: fires at the end of every N-beat cycle (or on MIDI
          // notes), producing a 0..1 progress the shader animates the wipe/whip with.
          const intervalP = m.uniforms.uP0.value.y;
          const durP = m.uniforms.uP0.value.z;
          const intervalBeats = intervalP < 0.25 ? 1 : intervalP < 0.5 ? 2 : intervalP < 0.75 ? 4 : 8;
          const durBeats = 0.15 + durP * 0.85;
          const bypass = m.uniforms.uBypass.value > 0.5;

          const tNow = audioEngine.getState().time;
          const tPrev = st.lastTransportSec;
          const midi = midiLayerRef.current;
          const useMidi = !!(midi?.notes?.length);
          let midiHit = false;
          if (useMidi && playingRef.current && tPrev >= 0 && !bypass) {
            const lastT = midi!.notes[midi!.notes.length - 1]!.time;
            const loopDur = Math.max(midi!.duration || 0, lastT + 0.05, 0.25);
            const jump = Math.abs(tNow - tPrev) > Math.min(2, loopDur * 0.5);
            if (!jump) midiHit = midiNoteCrossed(midi!.notes, tPrev, tNow, loopDur);
          }
          st.lastTransportSec = tNow;

          let p = 0;
          if (!bypass) {
            if (useMidi) {
              if (midiHit) {
                st.isStuttering = true;
                st.stutterStartBeat = uBeat;
              }
              if (st.isStuttering) {
                const since = uBeat - st.stutterStartBeat;
                if (since >= 0 && since < durBeats) p = since / durBeats;
                else st.isStuttering = false;
              }
            } else {
              const beatInCycle = ((uBeat % intervalBeats) + intervalBeats) % intervalBeats;
              const start = intervalBeats - durBeats;
              if (beatInCycle >= start) p = (beatInCycle - start) / durBeats;
            }
          }
          st.lastBeat = uBeat;
          m.uniforms.uAux1.value = p > 0 ? 1.0 : 0.0;
          m.uniforms.uAux2.value = Math.min(1, Math.max(0, p));
        }
        else if (type === 'speedramp') {
          // Curve-driven speed ramp: the 16-point curve (curve0..curve15) maps the
          // beat-cycle phase to a playback rate. Real playbackRate on clips; the
          // test card free-runs on the same remapped clock. A frame interpolator
          // (e.g. RIFE) can later replace the raw rate change for smooth slow-mo.
          const prm = paramsRef.current;
          const lenP = (prm.len ?? 50) / 100;
          const depth = (prm.depth ?? 60) / 100;
          const cycleBeats = lenP < 0.25 ? 1 : lenP < 0.5 ? 2 : lenP < 0.75 ? 4 : 8;
          const bypass = m.uniforms.uBypass.value > 0.5;
          const bpm = m.uniforms.uBPM.value || 128;
          const beatsNow = playingRef.current ? uBeat : timeRef.current * (bpm / 60);
          const phase = (((beatsNow % cycleBeats) + cycleBeats) % cycleBeats) / cycleBeats;

          // sample the curve with linear interpolation; value 0.5 = 1x, ±2 octaves at full depth
          const x = phase * 16;
          const i0 = Math.floor(x) % 16;
          const f = x - Math.floor(x);
          const c0 = (prm[`curve${i0}`] ?? 50) / 100;
          const c1 = (prm[`curve${(i0 + 1) % 16}`] ?? 50) / 100;
          const cv = c0 + (c1 - c0) * f;
          let rate = Math.pow(2, (cv - 0.5) * 4 * depth);
          if (bypass) rate = 1;

          const video = m.uniforms.uHasVideo.value > 0.5 ? videoRef.current : null;
          if (video) {
            const clamped = Math.max(0.0625, Math.min(4, rate));
            if (Math.abs(video.playbackRate - clamped) > 0.005) video.playbackRate = clamped;
            st.srcTime = video.currentTime;
          } else {
            st.srcTime += dt * rate;
          }
          st.lastBeat = uBeat;
          m.uniforms.uSrcTime.value = st.srcTime;
          m.uniforms.uAux1.value = rate;
          m.uniforms.uAux2.value = phase;
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
      <div style={{ position:'relative', width:'100%', aspectRatio:'16/9', minHeight:0, height:'auto', background:'#000', flexShrink:0 }}>
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

const TRANSITION_PACK = [
  { l: 'WHP L', v: 0 }, { l: 'WHP R', v: 1 }, { l: 'PSH U', v: 2 }, { l: 'PSH D', v: 3 },
  { l: 'WIPE', v: 4 }, { l: 'ROLL', v: 5 }, { l: 'ZOOM', v: 6 }, { l: 'GLTC', v: 7 },
];

function TransitionControls({ params, onUpdate, color }: { params: Record<string,number>; onUpdate:(p:string,v:number)=>void; color:string }) {
  const labelStyle = { fontSize:9, fontWeight:700 as const, color:'#4a5565', fontFamily:'Rajdhani,sans-serif', letterSpacing:'0.1em' };
  const intervalP = params.interval ?? 50;
  const durBeats = 0.15 + ((params.duration ?? 40) / 100) * 0.85;
  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1 }}>
      <Section label="PACK" color={color}>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <div style={labelStyle}>TRANSITION LIBRARY</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:2 }}>
            {TRANSITION_PACK.map(o => (
              <RackBtn key={o.l} label={o.l} active={Math.round(params.type??0)===o.v} color={color} onClick={()=>onUpdate('type',o.v)} width={40}/>
            ))}
          </div>
        </div>
      </Section>
      <Section label="SYNC" color={color}>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <div style={labelStyle}>FIRE EVERY</div>
          <div style={{ display:'flex', gap:2 }}>
            {[
              { l: '1 BT', val: 12 },
              { l: '2 BT', val: 37 },
              { l: '1 BAR', val: 62 },
              { l: '2 BAR', val: 87 },
            ].map(v => {
              const isActive = Math.abs(intervalP - v.val) <= 12;
              return <RackBtn key={v.l} label={v.l} active={isActive} color={color} onClick={()=>onUpdate('interval',v.val)} width={34}/>;
            })}
          </div>
        </div>
      </Section>
      <Section label="SHPE" color={color} noBorder>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ flex:1 }}>
              <HSlider value={params.duration??40} onChange={v=>onUpdate('duration',v)} color={color} label="MOVE LENGTH"/>
            </div>
            <MiniDisplay value={`${durBeats.toFixed(2)}bt`} width={44}/>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-start' }}>
            <Knob label="BLUR" value={params.amount??60} onChange={v=>onUpdate('amount',v)} size="sm" color={color}/>
          </div>
        </div>
      </Section>
    </div>
  );
}

const RAMP_PRESETS: Record<string, number[]> = {
  FLAT:  Array.from({ length: 16 }, () => 50),
  'RMP+': Array.from({ length: 16 }, (_, i) => Math.round(18 + (i / 15) * 68)),
  'RMP-': Array.from({ length: 16 }, (_, i) => Math.round(86 - (i / 15) * 68)),
  PNCH:  [82, 82, 78, 68, 40, 22, 14, 12, 12, 16, 28, 45, 62, 74, 80, 82],
  SINE:  Array.from({ length: 16 }, (_, i) => Math.round(50 + 40 * Math.sin((i / 16) * Math.PI * 2))),
  STEP:  Array.from({ length: 16 }, (_, i) => (Math.floor(i / 4) % 2 === 0 ? 78 : 26)),
};

function CurveEditor({ params, onUpdate, color }: { params: Record<string,number>; onUpdate:(p:string,v:number)=>void; color:string }) {
  const { state } = useAudio();
  const boxRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<{ i: number; v: number } | null>(null);
  const W = 100, H = 100; // viewBox units
  const pts = Array.from({ length: 16 }, (_, i) => params[`curve${i}`] ?? 50);

  const lenP = (params.len ?? 50) / 100;
  const cycleBeats = lenP < 0.25 ? 1 : lenP < 0.5 ? 2 : lenP < 0.75 ? 4 : 8;
  const phase = (((state.beat % cycleBeats) + cycleBeats) % cycleBeats) / cycleBeats;

  const applyAt = useCallback((clientX: number, clientY: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const i = Math.max(0, Math.min(15, Math.floor(((clientX - rect.left) / rect.width) * 16)));
    const v = Math.max(0, Math.min(100, 100 - ((clientY - rect.top) / rect.height) * 100));
    const last = lastRef.current;
    // fill skipped columns so fast drags draw a continuous curve
    if (last && Math.abs(i - last.i) > 1) {
      const step = i > last.i ? 1 : -1;
      for (let k = last.i + step; k !== i; k += step) {
        const f = (k - last.i) / (i - last.i);
        onUpdate(`curve${k}`, last.v + (v - last.v) * f);
      }
    }
    onUpdate(`curve${i}`, v);
    lastRef.current = { i, v };
  }, [onUpdate]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    lastRef.current = null;
    applyAt(e.clientX, e.clientY);
    const move = (ev: MouseEvent) => applyAt(ev.clientX, ev.clientY);
    const up = () => {
      lastRef.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const poly = pts.map((v, i) => `${((i + 0.5) / 16) * W},${H - v}`).join(' ');
  return (
    <div ref={boxRef} onMouseDown={onMouseDown} style={{
      height: 64, background:'#0a0b0c', border:'1px solid #1a1c1e', borderRadius:1,
      cursor:'crosshair', boxShadow:'inset 0 2px 4px rgba(0,0,0,0.5)', position:'relative', overflow:'hidden',
    }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}>
        {[25, 50, 75].map(x => <line key={x} x1={x} y1={0} x2={x} y2={H} stroke="#161819" strokeWidth={0.6}/>)}
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#2a2e34" strokeWidth={0.8} strokeDasharray="2 2"/>
        <polygon points={`0,${H - pts[0]} ${poly} ${W},${H - pts[15]} ${W},${H} 0,${H}`} fill={`${color}18`}/>
        <polyline points={`0,${H - pts[0]} ${poly} ${W},${H - pts[15]}`} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round"/>
        {pts.map((v, i) => (
          <circle key={i} cx={((i + 0.5) / 16) * W} cy={H - v} r={1.6} fill={color}/>
        ))}
        <line x1={phase * W} y1={0} x2={phase * W} y2={H} stroke="#fff" strokeWidth={0.8} opacity={0.55}/>
      </svg>
      <span style={{ position:'absolute', top:2, right:4, fontFamily:'Share Tech Mono,monospace', fontSize:6.5, color:'#3a4050', pointerEvents:'none' }}>1× —</span>
    </div>
  );
}

function SpeedRampControls({ params, onUpdate, color }: { params: Record<string,number>; onUpdate:(p:string,v:number)=>void; color:string }) {
  const labelStyle = { fontSize:9, fontWeight:700 as const, color:'#4a5565', fontFamily:'Rajdhani,sans-serif', letterSpacing:'0.1em' };
  const lenP = params.len ?? 50;
  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1 }}>
      <Section label="CURV" color={color}>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <div style={labelStyle}>SPEED CURVE · DRAW OR PRESET</div>
          <CurveEditor params={params} onUpdate={onUpdate} color={color}/>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:2 }}>
            {Object.entries(RAMP_PRESETS).map(([name, curve]) => (
              <RackBtn key={name} label={name} color={color} width={30}
                onClick={() => curve.forEach((v, i) => onUpdate(`curve${i}`, v))}/>
            ))}
          </div>
        </div>
      </Section>
      <Section label="CYCL" color={color} noBorder>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <div style={labelStyle}>CYCLE LENGTH</div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            {[
              { l: '1 BT', val: 12 },
              { l: '2 BT', val: 37 },
              { l: '1 BAR', val: 62 },
              { l: '2 BAR', val: 87 },
            ].map(v => {
              const isActive = Math.abs(lenP - v.val) <= 12;
              return <RackBtn key={v.l} label={v.l} active={isActive} color={color} onClick={()=>onUpdate('len',v.val)} width={34}/>;
            })}
            <div style={{ flex:1 }}/>
            <Knob label="DEPTH" value={params.depth??60} onChange={v=>onUpdate('depth',v)} size="sm" color={color}/>
          </div>
        </div>
      </Section>
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

function TimeSamplerControls({ params, onUpdate, color }: { params: Record<string,number>; onUpdate:(p:string,v:number)=>void; color:string }) {
  const labelStyle = { fontSize:9, fontWeight:700 as const, color:'#4a5565', fontFamily:'Rajdhani,sans-serif', letterSpacing:'0.1em' };
  const rate = 0.25 + ((params.rate ?? 43) / 100) * 1.75;
  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1 }}>
      <Section label="MODE" color={color}>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <div style={labelStyle}>CHUNK MODE</div>
          <div style={{ display:'flex', gap:2 }}>
            {[
              { l: 'LOOP', v: 0 },
              { l: 'REV', v: 1 },
              { l: 'PONG', v: 2 },
              { l: 'RAND', v: 3 },
            ].map(o => (
              <RackBtn key={o.l} label={o.l} active={Math.round(params.mode??0)===o.v} color={color} onClick={()=>onUpdate('mode',o.v)} width={34}/>
            ))}
          </div>
        </div>
      </Section>
      <Section label="LEN" color={color}>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <div style={labelStyle}>CHUNK LENGTH</div>
          <div style={{ display:'flex', gap:2 }}>
            {[
              { l: '1/16', val: 10 },
              { l: '1/8', val: 30 },
              { l: '1/4', val: 50 },
              { l: '1/2', val: 70 },
              { l: 'BAR', val: 90 },
            ].map(v => {
              const isActive = Math.abs((params.size??50) - v.val) <= 10;
              return <RackBtn key={v.l} label={v.l} active={isActive} color={color} onClick={()=>onUpdate('size',v.val)} width={28}/>;
            })}
          </div>
        </div>
      </Section>
      <Section label="RPT" color={color}>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <div style={labelStyle}>REPEATS</div>
          <div style={{ display:'flex', gap:2 }}>
            {[1, 2, 4, 6, 8].map(n => {
              const currentRepeats = Math.round((params.repeats ?? 50) / 100 * 8) || 1;
              return <RackBtn key={n} label={`${n}×`} active={currentRepeats===n} color={color} onClick={()=>onUpdate('repeats', (n / 8) * 100)} width={28}/>;
            })}
          </div>
        </div>
      </Section>
      <Section label="SPD" color={color}>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <div style={labelStyle}>PLAYBACK RATE</div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ flex:1 }}>
              <HSlider value={params.rate??43} onChange={v=>onUpdate('rate',v)} color={color}/>
            </div>
            <MiniDisplay value={`${rate.toFixed(2)}×`} width={44}/>
          </div>
        </div>
      </Section>
      <Section label="TRIG" color={color} noBorder>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <div style={labelStyle}>CHANCE</div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ flex:1 }}>
              <HSlider value={params.chance??60} onChange={v=>onUpdate('chance',v)} color={color}/>
            </div>
            <MiniDisplay value={`${Math.round(params.chance??60)}%`} width={36}/>
          </div>
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

export function EffectModule({ config, params, onUpdateParam, bypassed, muted, onToggleBypass, onToggleMute, videoLayer, onSetVideoLayer, midiLayer, onSetMidiLayer, isOnAir }: EffectModuleProps) {
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
        {isOnAir && (
          <span style={{
            fontFamily:'Rajdhani,sans-serif', fontSize:7, fontWeight:700, letterSpacing:'0.1em',
            color:'#ef4444', background:'#ef444418', border:'1px solid #ef444455', borderRadius:2,
            padding:'0px 3px', boxShadow:'0 0 6px #ef444433', flexShrink:0,
          }}>ON AIR</span>
        )}
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
          {id==='transition' && <TransitionControls params={params} onUpdate={onUpdateParam} color={accentColor}/>}
          {id==='speedramp' && <SpeedRampControls params={params} onUpdate={onUpdateParam} color={accentColor}/>}
          {id==='tapdelay' && <TapDelayControls params={params} onUpdate={onUpdateParam} color={accentColor}/>}
          {id==='timesampler' && <TimeSamplerControls params={params} onUpdate={onUpdateParam} color={accentColor}/>}
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
    uniform float uSrcTime;
    uniform float uAux1;
    uniform float uAux2;
    varying vec2 vUv;

    #define PI  3.14159265359
    #define TAU 6.28318530718

    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float beatPulse(float sharpness){ return exp(-uBeatPhase * sharpness); }
    float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

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
       so every effect previews on real picture content. Runs on uSrcTime so the
       TIMESAMPLER's chunk remapping is visible without a clip. */
    vec3 testPattern(vec2 uv){
      float t = uSrcTime;
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

  if (type === 'transition') {
    return `${common}
    /* Transition pack: beat-quantized self-transitions animated by uAux2 (0..1 progress
       from the JS clock). TYPE: 0 whip L, 1 whip R, 2 push up, 3 push down,
       4 wipe, 5 camera roll, 6 zoom punch, 7 glitch cut. AMT = motion blur/intensity. */
    vec2 rot2(vec2 p, float a){
      float c = cos(a), s = sin(a);
      return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    }
    vec3 transSample(vec2 uv, float typeI, float e, float aspect){
      if(typeI < 0.5)      return sampleSource(fract(uv + vec2(-e, 0.0)));          // whip L
      else if(typeI < 1.5) return sampleSource(fract(uv + vec2(e, 0.0)));           // whip R
      else if(typeI < 2.5) return sampleSource(fract(uv + vec2(0.0, e)));           // push up
      else if(typeI < 3.5) return sampleSource(fract(uv + vec2(0.0, -e)));          // push down
      else if(typeI < 4.5){                                                          // wipe
        float edge = e;
        vec2 su = uv.x < edge ? vec2(uv.x - edge + 1.0, uv.y) : uv;
        return sampleSource(su);
      }
      else if(typeI < 5.5){                                                          // camera roll
        vec2 c = uv - 0.5;
        c.x *= aspect;
        c = rot2(c, e * TAU);
        c.x /= aspect;
        return sampleSource(fract(c + 0.5));
      }
      else if(typeI < 6.5){                                                          // zoom punch
        float z = 1.0 + sin(e * PI) * 2.2;
        return sampleSource((uv - 0.5) / z + 0.5);
      }
      // glitch cut: slice displacement burst
      float burst = sin(e * PI);
      float row = floor(uv.y * 24.0);
      float d = (hash(vec2(row, floor(e * 14.0))) - 0.5) * burst * 0.5;
      vec3 g = sampleSource(fract(uv + vec2(d, 0.0)));
      float split = burst * 0.02;
      g.r = sampleSource(fract(uv + vec2(d + split, 0.0))).r;
      g.b = sampleSource(fract(uv + vec2(d - split, 0.0))).b;
      return g;
    }
    void main(){
      vec2 uv = vUv;
      float typeI  = floor(uP0.x + 0.5);
      float amount = uP0.w;
      float mix_   = uP1.x;
      float aspect = uResolution.x / uResolution.y;
      float p = uAux2;
      // ease in-out so the move snaps like a whip, not a linear slide
      float e = p < 0.5 ? 2.0 * p * p : 1.0 - pow(-2.0 * p + 2.0, 2.0) / 2.0;

      vec3 dry = sampleSource(uv);
      vec3 wet;
      if(uAux1 < 0.5){
        wet = dry;
      } else {
        // motion-blurred transition: accumulate samples along the move
        float blurSpan = (0.02 + amount * 0.1) * sin(p * PI);
        wet = vec3(0.0);
        for(int i = 0; i < 6; i++){
          float o = (float(i) / 5.0 - 0.5) * blurSpan;
          wet += transSample(uv, typeI, clamp(e + o, 0.0, 1.0), aspect);
        }
        wet /= 6.0;
        // flash at the cut point
        wet *= 1.0 + sin(p * PI) * amount * 0.25;
      }

      float wetAmt = uMode < 0.5 ? 1.0 : mix_;
      if(uBypass > 0.5 && uMode > 0.5) wetAmt = 0.0;
      vec3 col = mix(dry, wet, wetAmt);

      if(uMode < 0.5){
        // cycle countdown strip: fills over the interval, accent burst during the move
        float ph = fract(uBeat / 4.0);
        if(uv.y < 0.04){
          col *= 0.25;
          col += uColor * (0.10 + step(uv.x, uAux2) * uAux1 * 0.9 + (1.0 - uAux1) * step(uv.x, ph) * 0.2);
        }
      }
      gl_FragColor = vec4(finishPx(col, uv), 1.0);
    }`;
  }

  if (type === 'speedramp') {
    return `${common}
    /* Speed ramp: the actual time remap happens upstream (playbackRate / uSrcTime,
       driven by the 16-point curve in JS). uAux1 = current rate, uAux2 = cycle phase.
       The shader adds speed-proportional motion streaking, chroma pull at extremes,
       and a rate meter. A frame interpolator (RIFE) will replace the streaking later. */
    void main(){
      vec2 uv = vUv;
      float mix_  = uP0.z;
      float rate  = max(uAux1, 0.001);
      float phase = uAux2;
      float pulse = beatPulse(6.0);

      // 0 at 1x, 1 at 4x / 0.25x (log-symmetric)
      float dev = clamp(abs(log2(rate)) / 2.0, 0.0, 1.0);

      // motion streaking scaled by how far off 1x we are (fast = horizontal, slow = ghost)
      vec3 wet = vec3(0.0);
      float span = dev * 0.035;
      for(int i = 0; i < 5; i++){
        float o = (float(i) / 4.0 - 0.5) * span;
        wet += sampleSource(uv + vec2(o, 0.0));
      }
      wet /= 5.0;

      // chroma pull at speed extremes
      float split = dev * 0.012;
      wet.r = sampleSource(uv + vec2(split, 0.0)).r;
      wet.b = sampleSource(uv - vec2(split, 0.0)).b;

      // slow motion glows slightly, fast speed crunches contrast
      wet *= 1.0 + (rate < 1.0 ? dev * 0.15 : -dev * 0.05) + pulse * 0.05;

      float wetAmt = uMode < 0.5 ? 1.0 : mix_;
      if(uBypass > 0.5 && uMode > 0.5) wetAmt = 0.0;
      vec3 dry = sampleSource(uv);
      vec3 col = mix(dry, wet, wetAmt);

      if(uMode < 0.5){
        // rate meter: center = 1x, right = fast, left = slow; playhead shows cycle phase
        if(uv.y < 0.05){
          col *= 0.25;
          float x = clamp(log2(rate) / 4.0 + 0.5, 0.0, 1.0);
          float lit = (x >= 0.5) ? step(0.5, uv.x) * step(uv.x, x) : step(x, uv.x) * step(uv.x, 0.5);
          col += uColor * (0.10 + lit * 0.9);
          col += vec3(0.9) * smoothstep(0.006, 0.0, abs(uv.x - 0.5)) * 0.5;
          col += uColor * smoothstep(0.006, 0.0, abs(uv.x - phase)) * 0.8;
        }
      }
      gl_FragColor = vec4(finishPx(col, uv), 1.0);
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
  /* Time-remap sampler: the JS transport chops source time into beat-synced chunks
     (LOOP / REV / PONG / RAND). uSrcTime drives the test pattern and video.currentTime
     is scrubbed for loaded clips, so the remap itself happens upstream — this shader
     adds stutter ghosting, a retrigger flash, tape wobble off-1x, and a chunk readout. */
  void main(){
    vec2 uv = vUv;
    float rate  = 0.25 + uP1.x * 1.75;
    float mix_  = uP1.y;
    float pulse = beatPulse(6.0);

    // tape-style line wobble when playback rate is away from 1x
    float wob = clamp(abs(rate - 1.0) - 0.05, 0.0, 1.0);
    vec2 st = uv;
    st.x += sin(uv.y * 60.0 + uTime * 9.0) * wob * 0.004;
    vec3 wet = sampleSource(st);

    // stutter ghosting from the feedback buffer while a chunk repeats
    vec3 prev = texture2D(uPrevTex, clamp(uv + vec2(0.006, 0.0), 0.0, 1.0)).rgb;
    wet = max(wet, prev * (uAux1 * 0.5));

    // retrigger flash at each chunk start
    float flash = uAux1 * exp(-uAux2 * 7.0);
    wet *= 1.0 + flash * 0.22 + pulse * 0.05;
    wet += uColor * flash * 0.04;

    float wetAmt = uMode < 0.5 ? 1.0 : mix_;
    if(uBypass > 0.5 && uMode > 0.5) wetAmt = 0.0;
    vec3 dry = sampleSource(uv);
    vec3 col = mix(dry, wet, wetAmt);

    if(uMode < 0.5 && uv.y < 0.045){
      // chunk progress strip: fills as the current chunk plays out
      col *= 0.25;
      col += uColor * (0.12 + step(uv.x, uAux2) * uAux1 * 0.9);
    }
    gl_FragColor = vec4(finishPx(col, uv), 1.0);
  }`;
}
