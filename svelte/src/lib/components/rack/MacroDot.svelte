<script lang="ts">
  import { sliderValueForKey } from '$lib/components/controlKeyboard';
  import {
    beginRackParamTransaction,
    endRackParamTransaction,
    runRackParamTransaction
  } from '$lib/stores/rack';

  interface Props {
    value: number;
    onChange: (v: number) => void;
    color: string;
    label: string;
    title?: string;
    controlId?: string;
  }

  let { value, onChange, color, label, title = label, controlId = label }: Props = $props();

  let dragging = $state(false);
  let startY = 0;
  let startValue = 0;

  function onDown(e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).focus();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging = true;
    startY = e.clientY;
    startValue = value;
    beginRackParamTransaction();
    const target = e.currentTarget as HTMLElement;
    const move = (ev: PointerEvent) => {
      const delta = startY - ev.clientY;
      onChange(Math.max(0, Math.min(100, Math.round(startValue + delta * 0.5))));
    };
    const up = (ev: PointerEvent) => {
      dragging = false;
      target.releasePointerCapture?.(ev.pointerId);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      endRackParamTransaction();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  function onKeyDown(e: KeyboardEvent) {
    const next = sliderValueForKey(e.key, value, 0, 100);
    if (next === null) return;
    e.preventDefault();
    runRackParamTransaction(() => onChange(next));
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="macro-dot" {title}>
  <button
    type="button"
    class="macro-dot-btn"
    class:dragging
    style="--accent:{color}"
    onpointerdown={onDown}
    onkeydown={onKeyDown}
    role="slider"
    data-bsp-proof-id="control-macro-{controlId}"
    aria-label="{title} macro"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={value}
    aria-valuetext={`${Math.round(value)} percent`}
  >
    <span class="macro-dot-fill" style="height:{value}%"></span>
  </button>
  <span class="macro-dot-label">{label}</span>
</div>

<style>
  .macro-dot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
  }

  .macro-dot-btn {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--accent) 55%, #333);
    background: #0a0b0c;
    padding: 0;
    cursor: ns-resize;
    position: relative;
    overflow: hidden;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.8);
  }

  .macro-dot-btn.dragging {
    border-color: var(--accent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 45%, transparent);
  }

  .macro-dot-fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--accent) 35%, transparent),
      var(--accent)
    );
    pointer-events: none;
  }

  .macro-dot-label {
    font-size: 6px;
    font-weight: 500;
    letter-spacing: 0.08em;
    color: #4a5060;
    font-family: var(--font-ui);
    line-height: 1;
  }
</style>
