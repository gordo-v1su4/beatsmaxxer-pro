import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Upload, X, Film, AudioLines } from 'lucide-react';
import type { ModuleType, ModuleConfig, VideoLayer } from '../App';
import { Knob } from './Knob';
import { useAudio } from '../audio/AudioContext';

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

function createFallbackVideoDataURL(accent: string) {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="#121418"/>
        <stop offset="100%" stop-color="#050608"/>
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#bg)"/>
    <rect x="20" y="20" width="600" height="320" rx="8" fill="#0b0d10" stroke="#23272c"/>
    <g opacity="0.9">
      <rect x="44" y="46" width="552" height="72" fill="#d4d4d4"/>
      <rect x="44" y="118" width="552" height="72" fill="#9d7bff"/>
      <rect x="44" y="190" width="552" height="72" fill="#4fd1c5"/>
      <rect x="44" y="262" width="552" height="52" fill="${accent}"/>
    </g>
    <line x1="320" y1="46" x2="320" y2="314" stroke="#fff" opacity="0.4"/>
    <line x1="44" y1="180" x2="596" y2="180" stroke="#fff" opacity="0.4"/>
    <circle cx="320" cy="180" r="40" fill="none" stroke="#fff" opacity="0.45"/>
    <text x="50%" y="328" fill="#94a3b8" font-size="20" text-anchor="middle" font-family="monospace">UPLOAD CLIP TO REPLACE DEMO SOURCE</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function ThreeVisualizer({ type, color, params, mode, videoUrl }: {
  type: ModuleType; color: string; params: Record<string,number>; mode: 'effect'|'output'; videoUrl?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer|null>(null);
  const materialRef = useRef<THREE.ShaderMaterial|null>(null);
  const frameRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoTextureRef = useRef<THREE.VideoTexture | null>(null);
  const imageTextureRef = useRef<THREE.Texture | null>(null);
  const loopRef = useRef({ lastBeat: 0, isStuttering: false, stutterVideoTime: 0, stutterStartBeat: 0, remRepeats: 0, beatsPassed: 0 });
  const { state: audioState } = useAudio();

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
      uP2: new THREE.Vector4(0, 0, 0, 0),
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

    const fallbackTexture = new THREE.TextureLoader().load(createFallbackVideoDataURL(color));
    fallbackTexture.minFilter = THREE.LinearFilter;
    fallbackTexture.magFilter = THREE.LinearFilter;
    fallbackTexture.wrapS = THREE.ClampToEdgeWrapping;
    fallbackTexture.wrapT = THREE.ClampToEdgeWrapping;
    imageTextureRef.current = fallbackTexture;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:       { value: 0 },
        uResolution: { value: new THREE.Vector2(container.clientWidth, container.clientHeight) },
        uColor:      { value: new THREE.Color(color) },
        uMode:       { value: mode === 'output' ? 1.0 : 0.0 },
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
      const w = container.clientWidth, h = container.clientHeight;
      renderer.setSize(w, h);
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
        
        // Tapdelay Stutter Mode
        if (type === 'tapdelay' && videoRef.current && Math.round(m.uniforms.uP0.value.x) === 1 && m.uniforms.uHasVideo.value > 0.5) {
          const timeP = m.uniforms.uP1.value.x; // STUTTER TIME (0 to 1)
          const feedbackP = m.uniforms.uP1.value.y; // FEEDBACK (0 to 1)
          const freqP = m.uniforms.uP0.value.z; // Use END knob as a frequency for random trigger chance
          
          let stutterLen = 1;
          if (timeP < 0.2) stutterLen = 0.25;      // quarter note (1/4 beat / 16thnote?) Wait, confusing, 0.25 beat is 1/16th note. 1 beat is quarter note.
          else if (timeP < 0.4) stutterLen = 0.5;  // 8th note
          else if (timeP < 0.6) stutterLen = 1.0;  // quarter note (1 beat)
          else if (timeP < 0.8) stutterLen = 2.0;  // half note (2 beats)
          else stutterLen = 4.0;                   // full measure (4 beats)

          if (!st.isStuttering) {
            // Trigger chance on a beat boundary
            if (Math.floor(uBeat) > Math.floor(st.lastBeat) && Math.random() < freqP * 0.3) {
              st.isStuttering = true;
              st.stutterVideoTime = videoRef.current.currentTime;
              st.stutterStartBeat = uBeat;
              st.remRepeats = 1 + Math.floor(feedbackP * 7); // 1 up to 8 repeats
            }
          } else {
            if (uBeat - st.stutterStartBeat >= stutterLen) {
              st.remRepeats--;
              if (st.remRepeats > 0) {
                videoRef.current.currentTime = st.stutterVideoTime;
                st.stutterStartBeat = uBeat;
              } else {
                st.isStuttering = false;
              }
            }
          }
          st.lastBeat = uBeat;
        } 
        else if (type === 'bubblegrains' && videoRef.current && m.uniforms.uHasVideo.value > 0.5) {
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
      renderer.render(scene, camera);
      frameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', onResize);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      videoTextureRef.current?.dispose();
      imageTextureRef.current?.dispose();
      renderer.dispose();
      mat.dispose();
    };
  }, [type, color, mode, getUniforms]);

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
    if (!m) return;
    const bands = audioState.fftBands ?? new Array(8).fill(0);
    m.uniforms.uBPM.value = audioState.bpm;
    m.uniforms.uBeat.value = audioState.beat;
    m.uniforms.uBeatPhase.value = audioState.beatPhase;
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

function VideoPatchBay({ color, videoLayer, onSetVideoLayer }: {
  color: string;
  videoLayer: VideoLayer | null;
  onSetVideoLayer: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:5,
      padding:'4px 5px',
      background:'linear-gradient(180deg,#111315,#0d0f11)',
      borderBottom:'1px solid #0d0e0f',
      flexShrink:0,
    }}>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          onSetVideoLayer(file);
          e.currentTarget.value = '';
        }}
        style={{ display:'none' }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        style={{
          height:20, paddingInline:7,
          background:'linear-gradient(180deg,#191d22,#121519)',
          border:`1px solid ${videoLayer ? color+'44' : '#1a1d22'}`,
          borderTop:'1px solid #252a30',
          borderRadius:2,
          color: videoLayer ? color : '#445060',
          display:'flex', alignItems:'center', gap:4,
          cursor:'pointer',
          fontFamily:'Rajdhani,sans-serif', fontSize:8, fontWeight:700, letterSpacing:'0.08em',
          boxShadow: videoLayer ? `0 0 8px ${color}22` : 'inset 0 1px 2px rgba(0,0,0,0.4)',
        }}
      >
        <Upload size={9} />
        CLIP
      </button>
      <div style={{
        flex:1,
        minWidth:0,
        height:20,
        background:'#0a0b0c',
        border:'1px solid #171a1d',
        borderTop:'1px solid #101214',
        borderRadius:2,
        display:'flex', alignItems:'center', gap:5,
        paddingInline:6,
        boxShadow:'inset 0 2px 5px rgba(0,0,0,0.75)',
      }}>
        <Film size={9} color={videoLayer ? color : '#3a4050'} />
        <span style={{
          fontFamily:'Share Tech Mono,monospace', fontSize:8, letterSpacing:'0.03em',
          color: videoLayer ? '#c0d7ff' : '#4a5260',
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
        }}>
          {videoLayer?.name ?? 'Demo source'}
        </span>
      </div>
      {videoLayer && (
        <button
          onClick={() => onSetVideoLayer(null)}
          style={{
            width:20, height:20,
            background:'linear-gradient(180deg,#241919,#1b1212)',
            border:'1px solid #342020',
            borderRadius:2,
            color:'#c46b6b', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}
        >
          <X size={9} />
        </button>
      )}
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

function DualScreen({ type, color, params, videoLayer, onSetVideoLayer }: {
  type: ModuleType; color: string; params: Record<string,number>; videoLayer: VideoLayer | null; onSetVideoLayer: (file: File | null) => void;
}) {
  const { state } = useAudio();
  return (
    <div style={{ display:'flex', flexDirection:'column', flexShrink:0, background:'#000', borderBottom:'2px solid #0d0e0f' }}>
      <VideoPatchBay color={color} videoLayer={videoLayer} onSetVideoLayer={onSetVideoLayer} />
      <FFTStrip color={color} />
      <div style={{ position:'relative', width:'100%', aspectRatio:'16/9', background:'#000', borderBottom:'1px solid #111' }}>
        <ThreeVisualizer type={type} color={color} params={params} mode="effect" videoUrl={videoLayer?.url} />
        <ScreenOverlay/>
        <ScreenBadge text="EFFECT ▶ CURVE / FILTER" color={color}/>
        <div style={{ position:'absolute', top:4, right:5, zIndex:8, display:'flex', gap:2, alignItems:'flex-end' }}>
          <VUMeter value={(state.bassAmp * 100) || (params.in_ ?? 70)} color={color}/>
          <VUMeter value={(state.amplitude * 200) || (params.out ?? 55)} color={color}/>
        </div>
        {state.beatPhase < 0.08 && state.playing && (
          <div style={{ position:'absolute', inset:0, zIndex:4, pointerEvents:'none', border:`1px solid ${color}44`, borderRadius:0, boxShadow:`inset 0 0 12px ${color}22` }}/>
        )}
      </div>
      <div style={{ position:'relative', width:'100%', aspectRatio:'16/9', background:'#000' }}>
        <ThreeVisualizer type={type} color={color} params={params} mode="output" videoUrl={videoLayer?.url} />
        <ScreenOverlay/>
        <ScreenBadge text="OUTPUT ◼ PROCESSED CLIP" color={color}/>
      </div>
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
          <span style={{ fontSize:7, letterSpacing:'0.05em', color:tapFlash?'#3b82f688':'#2a3040', fontFamily:'Rajdhani,sans-serif' }}>
            {Math.round(audioState.bpm)} BPM
          </span>
        </button>
      </div>
      <Section label="TIME" color={color}>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <HSlider value={params.time??60} onChange={v=>onUpdate('time',v)} color={color} label="STUTTER TIME"/>
          <HSlider value={params.feedback??50} onChange={v=>onUpdate('feedback',v)} color={color} label="FEEDBACK"/>
        </div>
      </Section>
      <Section label="ENV" color={color} noBorder>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Knob label="VEL" value={params.velCrv??55} onChange={v=>onUpdate('velCrv',v)} size="sm" color={color}/>
          <Knob label="START" value={params.start??25} onChange={v=>onUpdate('start',v)} size="sm" color={color}/>
          <Knob label="END" value={params.end??70} onChange={v=>onUpdate('end',v)} size="sm" color={color}/>
        </div>
      </Section>
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

export function EffectModule({ config, params, onUpdateParam, bypassed, muted, onToggleBypass, onToggleMute, videoLayer, onSetVideoLayer }: EffectModuleProps) {
  const { id, name, accentColor } = config;
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
        <div style={{ width:12, height:12, border:'1px solid #1e2226', borderRadius:2, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', background:'linear-gradient(180deg,#1c1e22,#141618)' }}>
          <svg width={7} height={4} viewBox="0 0 7 4"><path d="M0 0 L3.5 4 L7 0" fill="none" stroke="#3a4050" strokeWidth={1.2}/></svg>
        </div>
        <HeaderBtn label="B" active={bypassed} activeColor="#ef4444" onClick={onToggleBypass}/>
        <HeaderBtn label="M" active={muted} activeColor="#eab308" onClick={onToggleMute}/>
        <Screw/>
      </div>

      <DualScreen type={id} color={accentColor} params={params} videoLayer={videoLayer} onSetVideoLayer={onSetVideoLayer} />

      <div style={{ flex:1, display:'flex', flexDirection:'column', overflowY:'auto', overflowX:'hidden' }}>
        {id==='shaper' && <ShaperControls params={params} onUpdate={onUpdateParam} color={accentColor}/>}
        {id==='downsampler' && <DownsamplerControls params={params} onUpdate={onUpdateParam} color={accentColor}/>}
        {id==='tapdelay' && <TapDelayControls params={params} onUpdate={onUpdateParam} color={accentColor}/>}
        {id==='bubblegrains' && <BubbleGrainsControls params={params} onUpdate={onUpdateParam} color={accentColor}/>}
      </div>

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
    uniform float uHasVideo;
    varying vec2 vUv;

    #define PI  3.14159265359
    #define TAU 6.28318530718

    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float noise(vec2 p){
      vec2 i=floor(p), f=fract(p);
      vec2 u=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
    }
    float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){v+=a*noise(p);p*=2.03;a*=0.5;} return v; }
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
      vec3 tex = texture2D(uVideoTex, clamp(suv, 0.0, 1.0)).rgb;
      float vign = 1.0 - dot(uv - 0.5, uv - 0.5) * 0.95;
      float scan = 0.95 + 0.05 * sin(uv.y * uResolution.y * 0.6);
      return tex * vign * scan;
    }
  `;

  if (type === 'shaper') {
    return `${common}
    void main(){
      vec2 uv=vUv;
      float t=uTime;
      float algo=uP0.x;
      float offset=uP0.y;
      float freq=uP0.z;
      float clip=uP0.w;
      float amount=uP1.x;
      float mix_=uP1.y;
      float pulse=beatPulse(6.0);
      float low=uFFT0.x;
      float mid=uFFT0.z;

      if(uMode < 0.5){
        vec2 grid=fract(uv*vec2(20.0,10.0));
        float gx=step(0.97,grid.x), gy=step(0.95,grid.y);
        vec3 col=vec3(gx+gy)*0.04;
        float phase = t*(1.3+freq*2.5) + uBeatPhase*TAU*(1.0+freq*3.0);
        float f = 2.0 + freq*14.0 + low*10.0;
        float amp = amount*0.42 + uBassAmp*0.2;
        float a2=floor(algo+0.5);
        float wave=0.0;
        if(a2<1.5) wave=sin(uv.x*f*TAU+phase)*amp;
        else if(a2<2.5) wave=asin(sin(uv.x*f*TAU+phase))*(2.0/PI)*amp;
        else if(a2<3.5) wave=sign(sin(uv.x*f*TAU+phase+offset*PI))*amp*0.8;
        else wave=(fract(uv.x*f+phase*0.25)*2.0-1.0)*amp*0.8;
        wave += (offset - 0.5) * 0.28;
        float clipThr=0.02+clip*0.38;
        float preCl=wave;
        wave=clamp(wave,-clipThr,clipThr);
        bool isClip=abs(preCl)>clipThr+0.01;
        float wy=uv.y-0.5-wave;
        float thick=0.006+amount*0.008+mid*0.01;
        float line=exp(-abs(wy)/thick)*1.8;
        float glow=exp(-abs(wy)/(thick*8.0))*0.4;
        vec3 wc=isClip?vec3(1.0,0.25,0.05):uColor;
        col+=line*wc*2.5*(1.0+pulse*0.8)+glow*uColor*0.6;
        col += uColor * pulse * 0.15;
        float rampX=uBeatPhase;
        col += smoothstep(0.008,0.0,abs(uv.x-rampX))*vec3(1.0,0.8,0.1)*0.5;
        gl_FragColor=vec4(col,1.0);
      } else {
        vec3 dry = sampleVideo(uv);
        
        // Lens bulge in Z depth + speed ramp
        vec2 center = vec2(0.5, 0.5);
        vec2 distVec = uv - center;
        float dist = length(distVec);
        float bulgeZ = (0.5 + uBassAmp * 0.5) * (amount * 0.5);
        vec2 st = center + distVec * (1.0 - bulgeZ * exp(-dist * 2.0));
        
        // Speed ramp: time jumping based on BPM
        float jump = floor(uBeatPhase * 4.0) / 4.0;
        float jitterTime = (uBeatPhase + (sin(uBeatPhase * TAU) * 0.1)) * (1.0 + amount);
        st.x += sin(jitterTime * TAU) * 0.05;
        
        vec3 wet = sampleVideo(clamp(st, 0.0, 1.0));
        
        // Lens aberration
        wet.r = sampleVideo(clamp(st + vec2(0.005 + bulgeZ*0.05, 0.0), 0.0, 1.0)).r;
        wet.b = sampleVideo(clamp(st - vec2(0.005 + bulgeZ*0.05, 0.0), 0.0, 1.0)).b;
        
        wet *= 1.0 + pulse * 0.2;
        gl_FragColor=vec4(mix(dry, wet, mix_), 1.0);
      }
    }`;
  }

  if (type === 'downsampler') {
    return `${common}
    void main(){
      vec2 uv=vUv;
      float t=uTime;
      float jitter=uP0.x;
      float crushType=uP0.y;
      float rate=uP0.z;
      float bits=uP0.w;
      float mix_=uP1.x;
      float pulse=beatPulse(8.0);
      float hats=uFFT1.z;
      float bass=uFFT0.x;

      if(uMode < 0.5){
        float pixSize = mix(52.0, 3.0, jitter + bass*0.3);
        vec2 pUv=floor(uv*pixSize)/pixSize;
        float band=step(1.0-jitter*0.45-pulse*0.2, noise(vec2(uv.y*35.0, floor(t*24.0))));
        float disp=(hash(vec2(floor(uv.y*80.0), floor(t*18.0)))-0.5)*jitter*0.4*band;
        pUv.x = fract(pUv.x + disp);
        float cellV=hash(vec2(floor(pUv.x*pixSize), floor(pUv.y*pixSize+t*5.0)));
        vec3 col=vec3(0.0);
        if(crushType<0.5){
          float bright=step(0.45,cellV)*(0.4+noise(pUv*6.0+t*0.4)*0.7);
          bright *= 1.0 + pulse * 0.6;
          col=uColor*bright;
        } else if(crushType<1.5){
          float bitsN=1.0+bits*6.0;
          float quantV=floor(cellV*bitsN)/bitsN;
          col=uColor*quantV*1.6*(1.0+pulse*0.4);
        } else {
          float gBand=step(0.8-pulse*0.2, hash(vec2(floor(uv.y*80.0),floor(t*30.0))));
          col=uColor*cellV*0.8;
          col+=vec3(1.0,0.1,0.3)*gBand*(jitter+pulse*0.8);
          col+=vec3(0.1,1.0,0.9)*step(0.95,hash(vec2(uv.y*10.0,t*5.0+hats)))*0.9;
        }
        gl_FragColor=vec4(col,1.0);
      } else {
        vec3 dry = sampleVideo(uv);
        float frameRate = max(1.0, mix(1.0, 30.0, rate));
        float quantTime = floor(t * frameRate * (1.0 + bass*1.2)) / max(1.0, frameRate * (1.0 + bass*1.2));
        float pixSize2=mix(64.0,4.0,jitter+bass*0.35);
        vec2 pUv2=floor(uv*pixSize2)/pixSize2;
        float dx=(hash(vec2(floor(uv.y*42.0), floor(quantTime*15.0)))-0.5)*jitter*0.3;
        dx += pulse * jitter * 0.08 * sign(hash(vec2(floor(uv.y*20.0),uBeat))-0.5);
        vec2 st=clamp(pUv2+vec2(dx,0.0),0.0,1.0);
        vec3 wet=sampleVideo(st);
        if(crushType<1.5){
          float bitsN2=max(1.0, 1.0 + bits*5.0 - pulse*4.0*(1.0-bits));
          wet = floor(wet * bitsN2) / bitsN2;
        } else {
          float splitAmt=jitter*0.04+pulse*jitter*0.04;
          float rC=sampleVideo(clamp(st+vec2(splitAmt,0),0.0,1.0)).r;
          float gC=sampleVideo(clamp(st+vec2(0,pulse*0.03),0.0,1.0)).g;
          float bC=sampleVideo(clamp(st-vec2(splitAmt,0),0.0,1.0)).b;
          wet=vec3(rC,gC,bC);
        }
        wet *= 1.0 + pulse*0.14;
        gl_FragColor=vec4(mix(dry, wet, mix_),1.0);
      }
    }`;
  }

  if (type === 'tapdelay') {
    return `${common}
    void main(){
      vec2 uv=vUv;
      float t=uTime;
      float typeIdx=uP0.x;
      float vel=uP0.y;
      float endP=uP0.z;
      float startP=uP0.w;
      float delayT=uP1.x;
      float feedback=uP1.y;
      float mix_=uP1.z;
      float filtPos=uP1.w;
      float pulse=beatPulse(6.0);
      float vocal=uFFT0.y + uFFT0.z;
      float hats=uFFT1.z;
      float beatInterval = 60.0 / max(1.0, uBPM);
      float tapInterval = mix(beatInterval*0.125, beatInterval*2.0, delayT);

      if(uMode < 0.5){
        vec3 col=vec3(0.0);
        int nTaps=3+int(endP*5.0);
        for(int i=0;i<8;i++){
          if(i>=nTaps) break;
          float fi=float(i);
          float xPos=fract(t/tapInterval * 0.5 + fi/float(nTaps));
          float bw=0.018+vel*0.03+fi*0.004 + hats*0.01;
          float fade=pow(max(0.0,feedback),fi);
          float band=smoothstep(bw,0.0,abs(uv.x-xPos))*(1.0+(i==0?pulse*1.5:0.0));
          vec3 tapCol=uColor;
          if(typeIdx>0.5 && typeIdx<1.5){
            float chop=step(0.5,fract(uv.y*5.0+fi*0.7+uBeatPhase*4.0));
            band*=chop;
            tapCol=mix(uColor,vec3(0.8,0.9,1.0),0.35);
          } else if(typeIdx>1.5){
            float fmask=smoothstep(filtPos-0.1,filtPos+0.1,uv.y);
            band*=fmask;
            tapCol=mix(uColor,vec3(0.3,0.5,1.0),0.4);
          }
          col += tapCol * band * fade * 2.3;
        }
        col += vec3(vocal*0.25, vocal*0.18, vocal*0.35);
        gl_FragColor=vec4(col,1.0);
      } else {
        vec3 dry = sampleVideo(uv);
        vec3 accum = dry;
        int nTaps2=2+int(endP*4.0);
        for(int i=1;i<=6;i++){
          if(i>nTaps2) break;
          float fi=float(i);
          float xOff=0.0, yOff=0.0;
          float phase = fract((uBeatPhase * (2.0 + fi)) + startP * 0.5);
          if(typeIdx<0.5){
            xOff=sin(fi*1.3+uBeat)*vel*0.05;
          } else if(typeIdx<1.5){
            if(phase>0.42 && phase<0.74){
              xOff=(mod(fi,2.0)<1.0?1.0:-1.0)*(0.02+vel*0.06);
            }
          } else {
            yOff = (filtPos - 0.5) * fi * 0.06;
          }
          vec2 st = clamp(uv + vec2(xOff, yOff), 0.0, 1.0);
          vec3 echo = sampleVideo(st);
          if(typeIdx<1.5){
            float gate = smoothstep(0.06, 0.0, abs(phase - 0.2)) + smoothstep(0.06, 0.0, abs(phase - 0.6));
            echo *= clamp(gate, 0.0, 1.0);
          } else {
            float lum = luma(echo);
            echo = mix(echo, vec3(lum) * uColor * 1.4, (1.0 - filtPos) * 0.65);
          }
          float fade=pow(max(0.0,feedback),fi) * (1.0 + (i==1?pulse*0.4:0.0));
          accum += echo * fade;
        }
        accum = clamp(accum / (1.0 + float(nTaps2) * 0.6), 0.0, 1.0);
        accum *= 1.0 + pulse * 0.18;
        gl_FragColor=vec4(mix(dry, accum, mix_),1.0);
      }
    }`;
  }

  return `${common}
  void main(){
    vec2 uv=vUv;
    float t=uTime;
    float sync=uP0.x;
    float notes=uP0.y;
    float div=uP0.z;
    float engine=uP0.w;
    float speed=uP1.x;
    float pattern=uP1.y;
    float drift=uP1.z;
    float freq=uP1.w;
    float q=uP2.x;
    float mix_=uP2.y;
    float pulse=beatPulse(5.0);
    float bass=uFFT0.x;
    float highs=uFFT1.w;
    float ts=t*(0.15+speed*1.8)*(uBPM/120.0);
    if(sync>0.5){
      float divs = 1.0 + floor(div * 7.0);
      float quantPhase = floor(uBeatPhase*divs)/divs;
      ts = (floor(t*uBPM/60.0) + quantPhase) * (0.15+speed*1.8);
    }

    if(uMode < 0.5){
      vec2 uvc=uv-0.5;
      float aspect=uResolution.x/uResolution.y;
      uvc.x*=aspect;
      float r=length(uvc);
      float a=atan(uvc.y,uvc.x);
      float numLobes=2.0+floor(engine)*1.5+pattern*2.5;
      float d1=sin(a*numLobes+ts)*(0.05+drift*0.11)*(1.0+pulse*0.25+bass*0.3);
      float d2=sin(a*(numLobes*2.0+1.0)-ts*1.4)*0.035;
      float d3=fbm(uvc*(2.5+freq*5.0)+ts*0.18)*drift*0.07;
      float blobR=(0.22+(notes-0.5)*0.1+d1+d2+d3)*(1.0+pulse*0.14);
      float blob=smoothstep(blobR+0.018,blobR-0.012,r);
      float grain=fbm(uvc*(7.0+q*18.0)+ts*0.45);
      vec3 col=uColor*(mix(0.45,1.0,grain)*blob);
      col += uColor * pulse * 0.18;
      for(int i=0;i<10;i++){
        float fi=float(i);
        float ang=TAU*(fi/10.0)+ts*(0.35+bass*0.5)*(1.0+fi*0.04);
        vec2 pp=vec2(cos(ang),sin(ang))*(blobR*1.35 + fi*0.03);
        float pd=length(uvc-pp);
        col += smoothstep(0.015,0.0,pd) * mix(uColor, vec3(1.0,1.0,0.7), fi/10.0) * (1.0 + highs*0.8);
      }
      gl_FragColor=vec4(max(col,vec3(0.0)),1.0);
    } else {
      vec3 dry = sampleVideo(uv);
      vec2 uvc2=uv-0.5;
      float a2=atan(uvc2.y,uvc2.x);
      float numLobes2=2.0+floor(engine)*1.5+pattern*2.5;
      float warpBeat = drift*0.08 + pulse*(drift*0.06+bass*0.05);
      float warpX=sin(a2*numLobes2+ts)*warpBeat+fbm(uv*(3.0+freq*4.0)+ts*0.2)*drift*0.05;
      float warpY=cos(a2*numLobes2+ts)*warpBeat*0.7;
      vec2 st=clamp(uv+vec2(warpX,warpY),0.0,1.0);
      vec3 wet=sampleVideo(st);
      float gr=fbm(uv*(8.0+q*20.0)+ts*0.5);
      wet += uColor * gr * drift * 0.18;
      vec3 prev=sampleVideo(clamp(uv+vec2(pulse*0.02,0.0),0.0,1.0));
      wet=mix(wet, prev, speed*0.25 + pulse*0.1);
      if(sync>0.5){
        float blockSize=mix(16.0,64.0,div);
        vec2 bUv=floor(uv*blockSize)/blockSize;
        vec3 blockSrc=sampleVideo(bUv);
        wet = mix(wet, blockSrc, notes*(0.25+pulse*0.25));
      }
      wet *= 1.0 + pulse*0.18;
      gl_FragColor=vec4(mix(dry, wet, mix_),1.0);
    }
  }`;
}
