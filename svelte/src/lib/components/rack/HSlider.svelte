<script lang="ts">
  interface Props {
    value: number;
    onChange: (v: number) => void;
    color: string;
    label?: string;
    compact?: boolean;
  }
  let { value, onChange, color, label, compact = false }: Props = $props();
  let track: HTMLDivElement;
  let drag = $state(false);

  function update(cx: number) {
    if (!track) return;
    const rect = track.getBoundingClientRect();
    onChange(Math.max(0, Math.min(100, ((cx - rect.left) / rect.width) * 100)));
  }

  function onDown(e: MouseEvent) {
    e.preventDefault();
    drag = true;
    update(e.clientX);
    const move = (ev: MouseEvent) => update(ev.clientX);
    const up = () => {
      drag = false;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }
</script>

<div class="hslider" class:compact>
  {#if label}
    <div class="hslider-label">{label}</div>
  {/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="hslider-hit" bind:this={track} onmousedown={onDown} style="--accent:{color}">
    <div class="hslider-track">
      <div class="hslider-fill" style="width:{value}%"></div>
      {#each [25, 50, 75] as p (p)}
        <div class="hslider-tick" style="left:{p}%"></div>
      {/each}
    </div>
    <div
      class="hslider-thumb"
      class:dragging={drag}
      style="left:calc({value}% - 2.5px)"
    ></div>
  </div>
</div>

<style>
  .hslider-label {
    font-size: 7px;
    font-weight: 700;
    color: #3a4050;
    font-family: var(--font-ui);
    letter-spacing: 0.1em;
    margin-bottom: 2px;
  }

  .hslider-hit {
    position: relative;
    height: 14px;
    display: flex;
    align-items: center;
    cursor: ew-resize;
  }

  .hslider.compact .hslider-hit {
    height: 12px;
  }

  .hslider-track {
    position: relative;
    width: 100%;
    height: 3px;
    background: #141618;
    border: 1px solid #1e2022;
    border-radius: 0;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.65);
    overflow: visible;
  }

  .hslider-fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 18%, transparent), color-mix(in srgb, var(--accent) 38%, transparent));
    border-right: 1px solid var(--accent);
    pointer-events: none;
  }

  .hslider-tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: #25282c;
    pointer-events: none;
  }

  .hslider-thumb {
    position: absolute;
    top: 50%;
    width: 5px;
    height: 11px;
    margin-top: -5.5px;
    background: linear-gradient(180deg, #2a2e34, #181a1e);
    border: 1px solid #333840;
    border-radius: 1px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
    pointer-events: none;
  }

  .hslider-thumb.dragging {
    border-color: var(--accent);
    box-shadow: 0 0 4px color-mix(in srgb, var(--accent) 40%, transparent);
  }
</style>
