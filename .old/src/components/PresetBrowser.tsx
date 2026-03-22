import { useState, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Save } from 'lucide-react';

interface PresetBrowserProps {
  presets: string[];
  selectedPreset: string;
  onSelectPreset: (preset: string) => void;
  macros: {
    macro1: number;
    macro2: number;
    macro3: number;
    macro4: number;
  };
  onUpdateMacro: (macro: 'macro1' | 'macro2' | 'macro3' | 'macro4', value: number) => void;
}

const MACRO_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6'] as const;
const MACRO_KEYS = ['macro1', 'macro2', 'macro3', 'macro4'] as const;

export function PresetBrowser({
  presets,
  selectedPreset,
  onSelectPreset,
  macros,
  onUpdateMacro,
}: PresetBrowserProps) {
  const [activeTag, setActiveTag] = useState<'#factory' | '#user'>('#factory');
  const currentIndex = presets.indexOf(selectedPreset);

  const goPrev = () => {
    const i = currentIndex > 0 ? currentIndex - 1 : presets.length - 1;
    onSelectPreset(presets[i]);
  };
  const goNext = () => {
    const i = currentIndex < presets.length - 1 ? currentIndex + 1 : 0;
    onSelectPreset(presets[i]);
  };

  return (
    <div style={{
      width: 220,
      flexShrink: 0,
      background: '#111214',
      borderRight: '1px solid #0d0e0f',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Preset Selector */}
      <div style={{
        background: 'linear-gradient(180deg, #1a1c1e 0%, #141618 100%)',
        borderBottom: '1px solid #0d0e0f',
        padding: '4px 6px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Save indicator */}
          <div style={{
            width: 20, height: 20,
            background: 'linear-gradient(180deg, #1e2022 0%, #161819 100%)',
            border: '1px solid #252729',
            borderTop: '1px solid #2e3135',
            borderRadius: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
          }}>
            <Save size={9} color="#454a52" />
          </div>

          {/* Preset name display */}
          <div style={{
            flex: 1,
            height: 20,
            background: '#0a0b0c',
            border: '1px solid #1a1c1e',
            borderTop: '1px solid #111',
            borderRadius: 2,
            display: 'flex', alignItems: 'center', paddingLeft: 6,
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6)',
          }}>
            <span style={{
              fontFamily: 'Share Tech Mono, monospace',
              fontSize: 10,
              color: '#8a9098',
              letterSpacing: '0.04em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {selectedPreset}*
            </span>
          </div>

          {/* Prev / Next */}
          <NavBtn onClick={goPrev}><ChevronLeft size={10} /></NavBtn>
          <NavBtn onClick={goNext}><ChevronRight size={10} /></NavBtn>
        </div>
      </div>

      {/* Tag filter */}
      <div style={{
        display: 'flex',
        gap: 12,
        padding: '5px 10px',
        borderBottom: '1px solid #0d0e0f',
        background: '#111214',
        flexShrink: 0,
      }}>
        {(['#factory', '#user'] as const).map(tag => (
          <button
            key={tag}
            onClick={() => setActiveTag(tag)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: activeTag === tag ? '#7a8090' : '#2e3240',
              borderBottom: `1px solid ${activeTag === tag ? '#3a4050' : 'transparent'}`,
              paddingBottom: 1,
              transition: 'color 0.1s ease',
            }}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div style={{ height: 8, background: '#111214', flexShrink: 0 }} />

      {/* Preset List */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 4 }}>
        {presets.map(preset => (
          <PresetItem
            key={preset}
            name={preset}
            selected={preset === selectedPreset}
            onClick={() => onSelectPreset(preset)}
          />
        ))}
      </div>

      {/* Macro controls */}
      <div style={{
        borderTop: '2px solid #0d0e0f',
        background: '#101214',
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flexShrink: 0,
      }}>
        {MACRO_KEYS.map((key, idx) => (
          <MacroControl
            key={key}
            index={idx + 1}
            color={MACRO_COLORS[idx]}
            value={macros[key]}
            onChange={v => onUpdateMacro(key, v)}
          />
        ))}
      </div>

      {/* Logo area */}
      <div style={{
        height: 32,
        borderTop: '1px solid #0d0e0f',
        background: 'linear-gradient(180deg, #0d0e10 0%, #0a0b0c 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <span style={{
          fontFamily: 'Orbitron, sans-serif',
          fontSize: 9,
          fontWeight: 900,
          letterSpacing: '0.2em',
          color: '#1e2228',
          textTransform: 'uppercase',
        }}>
          CHE e590
        </span>
      </div>
    </div>
  );
}

function PresetItem({ name, selected, onClick }: {
  name: string; selected: boolean; onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '3px 12px 3px 10px',
        cursor: 'pointer',
        borderLeft: `2px solid ${selected ? '#5a6070' : hov ? '#2e3440' : 'transparent'}`,
        background: selected
          ? 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, transparent 100%)'
          : hov
          ? 'rgba(255,255,255,0.015)'
          : 'transparent',
        transition: 'all 0.08s ease',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <span style={{
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: 12,
        fontWeight: selected ? 600 : 500,
        color: selected ? '#b8bdc6' : hov ? '#6a7080' : '#3e4450',
        letterSpacing: '0.02em',
        transition: 'color 0.08s ease',
      }}>
        {name}
      </span>
    </div>
  );
}

function NavBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 20, height: 20,
        background: hov
          ? 'linear-gradient(180deg, #252729 0%, #1c1e20 100%)'
          : 'linear-gradient(180deg, #1e2022 0%, #161819 100%)',
        border: '1px solid #0d0e0f',
        borderTop: '1px solid #252729',
        borderRadius: 2,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: hov ? '#9aa0aa' : '#454a52',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)',
        transition: 'all 0.08s ease',
      }}
    >
      {children}
    </button>
  );
}

