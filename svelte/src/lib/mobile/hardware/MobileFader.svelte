<script lang="ts">
  import { beginRackParamTransaction, endRackParamTransaction } from '$lib/stores/rack';

  /**
   * A fader with a cap you can actually grab.
   *
   * The phone's sliders were a tinted bar with a dot on it — legible, and
   * completely inert-looking. What makes a fader read as hardware is that the
   * *track is cut into the panel* and the *cap sits proud of it*: the track
   * carries an inset shadow, the cap carries an outer one plus a grip line.
   * Opposite shadow directions on adjacent elements is the whole illusion.
   *
   * Dragging is pointer-driven with capture, so the value keeps following the
   * finger after it leaves the track — the previous behaviour dropped the
   * gesture at the edge, which on a 375px screen is most of the useful travel.
   * `touch-action: none` is mandatory here or the browser claims the drag as a
   * page pan; the app shipped without any touch-action at all, which is exactly
   * how that bug got in.
   */
  interface Props {
    label: string;
    value: number;
    color?: string;
    /** Printed to the right of the label. Pass a formatted string. */
    display?: string;
    min?: number;
    max?: number;
    onChange: (value: number) => void;
  }

  let {
    label,
    value,
    color = '#5a6070',
    display,
    min = 0,
    max = 100,
    onChange
  }: Props = $props();

  let track = $state<HTMLDivElement>();
  let dragging = $state(false);
  /**
   * Track geometry, read once when the gesture starts.
   *
   * `getBoundingClientRect()` forces the browser to flush pending layout, and
   * this used to run on every pointermove — up to 120 of them a second on a
   * modern phone, each one a synchronous layout in the middle of a drag, while
   * the GPU is rendering the effect the drag is dialling. The track cannot
   * move or resize mid-stroke: it is inside a sheet whose transform is frozen
   * while a control is captured, and pointer capture keeps the gesture on this
   * element even when the finger leaves it. So one read per gesture is both
   * cheaper and exactly as correct.
   */
  let trackRect: { left: number; width: number } | null = null;

  /**
   * The cap travels between its own half-widths, not between the track edges.
   *
   * Positioning it at a raw 0–100% puts its centre on the track edge at the
   * extremes, so half the cap is clipped and the control looks broken exactly
   * where users check it. Reserving half a cap at each end also keeps the
   * pointer maths honest: the value under the finger has to be derived from the
   * same inset travel that is drawn, or the readout drifts from the cap.
   */
  const CAP_W = 15;

  const pct = $derived(Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)));

  function valueFromClientX(clientX: number) {
    const rect = trackRect;
    if (!rect) return value;
    const travel = rect.width - CAP_W;
    if (travel <= 0) return value;
    const t = Math.max(0, Math.min(1, (clientX - rect.left - CAP_W / 2) / travel));
    return min + t * (max - min);
  }

  function down(event: PointerEvent) {
    if (!track) return;
    event.preventDefault();
    dragging = true;
    const rect = track.getBoundingClientRect();
    trackRect = { left: rect.left, width: rect.width };
    // One undo entry for the whole gesture rather than one per pixel moved.
    beginRackParamTransaction();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    onChange(valueFromClientX(event.clientX));
    // A fader that grabs is worth confirming. 8ms is a tick, not a buzz — long
    // enough to register through a case, short enough that a fast dial does not
    // turn into a rattle. Absent on iOS Safari and on any device where the user
    // has turned haptics off, both of which are the correct outcome.
    navigator.vibrate?.(8);
  }

  function move(event: PointerEvent) {
    if (!dragging) return;
    event.preventDefault();
    onChange(valueFromClientX(event.clientX));
  }

  function up(event: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    trackRect = null;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    endRackParamTransaction();
  }

  function key(event: KeyboardEvent) {
    const step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      onChange(Math.max(min, value - step));
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      onChange(Math.min(max, value + step));
    }
  }
