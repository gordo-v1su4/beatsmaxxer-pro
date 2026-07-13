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
  onModuleDrop?: (draggedId: ModuleType) => void;
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
      <div style={{ flex:1, padding:'4px 5px' }}>{children}</div>
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
    <div style={{
      position:'absolute', top:4, left:5, zIndex:10,
      background:'rgba(0,0,0,0.75)', border:`1px solid ${color}44`, borderRadius:2,
      height:13, paddingInline:4, display:'flex', alignItems:'center',
    }}>
      <span style={{ fontFamily:'Share Tech Mono,monospace', fontSize:7, lineHeight:1, color, letterSpacing:'0.08em', opacity:0.85 }}>{text}</span>
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

/** One video element + texture per module, shared by every screen showing that module
    (FX preview and PGM monitor), so all views stay frame-synced. */
const sharedVideos: Record<string, { url: string; video: HTMLVideoElement; texture: THREE.VideoTexture; refs: number }> = {};

function acquireSharedVideo(moduleId: string, url: string) {
  const existing = sharedVideos[moduleId];
  if (existing && existing.url === url) {
    existing.refs++;
    return existing;
  }
  if (existing) destroySharedVideo(moduleId);

  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.play().catch(() => {});

  const texture = new THREE.VideoTexture(video);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  const entry = { url, video, texture, refs: 1 };
  sharedVideos[moduleId] = entry;
  return entry;
}

function releaseSharedVideo(moduleId: string, url: string) {
  const entry = sharedVideos[moduleId];
  if (!entry || entry.url !== url) return;
  entry.refs--;
  if (entry.refs <= 0) destroySharedVideo(moduleId);
}

function destroySharedVideo(moduleId: string) {
  const entry = sharedVideos[moduleId];
  if (!entry) return;
  entry.texture.dispose();
  entry.video.pause();
  entry.video.src = '';
  entry.video.load();
  delete sharedVideos[moduleId];
}

/** Per-module shared clock: the FX-preview instance drives the time-remap engine and
    writes here; the PGM monitor instance follows, so test-pattern clocks match too. */
