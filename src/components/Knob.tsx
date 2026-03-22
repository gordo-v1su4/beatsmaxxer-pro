import { useRef, useCallback, useState } from 'react';

interface KnobProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  min?: number;
  max?: number;
  color?: string;
  showValue?: boolean;
}

export function Knob({
  label,
  value,
  onChange,
  size = 'md',
  min = 0,
  max = 100,
  color = '#9aa0aa',
  showValue = false,
}: KnobProps) {
  const startYRef = useRef(0);
  const startValueRef = useRef(value);
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);

  const dim = { xs: 28, sm: 36, md: 44, lg: 56 }[size];
  const strokeWidth = size === 'xs' ? 2 : size === 'sm' ? 2.5 : 3;
  const r = (dim / 2) - strokeWidth - 2;
  const cx = dim / 2;
  const cy = dim / 2;

  const norm = (value - min) / (max - min);
  // Arc from 225deg to 315deg (270deg total) - going clockwise
  const startAngle = 225;
  const totalArc = 270;
  const currentAngle = startAngle + norm * totalArc;

  // Convert angle to radians and get x,y
  const toXY = (angleDeg: number) => {
    const rad = (angleDeg - 90) * (Math.PI / 180);
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  };

  // Background arc path (full 270deg)
  const startRad = (startAngle - 90) * (Math.PI / 180);
  const endRad = (startAngle + totalArc - 90) * (Math.PI / 180);
  const bgStart = { x: cx + r * Math.cos(startRad), y: cy + r * Math.sin(startRad) };
  const bgEnd = { x: cx + r * Math.cos(endRad), y: cy + r * Math.sin(endRad) };
  const bgPath = `M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 1 1 ${bgEnd.x} ${bgEnd.y}`;

  // Active arc path
  let activePath = '';
  if (norm > 0) {
    const actEnd = toXY(currentAngle);
    const largeArc = norm * totalArc > 180 ? 1 : 0;
    activePath = `M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 ${largeArc} 1 ${actEnd.x} ${actEnd.y}`;
  }

  // Indicator dot position
  const indicatorPos = toXY(currentAngle);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    startYRef.current = e.clientY;
    startValueRef.current = value;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    const onMove = (e: MouseEvent) => {
      const delta = startYRef.current - e.clientY;
      const sensitivity = (max - min) / 200;
      const newVal = Math.max(min, Math.min(max, startValueRef.current + delta * sensitivity));
      onChange(newVal);
    };
    const onUp = () => {
      setDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [value, min, max, onChange]);

  const handleDoubleClick = useCallback(() => {
    onChange((max - min) / 2 + min);
  }, [min, max, onChange]);

  const showTooltip = hovering || dragging || showValue;

  return (
    <div
      className="flex flex-col items-center gap-0.5 select-none"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div
        style={{ width: dim, height: dim, cursor: 'ns-resize', position: 'relative', flexShrink: 0 }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        <svg width={dim} height={dim} style={{ display: 'block', overflow: 'visible' }}>
          {/* Outer ring shadow */}
          <circle
            cx={cx} cy={cy} r={dim / 2 - 1}
            fill="none"
            stroke="rgba(0,0,0,0.6)"
            strokeWidth={1}
          />
          {/* Knob body */}
          <circle
            cx={cx} cy={cy} r={dim / 2 - 2}
            fill="url(#knobGrad)"
            stroke="#111"
            strokeWidth={1}
          />
          {/* Knob inner face */}
          <circle
            cx={cx} cy={cy} r={dim / 2 - 4}
            fill="url(#knobInner)"
            stroke="#0d0e0f"
            strokeWidth={0.5}
          />
          {/* Background arc track */}
          <path
            d={bgPath}
            fill="none"
            stroke="#1a1c1e"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Active arc */}
          {norm > 0 && (
            <path
              d={activePath}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 2px ${color}80)` }}
            />
          )}
          {/* Indicator line */}
          <line
            x1={cx}
            y1={cy}
            x2={cx + (r - strokeWidth - 1) * Math.cos((currentAngle - 90) * Math.PI / 180)}
            y2={cy + (r - strokeWidth - 1) * Math.sin((currentAngle - 90) * Math.PI / 180)}
            stroke={dragging ? '#fff' : '#aab0ba'}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          {/* Indicator dot */}
          <circle
            cx={indicatorPos.x}
            cy={indicatorPos.y}
            r={1.5}
            fill={dragging ? '#fff' : color}
            style={{ filter: dragging ? `drop-shadow(0 0 3px ${color})` : undefined }}
          />
          {/* Knob sheen */}
          <ellipse
            cx={cx - dim * 0.07}
            cy={cy - dim * 0.12}
            rx={dim * 0.18}
            ry={dim * 0.1}
            fill="rgba(255,255,255,0.05)"
          />
          <defs>
            <radialGradient id="knobGrad" cx="35%" cy="30%">
              <stop offset="0%" stopColor="#2a2d32" />
              <stop offset="60%" stopColor="#1c1e21" />
              <stop offset="100%" stopColor="#131517" />
            </radialGradient>
            <radialGradient id="knobInner" cx="35%" cy="30%">
              <stop offset="0%" stopColor="#252830" />
              <stop offset="100%" stopColor="#161819" />
            </radialGradient>
          </defs>
        </svg>
        {/* Tooltip */}
        {showTooltip && (
          <div
            style={{
              position: 'absolute',
              top: -18,
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#000',
              border: '1px solid #333',
              color: '#ccc',
              fontSize: 9,
              padding: '1px 4px',
              borderRadius: 2,
              fontFamily: 'Share Tech Mono, monospace',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 100,
            }}
          >
            {Math.round(value)}
          </div>
        )}
      </div>
      {label && (
        <span
          style={{
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#4a5058',
            fontFamily: 'Rajdhani, sans-serif',
            lineHeight: 1,
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
