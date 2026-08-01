<script lang="ts">
  import { sliderValueForKey } from '$lib/components/controlKeyboard';
  import {
    beginRackParamTransaction,
    endRackParamTransaction,
    runRackParamTransaction
  } from '$lib/stores/rack';

  interface Props {
    label?: string;
    value: number;
    onChange: (value: number) => void;
    size?: 'xxs' | 'xs' | 'sm' | 'md' | 'lg';
    min?: number;
    max?: number;
    color?: string;
    showValue?: boolean;
    knobId?: string;
  }

  let {
    label,
    value,
    onChange,
    size = 'md',
    min = 0,
    max = 100,
    color = '#9aa0aa',
    showValue = false,
    knobId = 'k'
  }: Props = $props();

  const dim = $derived({ xxs: 24, xs: 28, sm: 36, md: 44, lg: 56 }[size]);
  const hitPad = $derived(size === 'xxs' ? 4 : size === 'xs' ? 5 : 4);
  const strokeWidth = $derived(size === 'xxs' ? 1.5 : size === 'xs' ? 2 : size === 'sm' ? 2.5 : 3);
  const r = $derived(dim / 2 - strokeWidth - 2);
  const cx = $derived(dim / 2);
  const cy = $derived(dim / 2);
  const gradId = $derived(`knobGrad-${knobId}-${size}`);
  const innerId = $derived(`knobInner-${knobId}-${size}`);

  let hovering = $state(false);
  let dragging = $state(false);
  let startY = 0;
  let startValue = 0;

  const norm = $derived((value - min) / (max - min));
  const startAngle = 225;
  const totalArc = 270;
  const currentAngle = $derived(startAngle + norm * totalArc);

  function toXY(angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  const bgStart = $derived(toXY(startAngle));
  const bgEnd = $derived(toXY(startAngle + totalArc));
  const bgPath = $derived(
    `M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 1 1 ${bgEnd.x} ${bgEnd.y}`
  );
  const actEnd = $derived(toXY(currentAngle));
  const activePath = $derived(
    norm > 0
      ? `M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 ${norm * totalArc > 180 ? 1 : 0} 1 ${actEnd.x} ${actEnd.y}`
      : ''
  );
  const indicatorPos = $derived(toXY(currentAngle));
  const showTooltip = $derived(hovering || dragging || showValue);

  function onDown(e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).focus();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging = true;
    startY = e.clientY;
    startValue = value;
    beginRackParamTransaction();
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    const target = e.currentTarget as HTMLElement;
    const onMove = (ev: PointerEvent) => {
      const delta = startY - ev.clientY;
      const sensitivity = (max - min) / 160;
      onChange(Math.max(min, Math.min(max, startValue + delta * sensitivity)));
    };
    const onUp = (ev: PointerEvent) => {
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      target.releasePointerCapture?.(ev.pointerId);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      endRackParamTransaction();
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }

  function onKeyDown(e: KeyboardEvent) {
    const next = sliderValueForKey(e.key, value, min, max, (max - min) / 100, (max - min) / 10);
    if (next === null) return;
    e.preventDefault();
    runRackParamTransaction(() => onChange(next));
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="knob-wrap"
  onmouseenter={() => (hovering = true)}
  onmouseleave={() => (hovering = false)}
>
  <div
    class="knob-hit"
    style="width:{dim + hitPad * 2}px;height:{dim + hitPad * 2}px;padding:{hitPad}px"
    onpointerdown={onDown}
    onkeydown={onKeyDown}
    ondblclick={() => runRackParamTransaction(() => onChange((max - min) / 2 + min))}
    role="slider"
    tabindex="0"
    data-bsp-proof-id="control-knob-{knobId}"
    aria-label={label ?? knobId}
    aria-valuenow={value}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuetext={`${Math.round(value)} percent`}
  >
    <svg width={dim} height={dim} style="display:block;overflow:visible">
      <circle cx={cx} cy={cy} r={dim / 2 - 1} fill="none" stroke="rgba(0,0,0,0.6)" stroke-width="1" />
      <circle cx={cx} cy={cy} r={dim / 2 - 2} fill="url(#{gradId})" stroke="#111" stroke-width="1" />
      <circle cx={cx} cy={cy} r={dim / 2 - 4} fill="url(#{innerId})" stroke="#0d0e0f" stroke-width="0.5" />
      <path d={bgPath} fill="none" stroke="#1a1c1e" stroke-width={strokeWidth} stroke-linecap="round" />
      {#if activePath}
        <path
          d={activePath}
          fill="none"
          stroke={color}
          stroke-width={strokeWidth}
          stroke-linecap="round"
          style="filter:drop-shadow(0 0 2px {color}80)"
        />
      {/if}
      <line
        x1={cx}
        y1={cy}
        x2={cx + (r - strokeWidth - 1) * Math.cos(((currentAngle - 90) * Math.PI) / 180)}
        y2={cy + (r - strokeWidth - 1) * Math.sin(((currentAngle - 90) * Math.PI) / 180)}
        stroke={dragging ? '#fff' : '#aab0ba'}
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <circle
        cx={indicatorPos.x}
        cy={indicatorPos.y}
        r="1.5"
        fill={dragging ? '#fff' : color}
        style={dragging ? `filter:drop-shadow(0 0 3px ${color})` : undefined}
      />
      <ellipse
        cx={cx - dim * 0.07}
        cy={cy - dim * 0.12}
        rx={dim * 0.18}
        ry={dim * 0.1}
        fill="rgba(255,255,255,0.05)"
      />
      <defs>
        <radialGradient id={gradId} cx="35%" cy="30%">
          <stop offset="0%" stop-color="#2a2d32" />
          <stop offset="60%" stop-color="#1c1e21" />
          <stop offset="100%" stop-color="#131517" />
        </radialGradient>
        <radialGradient id={innerId} cx="35%" cy="30%">
          <stop offset="0%" stop-color="#252830" />
          <stop offset="100%" stop-color="#161819" />
        </radialGradient>
      </defs>
    </svg>
    {#if showTooltip}
      <div class="knob-tooltip">{Math.round(value)}</div>
    {/if}
  </div>
  {#if label}
    <span class="knob-label">{label}</span>
  {/if}
</div>

<style>
  .knob-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    user-select: none;
    flex-shrink: 0;
  }

  .knob-hit {
    cursor: ns-resize;
    position: relative;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .knob-tooltip {
    position: absolute;
    top: -16px;
    left: 50%;
    transform: translateX(-50%);
    background: #000;
    border: 1px solid #333;
    color: #ccc;
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 2px;
    font-family: var(--font-mono);
    white-space: nowrap;
    pointer-events: none;
    z-index: 100;
  }

  .knob-label {
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #4a5058;
    font-family: var(--font-ui);
    line-height: 1;
  }
</style>
