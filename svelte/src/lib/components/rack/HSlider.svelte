<script lang="ts">
  interface Props {
    value: number;
    onChange: (v: number) => void;
    color: string;
    label?: string;
  }
  let { value, onChange, color, label }: Props = $props();
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

<div>
  {#if label}
    <div
      style="font-size:7px;font-weight:700;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.1em;margin-bottom:2px"
    >
      {label}
    </div>
  {/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={track}
    onmousedown={onDown}
    style="height:12px;background:#0a0b0c;border:1px solid #1e2022;border-radius:1px;cursor:ew-resize;position:relative;box-shadow:inset 0 1px 3px rgba(0,0,0,0.7);overflow:hidden"
  >
    <div
      style="position:absolute;left:0;top:0;bottom:0;width:{value}%;background:linear-gradient(90deg,{color}22,{color}44);border-right:2px solid {color}"
    ></div>
    {#each [25, 50, 75] as p (p)}
      <div style="position:absolute;left:{p}%;top:2px;bottom:2px;width:1px;background:#1e2022"></div>
    {/each}
    <div
      style="position:absolute;top:1px;bottom:1px;left:calc({value}% - 4px);width:8px;background:linear-gradient(180deg,#2e3238,#1c1e22);border:1px solid {drag ? color : '#333840'};border-radius:1px;box-shadow:0 1px 3px rgba(0,0,0,0.5)"
    ></div>
  </div>
</div>
