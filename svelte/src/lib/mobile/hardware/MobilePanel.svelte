<script lang="ts">
  /**
   * A faceplate with a label engraved on it.
   *
   * `Section.svelte` and the rack module header do this with a three-stop
   * vertical gradient (`#1e2124 → #181a1c 55% → #141618`) plus a light top
   * border and a dark seam beneath. Two borders and a gradient is the entire
   * trick, and it is the difference between a panel and a `<div>`.
   *
   * Screws are optional and off by default. On the rack they read as structure
   * because there are ten modules of them; on a 375px phone, four screws per
   * section is clutter — they belong on the outermost surfaces only.
   */
  interface Props {
    label?: string;
    color?: string;
    /** Corner screws. Reserve for the outer shell, not every subsection. */
    screws?: boolean;
    /** Removes the bottom seam for the last panel in a stack. */
    last?: boolean;
    children?: import('svelte').Snippet;
    /** Optional right-aligned content in the label rail. */
    trailing?: import('svelte').Snippet;
  }

  let {
    label,
    color = '#5a6070',
    screws = false,
    last = false,
    children,
    trailing
  }: Props = $props();
</script>

<section class="panel" class:is-last={last} style="--accent:{color}">
  {#if screws}
    <span class="screw screw-tl" aria-hidden="true"></span>
    <span class="screw screw-tr" aria-hidden="true"></span>
  {/if}

  {#if label || trailing}
    <header class="rail">
      {#if label}
        <span class="tick" aria-hidden="true"></span>
        <span class="engraved">{label}</span>
      {/if}
      <span class="rail-fill"></span>
      {#if trailing}{@render trailing()}{/if}
    </header>
  {/if}

  <div class="body">
    {#if children}{@render children()}{/if}
  </div>
</section>

<style>
  .panel {
    position: relative;
    /* The machined face. Three stops, not two — the mid stop at 55% is what
       gives it a rolled edge instead of a flat ramp. */
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.012) 1px, transparent 1px) 0 0 / 48px 100%,
      linear-gradient(180deg, #1c1f23 0%, #17191c 55%, #131518 100%);
    border-top: 1px solid #2a2e33;
    border-bottom: 2px solid #0b0c0d;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
    padding: 9px 11px 11px;
  }

  .panel.is-last {
    border-bottom: none;
  }

  .rail {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    min-width: 0;
  }

  .rail-fill {
    flex: 1 1 auto;
  }

  /* A lit notch in the module's own colour — the cheapest possible way to say
     which module you are inside without printing its name again. */
  .tick {
    width: 3px;
    height: 10px;
    flex: 0 0 auto;
    border-radius: 1px;
    background: var(--accent);
    box-shadow: 0 0 7px color-mix(in srgb, var(--accent) 55%, transparent);
  }

  .engraved {
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #5c6672;
    line-height: 1;
    /* Cut in rather than printed on: a dark top shadow and a light bottom edge
       is the standard engraving pair, and it survives at 11px. */
    text-shadow:
      0 -1px 0 rgba(0, 0, 0, 0.75),
      0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .body {
    min-width: 0;
  }

  .screw {
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: radial-gradient(circle at 38% 35%, #2e3135, #131517);
    border: 1px solid #0d0e0f;
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.8),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }
  /* The slot. One gradient stripe reads as a cross head at this size. */
  .screw::before {
    content: '';
    position: absolute;
    inset: 15% 15% auto;
    top: 50%;
    height: 1px;
    background: rgba(0, 0, 0, 0.6);
    transform: translateY(-50%);
  }
  .screw-tl {
    top: 7px;
    left: 7px;
  }
  .screw-tr {
    top: 7px;
    right: 7px;
  }
</style>
