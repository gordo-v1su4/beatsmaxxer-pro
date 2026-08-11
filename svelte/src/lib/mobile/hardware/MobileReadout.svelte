<script lang="ts">
  /**
   * A recessed display, not a number in a box.
   *
   * `MiniDisplay.svelte` on the rack gets its character from one thing: an
   * `inset 0 2px 4px rgba(0,0,0,0.7)` over a near-black face, so the readout
   * looks cut into the panel and lit from behind. The phone was printing plain
   * text on the same surface as everything else, which is why numbers there read
   * as a web label rather than as an instrument telling you something.
   *
   * The scanline overlay is a single repeating-gradient — cheap, and it does
   * more for the "this is a screen" read than any amount of font choice.
   */
  interface Props {
    value: string;
    /** Small caps printed on the panel above the glass. */
    label?: string;
    color?: string;
    /** Dim the glass when the value is not live. */
    idle?: boolean;
    align?: 'left' | 'center' | 'right';
    grow?: boolean;
  }

  let {
    value,
    label,
    color = '#7fe3d4',
    idle = false,
    align = 'center',
    grow = false
  }: Props = $props();
</script>

<div class="readout" class:is-grow={grow} style="--accent:{color}">
  {#if label}<span class="readout-label">{label}</span>{/if}
  <div class="glass" class:is-idle={idle} style="text-align:{align}">
    <span class="value">{value}</span>
    <span class="scan" aria-hidden="true"></span>
  </div>
</div>

<style>
  .readout {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 0 0 auto;
    min-width: 0;
  }
  .readout.is-grow {
    flex: 1 1 auto;
  }

  .readout-label {
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #3a4048;
    line-height: 1;
  }

  .glass {
    position: relative;
    overflow: hidden;
    padding: 5px 8px;
    border: 1px solid #0c0d0f;
    border-top-color: #101214;
    border-radius: 2px;
    /* Cut into the face and lit from behind. */
    background: linear-gradient(180deg, #06080a, #0a0d0f 60%, #070909);
    box-shadow:
      inset 0 2px 5px rgba(0, 0, 0, 0.8),
      inset 0 0 12px color-mix(in srgb, var(--accent) 7%, transparent),
      0 1px 0 rgba(255, 255, 255, 0.03);
  }

  .value {
    position: relative;
    z-index: 1;
    display: block;
    font-family: var(--font-mono);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.06em;
    line-height: 1.15;
    color: var(--accent);
    text-shadow: 0 0 10px color-mix(in srgb, var(--accent) 42%, transparent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .glass.is-idle .value {
    color: #39424c;
    text-shadow: none;
  }

  /* One gradient, and the panel stops looking like a div. */
  .scan {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    background: repeating-linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.035) 0px,
      rgba(255, 255, 255, 0.035) 1px,
      transparent 1px,
      transparent 3px
    );
    mix-blend-mode: overlay;
  }
</style>
