<script lang="ts">
  /**
   * A key on the panel, not a rectangle with a word in it.
   *
   * The rack's buttons read as hardware because of three things the phone's
   * flat chips were missing, all of them in `RackBtn.svelte`:
   *
   *  1. An *asymmetric* border — a lighter top edge and darker sides and
   *     bottom. That single asymmetry is what says "milled from a face" rather
   *     than "div with a stroke".
   *  2. An inset shadow at rest, deepening when active, so the key sits *in*
   *     the panel and presses further in. Flat chips light up instead, which
   *     reads as a web toggle.
   *  3. The accent colour arriving as a low-alpha wash plus a small outer glow,
   *     never as a fill. Hardware is lit, not painted.
   *
   * Sized for a thumb rather than a mouse: the rack's key is 16px tall, which is
   * a pointer target. This paints ~34px and expands its hit area past 44 with a
   * transparent ::after, so the box stays tight while the target stays honest.
   */
  interface Props {
    label: string;
    active?: boolean;
    color?: string;
    /** Fills its grid/flex track when true, otherwise sizes to content. */
    grow?: boolean;
    disabled?: boolean;
    title?: string;
    onclick?: () => void;
  }

  let {
    label,
    active = false,
    color = '#5a6070',
    grow = true,
    disabled = false,
    title,
    onclick
  }: Props = $props();
</script>

<button
  type="button"
  class="key"
  class:is-active={active}
  class:is-grow={grow}
  style="--accent:{color}"
  aria-pressed={active}
  {disabled}
  {title}
  onclick={() => onclick?.()}
>
  <span class="key-label">{label}</span>
</button>

<style>
  .key {
    position: relative;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 34px;
    min-width: 44px;
    padding: 0 10px;
    border-radius: 2px;
    cursor: pointer;
    /* The machined face: light at the top, shadowed down the sides. */
    border: 1px solid;
    border-color: #26292d #16181a #131416 #16181a;
    background: linear-gradient(180deg, #202429 0%, #191c20 52%, #141619 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.045),
      inset 0 -2px 3px rgba(0, 0, 0, 0.5),
      0 1px 0 rgba(0, 0, 0, 0.55);
    color: #4d5561;
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
    transition:
      color 90ms ease,
      border-color 90ms ease,
      box-shadow 90ms ease,
      background 90ms ease;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .key.is-grow {
    flex: 1 1 auto;
  }

  /*
    The tap target, not the paint. 34px is comfortable to look at and too small
    to hit reliably; this reaches past 44 in both axes without the key growing.
  */
  .key::after {
    content: '';
    position: absolute;
    inset: -6px -2px;
  }

  .key.is-active {
    border-color: color-mix(in srgb, var(--accent) 34%, #26292d)
      color-mix(in srgb, var(--accent) 20%, #16181a)
      color-mix(in srgb, var(--accent) 16%, #131416)
      color-mix(in srgb, var(--accent) 20%, #16181a);
    /* A wash and a glow. Never a fill — a filled key looks like a web button. */
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--accent) 16%, #202429),
        color-mix(in srgb, var(--accent) 7%, #141619)
      );
    box-shadow:
      inset 0 2px 5px rgba(0, 0, 0, 0.62),
      inset 0 0 10px color-mix(in srgb, var(--accent) 14%, transparent),
      0 0 8px color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--accent);
    text-shadow: 0 0 9px color-mix(in srgb, var(--accent) 45%, transparent);
  }

  /* Pressed goes further in, and the label sinks a hair with it. */
  .key:active:not(:disabled) {
    box-shadow:
      inset 0 3px 6px rgba(0, 0, 0, 0.7),
      inset 0 0 8px color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .key:active:not(:disabled) .key-label {
    transform: translateY(0.5px);
  }

  .key:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .key-label {
    line-height: 1;
    transition: transform 60ms ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .key,
    .key-label {
      transition: none;
    }
  }
</style>