</script>

<div class="fader" style="--accent:{color};--pct:{pct};--cap:{CAP_W}px">
  <div class="head">
    <span class="label">{label}</span>
    <span class="fill"></span>
    {#if display}<span class="display">{display}</span>{/if}
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={track}
    class="track"
    class:is-dragging={dragging}
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={Math.round(value)}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onkeydown={key}
  >
    <span class="lit" aria-hidden="true"></span>
    <span class="cap" aria-hidden="true"></span>
  </div>
</div>

<style>
  .fader {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .fill {
    flex: 1 1 auto;
  }

  .label {
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #626c78;
    line-height: 1;
    text-shadow: 0 -1px 0 rgba(0, 0, 0, 0.7);
    white-space: nowrap;
  }

  .display {
    font-family: var(--font-mono);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--accent);
    text-shadow: 0 0 8px color-mix(in srgb, var(--accent) 40%, transparent);
    line-height: 1;
    white-space: nowrap;
  }

  /*
    The track is cut in. 28px painted is enough to grab; the ::after takes the
    hit area past 44 without the row getting taller.
  */
  .track {
    position: relative;
    height: 28px;
    border-radius: 3px;
    cursor: pointer;
    border: 1px solid #0c0d0f;
    border-bottom-color: #1a1d20;
    background: linear-gradient(180deg, #0a0c0e, #101215 70%, #0c0e10);
    box-shadow:
      inset 0 2px 5px rgba(0, 0, 0, 0.8),
      0 1px 0 rgba(255, 255, 255, 0.03);
    /* Without this the browser takes the gesture as a page pan and the fader
       only responds after the first ~10px, which feels broken. */
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
    /* Deliberately not `overflow: hidden`. The cap now travels fully inside the
       track, so nothing needs clipping — and clipping would cut off the cap's
       glow at the extremes, which is the one place it is most visible. */
  }
  .track:focus-visible {
    outline: 1px solid color-mix(in srgb, var(--accent) 60%, transparent);
    outline-offset: 2px;
  }
  .track::after {
    content: '';
    position: absolute;
    inset: -9px 0;
  }

  /* Travelled portion, lit from within. Follows the cap's inset travel so the
     fill always ends under the cap rather than running past it at the top. */
  .lit {
    position: absolute;
    inset: 1px auto 1px 1px;
    width: calc(var(--cap) / 2 + (100% - var(--cap)) * var(--pct) / 100 - 1px);
    min-width: 0;
    border-radius: 2px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--accent) 30%, transparent),
      color-mix(in srgb, var(--accent) 12%, transparent)
    );
    box-shadow: inset 0 0 10px color-mix(in srgb, var(--accent) 22%, transparent);
  }

  /* The cap sits proud: outer shadow, light top edge, and a grip line. */
  .cap {
    position: absolute;
    top: 50%;
    left: calc(var(--cap) / 2 + (100% - var(--cap)) * var(--pct) / 100);
    width: var(--cap);
    height: 22px;
    transform: translate(-50%, -50%);
    border-radius: 2px;
    border: 1px solid;
    border-color: #34393f #101214 #0c0e0f #101214;
    background: linear-gradient(180deg, #2c3137 0%, #21262b 50%, #15181b 100%);
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.75),
      inset 0 1px 0 rgba(255, 255, 255, 0.07);
    transition: box-shadow 90ms ease;
  }
  /* The grip. One line is enough at 15px wide. */
  .cap::before {
    content: '';
    position: absolute;
    inset: 4px 5px;
    border-left: 1px solid rgba(0, 0, 0, 0.55);
    border-right: 1px solid rgba(255, 255, 255, 0.06);
  }

  .track.is-dragging .cap {
    box-shadow:
      0 1px 5px rgba(0, 0, 0, 0.85),
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      0 0 11px color-mix(in srgb, var(--accent) 45%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .cap {
      transition: none;
    }
  }
</style>