const moduleClocks: Record<string, { srcTime: number; aux1: number; aux2: number }> = {};

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
    lastTrigAt: -9,
    lastTrigCount: -1,
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
      uP1: new THREE.Vector4(p('mix', 100), p('in_', 80), p('out', 75), params.trig ?? 0),
      uP2: new THREE.Vector4(0, 0, 0, 0),
    };
    if (type === 'punch') return {
      uP0: new THREE.Vector4(p('dir', 50), p('amt', 60), p('snap', 55), p('mix', 100)),
      uP1: new THREE.Vector4(0, 0, 0, 0),
      uP2: new THREE.Vector4(0, 0, 0, 0),
    };
    if (type === 'shake') return {
      uP0: new THREE.Vector4(p('hand', 40), p('impact', 55), p('sway', 30), p('mix', 100)),
      uP1: new THREE.Vector4(0, 0, 0, 0),
      uP2: new THREE.Vector4(0, 0, 0, 0),
    };
    if (type === 'orbit') return {
      uP0: new THREE.Vector4(p('spd', 35), p('drift', 50), p('nudge', 40), p('mix', 100)),
      uP1: new THREE.Vector4(0, 0, 0, 0),
      uP2: new THREE.Vector4(0, 0, 0, 0),
    };
    if (type === 'focus') return {
      uP0: new THREE.Vector4(p('amt', 35), p('pulse', 55), p('soft', 45), p('mix', 100)),
      uP1: new THREE.Vector4(0, 0, 0, 0),
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
        uPlaying:    { value: 0.0 },
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

    // observe the actual container so canvases track ANY layout change (window
    // scale, collapse, reorder), keeping every preview scaling uniformly
    const onResize = () => {
      const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
      renderer.setSize(w, h);
      rtA.setSize(w, h);
      rtB.setSize(w, h);
      mat.uniforms.uResolution.value.set(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

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

        const isDriver = mode === 'effect';
        const clock = (moduleClocks[type] ??= { srcTime: 0, aux1: 0, aux2: 0 });

        if (!isDriver) {
          // follower (PGM monitor): mirror the driver module's clock so every
          // screen showing this module stays in sync
          m.uniforms.uSrcTime.value = clock.srcTime;
          m.uniforms.uAux1.value = clock.aux1;
          m.uniforms.uAux2.value = clock.aux2;
        }
        else if (type === 'tapdelay') {
          // Accent-matched stutter: fires when FFT bass energy spikes past the
          // SENS threshold; scratch variations jump the clip (or test-card clock).
          const timeP = m.uniforms.uP1.value.x;
          const sens = m.uniforms.uP0.value.z;
          const bypass = m.uniforms.uBypass.value > 0.5;

          let stutterLen = 1.0;
          if (timeP < 0.2) stutterLen = 0.125;
          else if (timeP < 0.4) stutterLen = 0.25;
          else if (timeP < 0.6) stutterLen = 0.3333;
          else if (timeP < 0.8) stutterLen = 0.5;
          else stutterLen = 1.0;

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

          const video = m.uniforms.uHasVideo.value > 0.5 ? videoRef.current : null;
          const dur = video && Number.isFinite(video.duration) && video.duration > 0.05 ? video.duration : 1e6;
          if (video) st.srcTime = video.currentTime;
          else st.srcTime += dt;

          const seek = (tSec: number) => {
            st.srcTime = Math.max(0, Math.min(dur - 0.02, tSec));
            if (video) video.currentTime = st.srcTime;
          };

          const scratchMode = Math.min(3, Math.max(0, Math.round(m.uniforms.uP2.value.y)));
          const pDepth = m.uniforms.uP2.value.x;
          const scratchSec = Math.max(1 / 60, Math.min(0.85, (1 + pDepth * 23) / 30));

          const startStutter = () => {
            const bpm = m.uniforms.uBPM.value || 128;
            const stutterSeconds = stutterLen * (60.0 / bpm);
            st.isStuttering = true;
            st.stutterStartBeat = uBeat;
            st.lastTrigAt = timeRef.current;
            const repeatsRaw = m.uniforms.uP0.value.y;
            // stronger accents earn more repeats
            st.remRepeats = Math.max(1, Math.min(8, Math.round(repeatsRaw * 8 * (0.6 + onsetStr * 0.6))));
            st.stutterAnchor = st.srcTime;

            if (scratchMode === 3) {
              const coin = Math.random() < 0.5 ? -1 : 1;
              st.stutterVideoTime = Math.max(0, Math.min(dur - 0.02, st.stutterAnchor + coin * scratchSec));
            } else if (scratchMode === 1 || scratchMode === 2) {
              st.stutterVideoTime = Math.max(0, st.stutterAnchor - scratchSec);
              st.scratchPongAtBack = true;
            } else {
              st.stutterVideoTime = Math.max(0, st.stutterAnchor - stutterSeconds);
            }
            seek(st.stutterVideoTime);
          };

          if (!st.isStuttering && !bypass) {
            if (useMidi) {
              if (midiHit) startStutter();
            } else {
              const thr = 0.08 + (1 - sens) * 1.1;
              if (playingRef.current && onsetStr > thr && timeRef.current - st.lastTrigAt > 0.25) {
                startStutter();
              }
            }
          } else if (st.isStuttering && uBeat - st.stutterStartBeat >= stutterLen) {
            st.remRepeats--;
            if (st.remRepeats > 0) {
              if (scratchMode === 2) {
                st.scratchPongAtBack = !st.scratchPongAtBack;
                seek(st.scratchPongAtBack ? st.stutterVideoTime : st.stutterAnchor);
              } else if (scratchMode === 3) {
                const spread = scratchSec * (2 + Math.random() * 5);
                st.stutterVideoTime = Math.max(0, Math.min(dur - 0.02, st.stutterAnchor + (Math.random() * 2 - 1) * spread));
                seek(st.stutterVideoTime);
              } else {
                seek(st.stutterVideoTime);
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
            ? Math.min(1, Math.max(0, (uBeat - st.stutterStartBeat) / stutterLen))
            : 0.0;
        }
        else if (type === 'timesampler') {
          // Time-remap sampler: chunks trigger on FFT accents past the SENS threshold.
          const mode_ = Math.round(m.uniforms.uP0.value.x);
          const sizeP = m.uniforms.uP0.value.y;
          const repeatsP = m.uniforms.uP0.value.z;
          const sens = m.uniforms.uP0.value.w;
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
            st.lastTrigAt = timeRef.current;
            // louder accents earn more repeats
            st.remRepeats = Math.max(1, Math.min(8, Math.round(repeatsP * 8 * (0.6 + onsetStr * 0.6))));
            st.scratchPongAtBack = false;
            st.beatsPassed = 0;
          };

          if (!st.isStuttering) {
            if (!bypass) {
              if (useMidi) {
                if (midiHit) startChunk();
              } else {
                const thr = 0.08 + (1 - sens) * 1.1;
                if (playingRef.current && onsetStr > thr && timeRef.current - st.lastTrigAt > 0.3) {
                  startChunk();
                }
              }
            }
          } else if (uBeat - st.stutterStartBeat >= chunkBeats) {
            st.remRepeats--;
            if (st.remRepeats > 0) {
              st.beatsPassed++;
              if (mode_ === 1) {
                seek(st.stutterAnchor - st.beatsPassed * chunkSec);
              } else if (mode_ === 2) {
                st.scratchPongAtBack = !st.scratchPongAtBack;
                seek(st.scratchPongAtBack ? st.stutterAnchor + chunkSec : st.stutterAnchor);
              } else if (mode_ === 3) {
                seek(st.stutterAnchor + (Math.random() * 2 - 1) * chunkSec * 4.0);
              } else {
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
          // Transition clock: fires at the end of every N-beat cycle, on MIDI notes,
          // or instantly when a pack button is tapped (trig counter). Free-runs on
          // wall time when the transport is stopped so it always previews.
          const intervalP = m.uniforms.uP0.value.y;
          const durP = m.uniforms.uP0.value.z;
          const trigCount = m.uniforms.uP1.value.w;
          const intervalBeats = intervalP < 0.25 ? 1 : intervalP < 0.5 ? 2 : intervalP < 0.75 ? 4 : 8;
          const durBeats = 0.15 + durP * 0.85;
          const bypass = m.uniforms.uBypass.value > 0.5;
          const bpm = m.uniforms.uBPM.value || 128;
          const beatsNow = playingRef.current ? uBeat : timeRef.current * (bpm / 60);

          // manual fire from the pack buttons
          if (st.lastTrigCount < 0) st.lastTrigCount = trigCount;
          if (trigCount !== st.lastTrigCount) {
            st.lastTrigCount = trigCount;
            st.isStuttering = true;
            st.stutterStartBeat = beatsNow;
          }

          const tNow = audioEngine.getState().time;
          const tPrev = st.lastTransportSec;
          const midi = midiLayerRef.current;
          const useMidi = !!(midi?.notes?.length);
          if (useMidi && playingRef.current && tPrev >= 0 && !bypass) {
            const lastT = midi!.notes[midi!.notes.length - 1]!.time;
            const loopDur = Math.max(midi!.duration || 0, lastT + 0.05, 0.25);
            const jump = Math.abs(tNow - tPrev) > Math.min(2, loopDur * 0.5);
            if (!jump && midiNoteCrossed(midi!.notes, tPrev, tNow, loopDur)) {
              st.isStuttering = true;
              st.stutterStartBeat = beatsNow;
            }
          }
          st.lastTransportSec = tNow;

          let p = 0;
          if (!bypass) {
            if (st.isStuttering) {
              const since = beatsNow - st.stutterStartBeat;
              if (since >= 0 && since < durBeats) p = since / durBeats;
              else st.isStuttering = false;
            }
            if (p === 0 && !st.isStuttering && !useMidi) {
              const beatInCycle = ((beatsNow % intervalBeats) + intervalBeats) % intervalBeats;
              const start = intervalBeats - durBeats;
              if (beatInCycle >= start) p = (beatInCycle - start) / durBeats;
            }
          }
          st.lastBeat = uBeat;
          m.uniforms.uAux1.value = p > 0 ? 1.0 : 0.0;
          m.uniforms.uAux2.value = Math.min(1, Math.max(0, p));
        }
        else if (type === 'speedramp') {
          // Bezier-curve speed ramp: a cubic bezier over the beat cycle maps phase to
          // playback rate. Real playbackRate on clips; the test card free-runs on the
          // same remapped clock. A frame interpolator (e.g. RIFE) can consume the same
          // rate signal later for smooth slow motion.
          const prm = paramsRef.current;
          const lenP = (prm.len ?? 50) / 100;
          const depth = (prm.depth ?? 60) / 100;
          const cycleBeats = lenP < 0.25 ? 1 : lenP < 0.5 ? 2 : lenP < 0.75 ? 4 : 8;
          const bypass = m.uniforms.uBypass.value > 0.5;
          const bpm = m.uniforms.uBPM.value || 128;
          const beatsNow = playingRef.current ? uBeat : timeRef.current * (bpm / 60);
          const phase = (((beatsNow % cycleBeats) + cycleBeats) % cycleBeats) / cycleBeats;

          // cubic bezier: x anchors at 0/1 with clamped handles keeps x(t) monotonic,
          // so bisection solves t for x = phase
          const y0 = (prm.bzY0 ?? 80) / 100, y1 = (prm.bzY1 ?? 5) / 100;
          const y2 = (prm.bzY2 ?? 5) / 100, y3 = (prm.bzY3 ?? 80) / 100;
          const x1 = Math.max(0, Math.min(1, (prm.bzX1 ?? 35) / 100));
          const x2 = Math.max(0, Math.min(1, (prm.bzX2 ?? 65) / 100));
          const bez = (a: number, b_: number, c: number, d: number, t: number) => {
            const mt = 1 - t;
            return mt * mt * mt * a + 3 * mt * mt * t * b_ + 3 * mt * t * t * c + t * t * t * d;
          };
          let lo = 0, hi = 1, t = phase;
          for (let i = 0; i < 18; i++) {
            t = (lo + hi) / 2;
            if (bez(0, x1, x2, 1, t) < phase) lo = t; else hi = t;
          }
          const cv = bez(y0, y1, y2, y3, t);
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

        if (isDriver) {
          clock.srcTime = m.uniforms.uSrcTime.value;
          clock.aux1 = m.uniforms.uAux1.value;
          clock.aux2 = m.uniforms.uAux2.value;
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
      ro.disconnect();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      // video texture is shared per-module; released by the videoUrl effect, not here
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
    // guard against any non-finite audio value poisoning every shader (whiteout)
    const bpm = Number.isFinite(audioState.bpm) ? audioState.bpm : 128;
    const beat = Number.isFinite(audioState.beat) ? audioState.beat : 0;
    const phase = Number.isFinite(audioState.beatPhase) ? audioState.beatPhase : 0;
    m.uniforms.uBPM.value = bpm;
    m.uniforms.uBeat.value = beat;
    m.uniforms.uBeatPhase.value = phase;
    m.uniforms.uPlaying.value = audioState.playing ? 1.0 : 0.0;
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

    videoTextureRef.current = null;
    videoRef.current = null;

    if (!videoUrl) {
      m.uniforms.uHasVideo.value = 0.0;
      if (imageTextureRef.current) {
        m.uniforms.uVideoTex.value = imageTextureRef.current;
      }
      return;
    }

    // shared per-module video: every screen of this module samples the same frames
    const entry = acquireSharedVideo(type, videoUrl);
    const video = entry.video;
    const applyRes = () => {
      if (m && video.videoWidth > 0 && video.videoHeight > 0) {
        m.uniforms.uVideoRes.value.set(video.videoWidth, video.videoHeight);
      }
    };
    applyRes();
    video.addEventListener('loadedmetadata', applyRes);
    videoRef.current = video;
    videoTextureRef.current = entry.texture;

    m.uniforms.uVideoTex.value = entry.texture;
    m.uniforms.uHasVideo.value = 1.0;

    return () => {
      video.removeEventListener('loadedmetadata', applyRes);
      releaseSharedVideo(type, videoUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl, type]);

  // absolute so the canvas's own size can never prop open the aspect-ratio box
  return <div ref={containerRef} style={{ position:'absolute', inset:0, overflow:'hidden' }}/>;
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

function DualScreen({ type, color, params, videoLayer, onSetVideoLayer, midiLayer, onSetMidiLayer, bypassed }: {
  type: ModuleType; color: string; params: Record<string,number>; videoLayer: VideoLayer | null; onSetVideoLayer: (file: File | null) => void; midiLayer: MidiLayer | null; onSetMidiLayer: (file: File | null) => void; bypassed: boolean;
}) {
  const { state } = useAudio();
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes('Files')) return;
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
      <div style={{ position:'relative', width:'min(100%, calc(300px * 16 / 9))', alignSelf:'center', aspectRatio:'16/9', background:'#000', flexShrink:0 }}>
        <ThreeVisualizer type={type} color={color} params={params} mode="effect" videoUrl={videoLayer?.url} midiLayer={midiLayer} bypassed={bypassed} />
        <ScreenOverlay/>
        <ScreenBadge text="FX PREVIEW · 100% WET" color={color}/>
        <div style={{ position:'absolute', bottom:4, left:5, zIndex:10, background:'rgba(0,0,0,0.7)', borderRadius:2, padding:'0px 4px' }}>
          <span style={{ fontFamily:'Share Tech Mono,monospace', fontSize:6.5, color:'#566070', letterSpacing:'0.08em' }}>
            {videoLayer ? 'SRC · CLIP' : 'SRC · TEST PATTERN'}
          </span>
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
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:2 }}>
          {TRANSITION_PACK.map(o => (
            <RackBtn key={o.l} label={o.l} active={Math.round(params.type??0)===o.v} color={color}
              onClick={()=>{ onUpdate('type',o.v); onUpdate('trig', ((params.trig ?? 0) + 1) % 100); }} width={40}/>
          ))}
        </div>
      </Section>
      <Section label="FIRE" color={color}>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
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
            <div style={{ flex:1 }}/>
            <RackBtn label="FIRE" color="#ef4444" width={36}
              onClick={()=>onUpdate('trig', ((params.trig ?? 0) + 1) % 100)}/>
          </div>
        </div>
      </Section>
      <Section label="SHPE" color={color} noBorder>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <div style={{ display:'flex', alignItems:'flex-end', gap:8 }}>
            <div style={{ flex:1 }}>
              <HSlider value={params.duration??40} onChange={v=>onUpdate('duration',v)} color={color} label="MOVE LENGTH"/>
            </div>
            <MiniDisplay value={`${durBeats.toFixed(2)}bt`} width={44}/>
          </div>
          <div style={{ flex:1 }}>
            <HSlider value={params.amount??60} onChange={v=>onUpdate('amount',v)} color={color} label="MOTION BLUR"/>
          </div>
        </div>
      </Section>
    </div>
  );
}

/** Bezier presets: endpoints (y0, y3) + control handles (x1,y1) (x2,y2), all 0-100. */
// Speed-ramp shapes as bezier control points; each renders a drawn curve on its button.
const RAMP_SHAPES: { key: string; pts: { y0:number;x1:number;y1:number;x2:number;y2:number;y3:number } }[] = [
  { key: 'FLAT',  pts: { y0:50, x1:33, y1:50, x2:66, y2:50, y3:50 } },
  { key: 'UP',    pts: { y0:16, x1:40, y1:28, x2:70, y2:74, y3:90 } },
  { key: 'DOWN',  pts: { y0:90, x1:30, y1:74, x2:60, y2:28, y3:16 } },
  { key: 'S',     pts: { y0:16, x1:78, y1:18, x2:22, y2:82, y3:90 } },
  { key: 'DIP',   pts: { y0:82, x1:35, y1:4,  x2:65, y2:4,  y3:82 } },
  { key: 'BUMP',  pts: { y0:20, x1:35, y1:98, x2:65, y2:98, y3:20 } },
];

/** A speed-shape button: draws its bezier curve so you pick by the shape, not numbers. */
function RampShapeBtn({ shape, active, color, onClick }: {
  shape: typeof RAMP_SHAPES[number]; active: boolean; color: string; onClick: () => void;
}) {
  const { pts, key } = shape;
  const W = 44, H = 30, P = 4;
  const X = (v: number) => P + (v / 100) * (W - P * 2);
  const Y = (v: number) => P + ((100 - v) / 100) * (H - P * 2);
  return (
    <button onClick={onClick} title={key} style={{
      width: '100%', height: 34, padding: 0, cursor: 'pointer',
      background: active ? `linear-gradient(180deg,${color}22,${color}0e)` : 'linear-gradient(180deg,#181a1c,#141618)',
      border: `1px solid ${active ? color + '77' : '#1e2226'}`,
      borderRadius: 2, position: 'relative',
      boxShadow: active ? `inset 0 1px 3px rgba(0,0,0,0.5), 0 0 6px ${color}22` : 'inset 0 1px 2px rgba(0,0,0,0.4)',
    }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display:'block' }}>
        <line x1={0} y1={Y(50)} x2={W} y2={Y(50)} stroke="#2a2e34" strokeWidth={0.6} strokeDasharray="2 2"/>
        <path d={`M ${X(0)} ${Y(pts.y0)} C ${X(pts.x1)} ${Y(pts.y1)}, ${X(pts.x2)} ${Y(pts.y2)}, ${X(100)} ${Y(pts.y3)}`}
          fill="none" stroke={active ? color : '#5a6270'} strokeWidth={1.6} strokeLinecap="round"/>
      </svg>
    </button>
  );
}

function SpeedRampControls({ params, onUpdate, color }: { params: Record<string,number>; onUpdate:(p:string,v:number)=>void; color:string }) {
  const labelStyle = { fontSize:9, fontWeight:700 as const, color:'#4a5565', fontFamily:'Rajdhani,sans-serif', letterSpacing:'0.1em' };
  const lenP = params.len ?? 50;
  const apply = (c: typeof RAMP_SHAPES[number]['pts']) => {
    onUpdate('bzY0', c.y0); onUpdate('bzX1', c.x1); onUpdate('bzY1', c.y1);
    onUpdate('bzX2', c.x2); onUpdate('bzY2', c.y2); onUpdate('bzY3', c.y3);
  };
  const activeKey = (() => {
    let best = ''; let bestD = 1e9;
    for (const sh of RAMP_SHAPES) {
      const d = Math.abs((params.bzY0 ?? 80) - sh.pts.y0) + Math.abs((params.bzY1 ?? 5) - sh.pts.y1)
              + Math.abs((params.bzY2 ?? 5) - sh.pts.y2) + Math.abs((params.bzY3 ?? 80) - sh.pts.y3);
      if (d < bestD) { bestD = d; best = sh.key; }
    }
    return bestD < 40 ? best : '';
  })();
  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1 }}>
      <Section label="SHAPE" color={color}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:3 }}>
          {RAMP_SHAPES.map(sh => (
            <RampShapeBtn key={sh.key} shape={sh} active={activeKey === sh.key} color={color} onClick={() => apply(sh.pts)} />
          ))}
        </div>
      </Section>
      <Section label="CYCLE" color={color} noBorder>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
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
            <Knob label="DEPTH" value={params.depth??60} onChange={v=>onUpdate('depth',v)} size="xs" color={color}/>
          </div>
        </div>
      </Section>
    </div>
  );
}

function InlineRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
      <span style={{
        width:32, flexShrink:0, fontSize:7, fontWeight:700, color:'#3a4050',
        fontFamily:'Rajdhani,sans-serif', letterSpacing:'0.08em',
      }}>{label}</span>
      <div style={{ display:'flex', gap:2, flex:1, alignItems:'center', minWidth:0 }}>{children}</div>
    </div>
  );
}

function TapDelayControls({ params, onUpdate, color }: { params: Record<string,number>; onUpdate:(p:string,v:number)=>void; color:string }) {
  const stutterMode = Math.round(params.type ?? 0) === 1;
  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1 }}>
      <Section label="TYPE" color={color}>
        <div style={{ display:'flex', gap:2 }}>
          {['Pan','Stutter','Filter'].map((t,i) => (
            <RackBtn key={t} label={t} active={Math.round(params.type??0)===i} color={color} onClick={()=>onUpdate('type',i)} width={i===1?44:34}/>
          ))}
        </div>
      </Section>

      {stutterMode ? (
        <>
          <Section label="STUT" color={color}>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <InlineRow label="LEN">
                {[
                  { l: '1/32', val: 10 },
                  { l: '1/16', val: 30 },
                  { l: '1/8T', val: 50 },
                  { l: '1/8', val: 70 },
                  { l: '1/4', val: 90 },
                ].map(v => {
                  const isActive = Math.abs((params.time??60) - v.val) <= 10;
                  return <RackBtn key={v.l} label={v.l} active={isActive} color={color} onClick={()=>onUpdate('time',v.val)} width={28}/>;
                })}
              </InlineRow>
              <InlineRow label="RPT">
                {[1, 2, 4, 6, 8].map(n => {
                  const currentRepeats = Math.round((params.velCrv ?? 25) / 100 * 8) || 1;
                  return <RackBtn key={n} label={`${n}×`} active={currentRepeats===n} color={color} onClick={()=>onUpdate('velCrv', (n / 8) * 100)} width={28}/>;
                })}
              </InlineRow>
            </div>
          </Section>
          <Section label="SCR" color={color}>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <InlineRow label="MODE">
                {[
                  { l: 'BEAT', v: 0 },
                  { l: 'LOOP', v: 1 },
                  { l: 'PONG', v: 2 },
                  { l: 'RND', v: 3 },
                ].map(o => (
                  <RackBtn key={o.l} label={o.l} active={Math.round(params.scratchMode ?? 0) === o.v} color={color} onClick={() => onUpdate('scratchMode', o.v)} width={30}/>
                ))}
              </InlineRow>
              <InlineRow label="DEPTH">
                <div style={{ flex:1 }}>
                  <HSlider value={params.scratchDepth ?? 45} onChange={(v) => onUpdate('scratchDepth', v)} color={color}/>
                </div>
              </InlineRow>
            </div>
          </Section>
          <Section label="TRIG" color={color} noBorder>
            <InlineRow label="SENS">
              <div style={{ flex:1 }}>
                <HSlider value={params.end??60} onChange={v=>onUpdate('end',v)} color={color}/>
              </div>
              <MiniDisplay value={`${Math.round(params.end??60)}%`} width={34}/>
            </InlineRow>
          </Section>
        </>
      ) : (
        <>
          <Section label="TIME" color={color}>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <InlineRow label="TIME">
                <div style={{ flex:1 }}><HSlider value={params.time??60} onChange={v=>onUpdate('time',v)} color={color}/></div>
              </InlineRow>
              <InlineRow label="FDBK">
                <div style={{ flex:1 }}><HSlider value={params.feedback??50} onChange={v=>onUpdate('feedback',v)} color={color}/></div>
              </InlineRow>
            </div>
          </Section>
          <Section label="TRIG" color={color} noBorder>
            <InlineRow label="SENS">
              <div style={{ flex:1 }}><HSlider value={params.end??60} onChange={v=>onUpdate('end',v)} color={color}/></div>
              <MiniDisplay value={`${Math.round(params.end??60)}%`} width={34}/>
            </InlineRow>
          </Section>
        </>
      )}
    </div>
  );
}