function MacroControl({ index, color, value, onChange }: {
  index: number; color: string; value: number; onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);

  const update = useCallback((clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    onChange(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  }, [onChange]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDrag(true);
    update(e.clientX);
    const move = (ev: MouseEvent) => update(ev.clientX);
    const up = () => {
      setDrag(false);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Vertical macro label */}
          <div style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: 7,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color,
            opacity: 0.6,
            width: 10,
          }}>
            M{index}
          </div>
          <span style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: 11,
            fontWeight: 600,
            color: '#5a6070',
            letterSpacing: '0.04em',
          }}>
            Macro{index}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <button style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#2e3440', padding: 2, display: 'flex', alignItems: 'center',
          }}>
            <Pencil size={9} />
          </button>
          <button style={{
            padding: '1px 5px',
            background: 'linear-gradient(180deg, #1a1c1e 0%, #131518 100%)',
            border: '1px solid #1e2228',
            borderTop: '1px solid #252a30',
            borderRadius: 2,
            cursor: 'pointer',
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: '0.06em',
            color: '#3a4050',
            textTransform: 'uppercase' as const,
          }}>
            EDIT
          </button>
        </div>
      </div>

      {/* Fader row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 8, color: '#2a3040', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, width: 14, textAlign: 'right' }}>LO</span>
        {/* Track */}
        <div
          ref={trackRef}
          onMouseDown={onMouseDown}
          style={{
            flex: 1,
            height: 18,
            background: '#0a0b0c',
            border: '1px solid #1a1c1e',
            borderRadius: 1,
            cursor: 'ew-resize',
            position: 'relative',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.7)',
            overflow: 'hidden',
          }}
        >
          {/* Track fill */}
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${value}%`,
            background: `linear-gradient(90deg, ${color}18, ${color}30)`,
          }} />
          {/* Center line */}
          <div style={{
            position: 'absolute', left: 2, right: 2, top: '50%',
            height: 1, background: '#1a1c1e', transform: 'translateY(-50%)',
          }} />
          {/* Tick marks */}
          {[0, 25, 50, 75, 100].map(p => (
            <div key={p} style={{
              position: 'absolute', left: `${p}%`, top: 4, bottom: 4,
              width: 1, background: '#1e2228',
            }} />
          ))}
          {/* Thumb */}
          <div style={{
            position: 'absolute',
            left: `calc(${value}% - 5px)`,
            top: 2, bottom: 2,
            width: 10,
            background: 'linear-gradient(180deg, #2e3238 0%, #1c1e22 50%, #252830 100%)',
            border: `1px solid ${drag ? color + '88' : '#2e3440'}`,
            borderRadius: 1,
            boxShadow: drag
              ? `0 0 6px ${color}44, 0 1px 3px rgba(0,0,0,0.6)`
              : '0 1px 3px rgba(0,0,0,0.5)',
            transition: drag ? 'none' : 'left 0.06s ease-out',
          }}>
            {/* Thumb grip lines */}
            <div style={{ position: 'absolute', top: 3, bottom: 3, left: '50%', transform: 'translateX(-2px)', display: 'flex', gap: 1 }}>
              <div style={{ width: 1, height: '100%', background: '#3a4050' }} />
              <div style={{ width: 1, height: '100%', background: '#1e2228' }} />
            </div>
          </div>
          {/* Value tooltip */}
          {drag && (
            <div style={{
              position: 'absolute', top: -16, left: `${value}%`, transform: 'translateX(-50%)',
              background: '#000', border: '1px solid #2a2d35', color: '#8a9098',
              fontSize: 8, fontFamily: 'Share Tech Mono, monospace',
              padding: '1px 3px', borderRadius: 2, whiteSpace: 'nowrap', zIndex: 50,
            }}>
              {Math.round(value)}
            </div>
          )}
        </div>
        <span style={{ fontSize: 8, color: '#2a3040', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, width: 14 }}>HI</span>
      </div>
    </div>
  );
}
