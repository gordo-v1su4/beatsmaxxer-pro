<script lang="ts">
  interface Props {
    value: number;
    onChange: (v: number) => void;
    color: string;
    label: string;
    title?: string;
  }

  let { value, onChange, color, label, title = label }: Props = $props();

  let dragging = $state(false);
  let startY = 0;
  let startValue = 0;

  function onDown(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    startY = e.clientY;
    startValue = value;
    const move = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      onChange(Math.max(0, Math.min(100, Math.round(startValue + delta * 0.5))));
    };
    const up = () => {
      dragging = false;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="macro-dot" {title}>
  <button
    type="button"
    class="macro-dot-btn"
    class:dragging
    style="--accent:{color}"
    onmousedown={onDown}
    aria-label="{label} macro {value}"
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
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #4a5060;
    font-family: var(--font-ui);
    line-height: 1;
  }
</style>