function TimeSamplerControls({ params, onUpdate, color }: { params: Record<string,number>; onUpdate:(p:string,v:number)=>void; color:string }) {
  const rate = 0.25 + ((params.rate ?? 43) / 100) * 1.75;
  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1 }}>
      <Section label="MODE" color={color}>
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
      </Section>
      <Section label="CHNK" color={color}>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <InlineRow label="LEN">
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
          </InlineRow>
          <InlineRow label="RPT">
            {[1, 2, 4, 6, 8].map(n => {
              const currentRepeats = Math.round((params.repeats ?? 50) / 100 * 8) || 1;
              return <RackBtn key={n} label={`${n}×`} active={currentRepeats===n} color={color} onClick={()=>onUpdate('repeats', (n / 8) * 100)} width={28}/>;
            })}
          </InlineRow>
        </div>
      </Section>
      <Section label="SPD" color={color}>
        <InlineRow label="RATE">
          <div style={{ flex:1 }}>
            <HSlider value={params.rate??43} onChange={v=>onUpdate('rate',v)} color={color}/>
          </div>
          <MiniDisplay value={`${rate.toFixed(2)}×`} width={40}/>
        </InlineRow>
      </Section>
      <Section label="TRIG" color={color} noBorder>
        <InlineRow label="SENS">
          <div style={{ flex:1 }}>
            <HSlider value={params.chance??60} onChange={v=>onUpdate('chance',v)} color={color}/>
          </div>
          <MiniDisplay value={`${Math.round(params.chance??60)}%`} width={34}/>
        </InlineRow>
      </Section>
    </div>
  );
}

function MixSection({ params, onUpdate, color }: { params:Record<string,number>; onUpdate:(p:string,v:number)=>void; color:string }) {
  return (
    <div style={{
      background:'linear-gradient(180deg,#111214,#0f1012)',
      borderTop:'2px solid #0d0e0f', padding:'3px 8px',
      display:'flex', alignItems:'center', gap:6, flexShrink:0,
    }}>
      <VertLabel text="MIX" color={color}/>
      <div style={{ flex:1, display:'flex', justifyContent:'space-around', alignItems:'center' }}>
        <Knob label="IN" value={params.in_??80} onChange={v=>onUpdate('in_',v)} size="xs" color={color}/>
        <Knob label="MIX" value={params.mix??50} onChange={v=>onUpdate('mix',v)} size="xs" color={color}/>
        <Knob label="OUT" value={params.out??60} onChange={v=>onUpdate('out',v)} size="xs" color={color}/>
      </div>
    </div>
  );
}

export function EffectModule({ config, params, onUpdateParam, bypassed, muted, onToggleBypass, onToggleMute, videoLayer, onSetVideoLayer, midiLayer, onSetMidiLayer, isOnAir, onModuleDrop }: EffectModuleProps) {
  const { id, name, accentColor } = config;
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div
      onDragOver={(e) => { if (e.dataTransfer.types.includes('text/x-module')) e.preventDefault(); }}
      onDrop={(e) => {
        const dragged = e.dataTransfer.getData('text/x-module') as ModuleType;
        if (dragged && onModuleDrop) { e.preventDefault(); onModuleDrop(dragged); }
      }}
      style={{
        flex:1, minWidth:0,
        background:'#131416',
        borderRight:'1px solid #0d0e0f',
        display:'flex', flexDirection:'column',
        opacity: muted ? 0.35 : bypassed ? 0.55 : 1,
        filter: bypassed ? 'saturate(0.15) brightness(0.6)' : undefined,
        position:'relative', overflow:'hidden',
      }}>
      <div
        draggable
        onDragStart={(e) => { e.dataTransfer.setData('text/x-module', id); e.dataTransfer.effectAllowed = 'move'; }}
        title="Drag to reorder"
        style={{
          display:'flex', alignItems:'center', padding:'0 5px', height:26,
          background:'linear-gradient(180deg,#1e2124,#181a1c 55%,#141618 100%)',
          borderBottom:'1px solid #0d0e0f', borderTop:'1px solid #252729',
          gap:3, flexShrink:0, cursor:'grab',
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

      {!collapsed && <MixSection params={params} onUpdate={onUpdateParam} color={accentColor}/>}
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
    uniform float uPlaying;
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
    // beat kick: a spike on the downbeat that decays over the beat, and ZERO when
    // stopped (no beat = no kick). Base effect motion runs on uTime instead so it
    // looks the same playing or stopped; the kick just adds punctuation.
    float beatPulse(float sharpness){ return uPlaying * exp(-uBeatPhase * sharpness); }
    // scrub NaN/Inf so a bad frame can't poison the feedback buffer into a whiteout
    vec3 sanitize(vec3 c){
      c.r = (c.r <= 1e4 && c.r >= -1e4) ? c.r : 0.0;
      c.g = (c.g <= 1e4 && c.g >= -1e4) ? c.g : 0.0;
      c.b = (c.b <= 1e4 && c.b >= -1e4) ? c.b : 0.0;
      return clamp(c, 0.0, 1.0);
    }
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

    /* Per-module idle graphic (defined by each effect shader below): a param-reactive
       visualization that shows what the module does before any clip is loaded. */
    vec3 moduleIdle(vec2 uv, float t);

    /* Test card source when no clip is loaded: color bars + gray ramp up top for
       color-effect readouts, the module's own idle graphic below. Runs on uSrcTime
       so time-remapping modules visibly warp it. */
    vec3 testPattern(vec2 uv){
      float t = uSrcTime;
      float aspect = uResolution.x / uResolution.y;
      vec3 col;
      if(uv.y > 0.74){
        col = smpteBar(floor(uv.x * 7.0)) * 0.9;
        col *= 0.82 + 0.18 * smoothstep(0.0, 0.03, abs(fract(uv.x * 7.0) - 0.5));
      } else if(uv.y > 0.64){
        col = vec3(floor(uv.x * 12.0) / 11.0);
      } else {
        col = moduleIdle(vec2(uv.x, uv.y / 0.64), t);
      }
      // beat flash marker, top-left
      float mk = step(max(abs(uv.x - 0.03) * aspect, abs(uv.y - 0.96)), 0.028);
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
    /* Idle: chevrons marching in the selected transition's direction. */
    vec3 moduleIdle(vec2 uv, float t){
      float aspect = uResolution.x / uResolution.y;
      vec3 col = vec3(0.045, 0.05, 0.06);
      vec2 gr = fract(uv * vec2(aspect * 5.0, 5.0));
      col += vec3(0.045) * step(0.95, max(gr.x, gr.y));
      float typeI = floor(uP0.x + 0.5);
      vec2 dir = typeI < 0.5 ? vec2(-1.0, 0.0)
               : typeI < 1.5 ? vec2(1.0, 0.0)
               : typeI < 2.5 ? vec2(0.0, 1.0)
               : typeI < 3.5 ? vec2(0.0, -1.0)
               : vec2(1.0, 0.0);
      float along = dot(uv - 0.5, dir) * 4.0 - t * 1.4;
      float lane = abs(dot(uv - 0.5, vec2(-dir.y, dir.x)));
      float chev = smoothstep(0.78, 0.9, fract(along + lane * 1.5)) * smoothstep(0.42, 0.0, lane);
      col += uColor * chev * 0.55;
      return col;
    }
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
    /* Idle: film-strip ticks scrolling on the remapped clock - speed changes are
       obvious as the ticks accelerate and crawl with the bezier curve. */
    vec3 moduleIdle(vec2 uv, float t){
      vec3 col = vec3(0.045, 0.05, 0.06);
      float x = fract(uv.x * 7.0 - t * 1.4);
      float tick = smoothstep(0.10, 0.03, abs(x - 0.5));
      col += uColor * tick * (0.2 + 0.55 * smoothstep(0.4, 0.0, abs(uv.y - 0.5)));
      col += vec3(0.35) * smoothstep(0.004, 0.0, abs(uv.x - 0.5)) * 0.5;
      return col;
    }
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
    /* Idle: the classic tap-line display - echo taps sweep with TIME, fade with
       FEEDBACK, chop in Stutter mode, and mask with the Filter slider. */
    vec3 moduleIdle(vec2 uv, float t){
      vec3 col = vec3(0.03, 0.035, 0.045);
      float typeIdx = uP0.x;
      float vel = uP0.y;
      float feedback = uP1.y;
      float delayT = uP1.x;
      float filtPos = uP1.w;
      float beatInterval = 60.0 / max(1.0, uBPM);
      float tapInterval = mix(beatInterval * 0.125, beatInterval * 2.0, delayT);
      for(int i = 0; i < 8; i++){
        float fi = float(i);
        float xPos = fract(t / tapInterval * 0.5 + fi / 8.0);
        float bw = 0.015 + vel * 0.02 + fi * 0.003;
        float fade = pow(max(0.0, feedback), fi);
        float band = smoothstep(bw, 0.0, abs(uv.x - xPos));
        vec3 tapCol = uColor;
        if(typeIdx > 0.5 && typeIdx < 1.5){
          band *= step(0.5, fract(uv.y * 5.0 + fi * 0.7 + uBeatPhase * 4.0));
          tapCol = mix(uColor, vec3(0.8, 0.9, 1.0), 0.35);
        } else if(typeIdx > 1.5){
          band *= smoothstep(filtPos - 0.1, filtPos + 0.1, uv.y);
          tapCol = mix(uColor, vec3(0.3, 0.5, 1.0), 0.4);
        }
        col += tapCol * band * fade * 1.7;
      }
      return col;
    }
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
      vec3 prev = sanitize(texture2D(uPrevTex, clamp(pUv, 0.0, 1.0)).rgb);

      float fb = clamp(feedback * 0.9 + pulse * 0.03, 0.0, 0.94);
      vec3 cur = sampleSource(uv);
      vec3 wet;
      if(typeIdx > 1.5){
        float k = smoothstep(filtPos * 0.9, filtPos * 0.9 + 0.2, luma(prev));
        wet = max(cur, prev * fb * mix(vec3(1.0), uColor * 1.5, 0.4) * (0.35 + k * 0.65));
      } else {
        wet = max(cur, prev * fb);
      }
      wet *= 1.0 + pulse * 0.08;

      // STUTTER: punctuate every beat-repeat so the jump is unmistakable - the
      // source has already scrubbed back (uAux1=stuttering, uAux2=repeat progress);
      // here we flash + RGB-split hard at the top of each repeat, easing out.
      if(typeIdx > 0.5 && typeIdx < 1.5 && uAux1 > 0.5){
        float rep = pow(1.0 - uAux2, 2.0);
        float sp = 0.008 + rep * 0.03;
        wet.r = sampleSource(uv + vec2(sp, 0.0)).r;
        wet.b = sampleSource(uv - vec2(sp, 0.0)).b;
        wet *= 1.0 + rep * 0.5;
        // strobe scanline sweeping on each repeat
        wet += uColor * smoothstep(0.02, 0.0, abs(uv.y - fract(uAux2 * 2.0))) * rep * 0.4;
      }

      float wetAmt = uMode < 0.5 ? 1.0 : mix_;
      if(uBypass > 0.5 && uMode > 0.5) wetAmt = 0.0;
      gl_FragColor = vec4(finishPx(mix(cur, wet, wetAmt), uv), 1.0);
    }`;
  }

  if (type === 'punch') {
    return `${common}
    /* Idle: bullseye zoom target - the crash zoom reads instantly against it. */
    vec3 moduleIdle(vec2 uv, float t){
      float aspect = uResolution.x / uResolution.y;
      vec2 c = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
      float r = length(c);
      vec3 col = vec3(0.045, 0.05, 0.06);
      col += uColor * (smoothstep(0.016, 0.0, abs(r - 0.12))
                     + smoothstep(0.016, 0.0, abs(r - 0.27))
                     + smoothstep(0.016, 0.0, abs(r - 0.42))) * 0.95;
      float cross = min(abs(c.x), abs(c.y));
      col += uColor * smoothstep(0.008, 0.0, cross) * step(r, 0.5) * 0.5;
      col += vec3(0.95) * smoothstep(0.03, 0.0, r) * 0.8;
      return col;
    }
    /* Crash zoom: beat-synced punch-in / punch-out like a fake camera zoom hit.
       DIR knob: low = IN, mid = alternate, high = OUT. */
    void main(){
      vec2 uv = vUv;
      float dirP = uP0.x;
      float amt  = uP0.y;
      float snap = uP0.z;
      float mix_ = uP0.w;
      float pulse = uPlaying * exp(-uBeatPhase * (3.0 + snap * 9.0));
      float dir = dirP < 0.33 ? 1.0 : dirP < 0.66 ? (mod(floor(uBeat), 2.0) < 0.5 ? 1.0 : -1.0) : -1.0;
      // gentle idle breathing so the frame is alive with no beat
      float breath = (0.5 - 0.5 * cos(uTime * 1.2)) * (0.02 + amt * 0.03);
      float z = max(0.35, 1.0 + dir * pulse * (amt * amt * 1.4 + amt * 0.25 + uBassAmp * 0.12) + dir * breath);

      // motion blur along the zoom
      vec3 wet = vec3(0.0);
      for(int i = 0; i < 5; i++){
        float zz = mix(1.0, z, 0.55 + 0.45 * float(i) / 4.0);
        wet += sampleSource((uv - 0.5) / zz + 0.5);
      }
      wet /= 5.0;
      wet *= 1.0 + pulse * 0.08;

      float wetAmt = uMode < 0.5 ? 1.0 : mix_;
      if(uBypass > 0.5 && uMode > 0.5) wetAmt = 0.0;
      vec3 dry = sampleSource(uv);
      gl_FragColor = vec4(finishPx(mix(dry, wet, wetAmt), uv), 1.0);
    }`;
  }

  if (type === 'shake') {
    return `${common}
    /* Idle: horizon and level grid - the handheld wobble reads against straight lines. */
    vec3 moduleIdle(vec2 uv, float t){
      float aspect = uResolution.x / uResolution.y;
      vec3 col = vec3(0.045, 0.05, 0.06);
      float hLine = smoothstep(0.006, 0.0, abs(fract(uv.y * 4.0 + 0.5) - 0.5) / 4.0);
      float vLine = smoothstep(0.006, 0.0, abs(fract(uv.x * aspect * 4.0 + 0.5) - 0.5) / (aspect * 4.0));
      col += vec3(0.16, 0.17, 0.20) * max(hLine, vLine);
      // emphasized horizon + level marks
      col += uColor * smoothstep(0.012, 0.0, abs(uv.y - 0.5)) * 0.95;
      float marks = step(abs(uv.y - 0.5), 0.05) * step(0.88, fract(uv.x * aspect * 8.0));
      col += uColor * marks * 0.6;
      return col;
    }
    /* Handheld camera: a body operator's frame. Slow breathing sway + faster
       micro-jitter (always running on uTime), footstep bumps on the beat, and a
       drifting roll. The frame is cropped in so the shove never reveals edges. */
    void main(){
      vec2 uv = vUv;
      float hand   = uP0.x;   // overall handheld intensity
      float impact = uP0.y;   // footstep bump strength on the beat
      float sway   = uP0.z;   // rotational roll
      float mix_   = uP0.w;
      float t = uTime;

      float amp = 0.006 + hand * hand * 0.05;
      // slow operator sway (breathing / weight shift) from incommensurate sines
      vec2 drift = vec2(
        sin(t * 0.9) + 0.6 * sin(t * 1.73 + 1.3) + 0.3 * sin(t * 3.1 + 0.5),
        cos(t * 1.1) + 0.6 * sin(t * 2.17 + 2.1) + 0.3 * cos(t * 2.7 + 1.7)
      ) * amp;
      // fast fine hand jitter
      vec2 jit = vec2(sin(t * 17.0) + 0.5 * sin(t * 29.0), cos(t * 19.0) + 0.5 * sin(t * 31.0))
                 * amp * 0.18 * (0.3 + hand);
      // footstep: a lurch on the beat (settles downward), random per step
      float boot = beatPulse(9.0) * impact;
      vec2 stepOff = vec2(hash(vec2(floor(uBeat), 3.7)) - 0.5, -abs(hash(vec2(floor(uBeat), 9.1)) - 0.5) * 1.4)
                     * boot * (0.03 + impact * 0.1);
      vec2 off = drift + jit + stepOff;

      // drifting roll + a kick on footsteps
      float ang = (sin(t * 0.6) + 0.5 * sin(t * 1.27 + 1.0)) * sway * (0.02 + sway * 0.07)
                  + boot * sway * 0.04;
      // crop in so translation/rotation never exposes the frame edge
      float z = 1.07 + hand * 0.06 + boot * (0.03 + impact * 0.07);

      vec2 c = uv - 0.5;
      float cs = cos(ang), sn = sin(ang);
      c = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
      vec3 wet = sampleSource(c / z + 0.5 + off);

      float wetAmt = uMode < 0.5 ? 1.0 : mix_;
      if(uBypass > 0.5 && uMode > 0.5) wetAmt = 0.0;
      vec3 dry = sampleSource(uv);
      gl_FragColor = vec4(finishPx(mix(dry, wet, wetAmt), uv), 1.0);
    }`;
  }

  if (type === 'orbit') {
    return `${common}
    /* Idle: map grid with landmark beacons - the dolly drift pans across it. */
    vec3 moduleIdle(vec2 uv, float t){
      float aspect = uResolution.x / uResolution.y;
      vec3 col = vec3(0.045, 0.05, 0.06);
      vec2 g = uv * vec2(aspect * 6.0, 6.0);
      col += vec3(0.09, 0.10, 0.12) * step(0.92, max(fract(g.x), fract(g.y)));
      for(int i = 0; i < 5; i++){
        float fi = float(i);
        vec2 lp = vec2(hash(vec2(fi, 2.7)), hash(vec2(7.7, fi)));
        float d = length(vec2((uv.x - lp.x) * aspect, uv.y - lp.y));
        col += uColor * smoothstep(0.032, 0.0, d) * 1.1;
        col += uColor * smoothstep(0.09, 0.0, d) * 0.22 * (1.0 + 0.5 * sin(t * 2.0 + fi * 2.1));
      }
      return col;
    }
    /* Drift cam: a flying dolly move across a cropped frame. The sweep runs on
       uTime so it looks identical playing or stopped; the beat only adds a nudge
       on top (SPD = travel speed, DRIFT = travel distance, NUDGE = beat kick). */
    void main(){
      vec2 uv = vUv;
      float spd   = uP0.x;
      float drift = uP0.y;
      float nudge = uP0.z;
      float mix_  = uP0.w;
      float t = uTime * (0.12 + spd * 0.6 + spd * spd * 1.4);
      float pulse = beatPulse(4.0);

      // crop in enough that even a big sweep never shows the edge
      float dist = 0.12 + drift * 0.26;
      float zoomBase = 1.18 + drift * 0.5;
      // wandering path (two incommensurate orbits) - the always-on "full drift"
      vec2 offs = vec2(
        sin(t * 0.8) + 0.5 * sin(t * 1.9 + 1.1),
        cos(t * 0.63) + 0.5 * cos(t * 1.7 + 0.4)
      ) * dist * 0.6;
      // beat nudge kicks the frame, then it eases back (0 when stopped)
      offs += vec2(sin(uBeat * 1.7), cos(uBeat * 1.1)) * pulse * nudge * (0.03 + nudge * 0.06);
      float z = zoomBase * (1.0 + pulse * nudge * 0.06);
      vec3 wet = sampleSource((uv - 0.5) / z + 0.5 + offs);

      float wetAmt = uMode < 0.5 ? 1.0 : mix_;
      if(uBypass > 0.5 && uMode > 0.5) wetAmt = 0.0;
      vec3 dry = sampleSource(uv);
      gl_FragColor = vec4(finishPx(mix(dry, wet, wetAmt), uv), 1.0);
    }`;
  }

  if (type === 'focus') {
    return `${common}
    /* Idle: starburst focus chart with fine line rows - defocus blur is unmistakable. */
    vec3 moduleIdle(vec2 uv, float t){
      float aspect = uResolution.x / uResolution.y;
      vec2 c = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
      float r = length(c);
      vec3 col = vec3(0.045, 0.05, 0.06);
      // Siemens star
      float star = step(0.0, sin(atan(c.y, c.x) * 18.0));
      col = mix(col, vec3(0.8) * (0.35 + 0.65 * star), smoothstep(0.42, 0.40, r));
      col += uColor * smoothstep(0.012, 0.0, abs(r - 0.42)) * 0.8;
      // fine "text" line rows in the margins
      float rows = step(0.55, fract(uv.y * 22.0)) * step(0.44, r);
      col += vec3(0.5) * rows * 0.45;
      return col;
    }
    /* Rack focus: defocus blur that racks in and out with the beat; sharp on the
       downbeat like a focus pull landing. */
    void main(){
      vec2 uv = vUv;
      float amt    = uP0.x;
      float pulseP = uP0.y;
      float soft   = uP0.z;
      float mix_   = uP0.w;

      // rack pulls to the beat when playing, breathes on its own clock when stopped
      float rackPhase = mix(uTime * 0.22, uBeat / 2.0, uPlaying);
      float rack = 0.5 - 0.5 * cos(fract(rackPhase) * TAU);
      float blur = (amt * 0.35 + rack * pulseP) * (0.014 + pulseP * 0.035);

      vec3 wet = vec3(0.0);
      for(int i = 0; i < 8; i++){
        float a = float(i) / 8.0 * TAU;
        wet += sampleSource(uv + vec2(cos(a), sin(a)) * blur);
      }
      wet /= 8.0;
      wet += max(wet - 0.62, 0.0) * soft * min(1.0, blur * 45.0);

      float wetAmt = uMode < 0.5 ? 1.0 : mix_;
      if(uBypass > 0.5 && uMode > 0.5) wetAmt = 0.0;
      vec3 dry = sampleSource(uv);
      gl_FragColor = vec4(finishPx(mix(dry, wet, wetAmt), uv), 1.0);
    }`;
  }

  return `${common}
    /* Idle: barcode timeline scrubbed by the remapped clock - chunk loops visibly
       rewind the pattern; flash while a chunk repeats. */
    vec3 moduleIdle(vec2 uv, float t){
      vec3 col = vec3(0.04, 0.045, 0.055);
      float sx = (uv.x + t * 0.35) * 30.0;
      float cell = floor(sx);
      float v = hash(vec2(cell, 7.0));
      // variable-width thin bars, like a real barcode
      float line = step(fract(sx), 0.18 + v * 0.4) * step(0.3, v);
      col += uColor * line * (0.35 + v * 0.5) * smoothstep(0.46, 0.42, abs(uv.y - 0.5));
      col += vec3(0.9) * smoothstep(0.004, 0.0, abs(uv.x - 0.5)) * 0.5;
      col += uColor * uAux1 * exp(-uAux2 * 5.0) * 0.12;
      return col;
    }
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
    vec3 cur = sampleSource(st);

    // Sampled hold: while a chunk repeats (uAux1), FREEZE the frame from the
    // feedback buffer, then hard-cut to the freshly scrubbed source at the top of
    // each repeat (uAux2 near 0). Reads as a machine-gun beat-repeat.
    vec3 prev = sanitize(texture2D(uPrevTex, uv).rgb);
    float held = step(0.10, uAux2);          // 0 at retrigger (show jump), 1 = hold
    vec3 wet = mix(cur, prev, uAux1 * held);

    // retrigger flash + RGB split so every chunk repeat pops
    float flash = uAux1 * exp(-uAux2 * 6.0);
    float sp = flash * 0.035;
    wet.r = mix(wet.r, sampleSource(st + vec2(sp, 0.0)).r, uAux1);
    wet.b = mix(wet.b, sampleSource(st - vec2(sp, 0.0)).b, uAux1);
    wet *= 1.0 + flash * 0.5 + pulse * 0.05;
    wet += uColor * flash * 0.12;

    float wetAmt = uMode < 0.5 ? 1.0 : mix_;
    if(uBypass > 0.5 && uMode > 0.5) wetAmt = 0.0;
    vec3 col = mix(cur, wet, wetAmt);

    if(uMode < 0.5 && uv.y < 0.045){
      // chunk progress strip: fills as the current chunk plays out
      col *= 0.25;
      col += uColor * (0.12 + step(uv.x, uAux2) * uAux1 * 0.9);
    }
    gl_FragColor = vec4(finishPx(col, uv), 1.0);
  }`;
}

interface CompactSpec {
  /** Preset buttons set several params at once; the last one is deliberately extreme. */
  buttons: { label: string; set: Record<string, number> }[];
  primary: string;
  slider: { param: string; label: string };
  knobs: { param: string; label: string }[];
}

const COMPACT_CONTROLS: Partial<Record<ModuleType, CompactSpec>> = {
  punch: {
    buttons: [
      { label: 'IN', set: { dir: 10 } },
      { label: 'ALT', set: { dir: 50 } },
      { label: 'OUT', set: { dir: 90 } },
    ],
    primary: 'dir',
    slider: { param: 'amt', label: 'AMOUNT' },
    knobs: [{ param: 'snap', label: 'SNAP' }, { param: 'mix', label: 'MIX' }],
  },
  shake: {
    buttons: [
      { label: 'WALK', set: { impact: 22, hand: 22, sway: 15 } },
      { label: 'RUN', set: { impact: 48, hand: 45, sway: 30 } },
      { label: 'CHASE', set: { impact: 72, hand: 68, sway: 50 } },
      { label: 'RIOT', set: { impact: 100, hand: 100, sway: 85 } },
    ],
    primary: 'impact',
    slider: { param: 'hand', label: 'HANDHELD' },
    knobs: [{ param: 'sway', label: 'SWAY' }, { param: 'mix', label: 'MIX' }],
  },
  orbit: {
    buttons: [
      { label: 'SLOW', set: { spd: 15, drift: 32, nudge: 20 } },
      { label: 'MED', set: { spd: 45, drift: 55, nudge: 40 } },
      { label: 'FAST', set: { spd: 72, drift: 75, nudge: 60 } },
      { label: 'WARP', set: { spd: 100, drift: 100, nudge: 90 } },
    ],
    primary: 'spd',
    slider: { param: 'drift', label: 'DRIFT' },
    knobs: [{ param: 'nudge', label: 'NUDGE' }, { param: 'mix', label: 'MIX' }],
  },
  focus: {
    buttons: [
      { label: 'SOFT', set: { pulse: 22, amt: 18, soft: 30 } },
      { label: 'PULL', set: { pulse: 52, amt: 30, soft: 45 } },
      { label: 'HARD', set: { pulse: 78, amt: 50, soft: 60 } },
      { label: 'BLIND', set: { pulse: 100, amt: 88, soft: 95 } },
    ],
    primary: 'pulse',
    slider: { param: 'amt', label: 'BASE BLUR' },
    knobs: [{ param: 'soft', label: 'BLOOM' }, { param: 'mix', label: 'MIX' }],
  },
};

/** Slim second-row module: header, FX-preview screen, and a single knob row. */
export function CompactModule({ config, params, onUpdateParam, bypassed, onToggleBypass, videoLayer, onSetVideoLayer, isOnAir, onModuleDrop }: {
  config: ModuleConfig;
  params: Record<string, number>;
  onUpdateParam: (param: string, value: number) => void;
  bypassed: boolean;
  onToggleBypass: () => void;
  videoLayer: VideoLayer | null;
  onSetVideoLayer: (file: File | null) => void;
  isOnAir?: boolean;
  onModuleDrop?: (draggedId: ModuleType) => void;
}) {
  const { id, name, accentColor } = config;
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const dragDepth = useRef(0);

  const spec = COMPACT_CONTROLS[id];

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); if (e.dataTransfer.types.includes('Files')) { dragDepth.current++; setDragOver(true); } }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => { e.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        const dragged = e.dataTransfer.getData('text/x-module') as ModuleType;
        if (dragged && onModuleDrop) { onModuleDrop(dragged); return; }
        const file = e.dataTransfer.files?.[0];
        if (file?.type.startsWith('video/')) onSetVideoLayer(file);
      }}
      style={{
        flex: 1, minWidth: 0,
        background: '#131416',
        borderRight: '1px solid #0d0e0f',
        display: 'flex', flexDirection: 'column',
        opacity: bypassed ? 0.55 : 1,
        filter: bypassed ? 'saturate(0.15) brightness(0.6)' : undefined,
        position: 'relative', overflow: 'hidden',
      }}
    >
      <div
        draggable
        onDragStart={(e) => { e.dataTransfer.setData('text/x-module', id); e.dataTransfer.effectAllowed = 'move'; }}
        title="Drag to reorder"
        style={{
          display: 'flex', alignItems: 'center', padding: '0 5px', height: 20,
          background: 'linear-gradient(180deg,#1e2124,#181a1c 55%,#141618 100%)',
          borderBottom: '1px solid #0d0e0f', borderTop: '1px solid #252729',
          gap: 3, flexShrink: 0, cursor: 'grab',
        }}>
        <span style={{
          fontFamily: 'Rajdhani,sans-serif', fontSize: 9, fontWeight: 700,
          letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7a8090',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{name}</span>
        {isOnAir && (
          <span style={{
            fontFamily: 'Rajdhani,sans-serif', fontSize: 6.5, fontWeight: 700, letterSpacing: '0.1em',
            color: '#ef4444', background: '#ef444418', border: '1px solid #ef444455', borderRadius: 2,
            padding: '0px 3px', boxShadow: '0 0 6px #ef444433', flexShrink: 0,
          }}>ON AIR</span>
        )}
        <div style={{ flex: 1 }} />
        <input ref={fileRef} type="file" accept="video/*"
          onChange={(e) => { onSetVideoLayer(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          title={videoLayer ? videoLayer.name : 'Load clip'}
          style={{
            height: 14, paddingInline: 4,
            background: 'linear-gradient(180deg,#191d22,#121519)',
            border: `1px solid ${videoLayer ? accentColor + '44' : '#1a1d22'}`,
            borderRadius: 2, cursor: 'pointer',
            color: videoLayer ? accentColor : '#445060',
            display: 'flex', alignItems: 'center', gap: 2,
            fontFamily: 'Rajdhani,sans-serif', fontSize: 6.5, fontWeight: 700, letterSpacing: '0.08em',
          }}
        >
          <Film size={7} /> CLIP
        </button>
        {videoLayer && (
          <button onClick={() => onSetVideoLayer(null)} style={{
            width: 14, height: 14,
            background: 'linear-gradient(180deg,#241919,#1b1212)', border: '1px solid #342020', borderRadius: 2,
            color: '#c46b6b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}><X size={7} /></button>
        )}
        <button
          onClick={() => setCollapsed(v => !v)}
          title={collapsed ? 'Expand controls' : 'Collapse controls'}
          style={{ width:12, height:12, border:'1px solid #1e2226', borderRadius:2, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', background:'linear-gradient(180deg,#1c1e22,#141618)', padding:0, flexShrink:0 }}
        >
          <svg width={7} height={4} viewBox="0 0 7 4" style={{ transform: collapsed ? 'rotate(180deg)' : undefined, transition:'transform 0.15s' }}>
            <path d="M0 0 L3.5 4 L7 0" fill="none" stroke={collapsed ? accentColor : '#3a4050'} strokeWidth={1.2}/>
          </svg>
        </button>
        <HeaderBtn label="B" active={bypassed} activeColor="#ef4444" onClick={onToggleBypass} />
      </div>

      <div style={{ position: 'relative', width: 'min(100%, calc(300px * 16 / 9))', alignSelf: 'center', aspectRatio: '16/9', background: '#000', flexShrink: 0 }}>
        <ThreeVisualizer type={id} color={accentColor} params={params} mode="effect" videoUrl={videoLayer?.url} bypassed={bypassed} />
        <ScreenOverlay />
        <ScreenBadge text={`FX · ${videoLayer ? 'CLIP' : 'TEST'}`} color={accentColor} />
      </div>

      {!collapsed && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 7px', flexShrink: 0,
        background: 'linear-gradient(180deg,#111214,#0f1012)',
        borderTop: '1px solid #0d0e0f',
      }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {spec?.buttons.map(btn => (
              <RackBtn key={btn.label} label={btn.label}
                active={Math.abs((params[spec.primary] ?? 50) - btn.set[spec.primary]) <= 9}
                color={accentColor}
                onClick={() => Object.entries(btn.set).forEach(([k, v]) => onUpdateParam(k, v))}
                width={36} height={16} />
            ))}
          </div>
          {spec && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: 44, flexShrink: 0, fontSize: 7, fontWeight: 700, color: '#3a4050',
                fontFamily: 'Rajdhani,sans-serif', letterSpacing: '0.08em',
              }}>{spec.slider.label}</span>
              <div style={{ flex: 1 }}>
                <HSlider value={params[spec.slider.param] ?? 50}
                  onChange={v => onUpdateParam(spec.slider.param, v)} color={accentColor} />
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
          {spec?.knobs.map(k => (
            <Knob key={k.param} label={k.label} value={params[k.param] ?? 50}
              onChange={v => onUpdateParam(k.param, v)} size="xs" color={accentColor} />
          ))}
        </div>
      </div>
      )}

      {dragOver && (
        <div style={{
          position: 'absolute', inset: 3, zIndex: 20, pointerEvents: 'none',
          border: `2px dashed ${accentColor}`, borderRadius: 4,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        }}>
          <Upload size={14} color={accentColor} />
          <span style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: accentColor }}>
            DROP CLIP
          </span>
        </div>
      )}
    </div>
  );
}
