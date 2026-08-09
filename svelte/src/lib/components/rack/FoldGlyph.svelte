<script lang="ts">
  /**
   * A 14x10 diagram of one INCEPTION fold.
   *
   * The twelve folds were labelled MIR L / SLB V / COR A / TUNL, which name the
   * mechanism but show nothing — there is no way to tell a slab from a corner
   * fold without trying both. Each glyph draws the same lopsided subject (a
   * pillar left of centre) under that fold, so the difference between them is
   * visible before the button is pressed.
   *
   * Solid marks are the kept original; hollow marks are what the fold produces.
   * The dashed line is the fold plane itself.
   */
  interface Props {
    kind: string;
    color: string;
    dim: boolean;
  }
  let { kind, color, dim }: Props = $props();

  const stroke = $derived(dim ? '#3a4050' : color);
</script>

<svg viewBox="0 0 14 10" width="14" height="10" aria-hidden="true" style="display:block">
  <g fill="none" stroke={stroke} stroke-width="0.9" stroke-linecap="square">
    {#if kind === 'MIR L'}
      <line x1="7" y1="0.5" x2="7" y2="9.5" stroke-dasharray="1 1" opacity="0.55" />
      <path d="M3 8.5 V3" />
      <path d="M11 8.5 V3" opacity="0.4" />
    {:else if kind === 'MIR R'}
      <line x1="7" y1="0.5" x2="7" y2="9.5" stroke-dasharray="1 1" opacity="0.55" />
      <path d="M11 8.5 V3" />
      <path d="M3 8.5 V3" opacity="0.4" />
    {:else if kind === 'MIR D'}
      <line x1="0.5" y1="5" x2="13.5" y2="5" stroke-dasharray="1 1" opacity="0.55" />
      <path d="M2 4.2 H9" />
      <path d="M2 5.8 H9" opacity="0.4" />
    {:else if kind === 'MIR U'}
      <line x1="0.5" y1="5" x2="13.5" y2="5" stroke-dasharray="1 1" opacity="0.55" />
      <path d="M2 5.8 H9" />
      <path d="M2 4.2 H9" opacity="0.4" />
    {:else if kind === 'QUAD'}
      <line x1="7" y1="0.5" x2="7" y2="9.5" stroke-dasharray="1 1" opacity="0.55" />
      <line x1="0.5" y1="5" x2="13.5" y2="5" stroke-dasharray="1 1" opacity="0.55" />
      <path d="M4 4 V2" />
      <path d="M10 4 V2" opacity="0.4" />
      <path d="M4 6 V8" opacity="0.4" />
      <path d="M10 6 V8" opacity="0.4" />
    {:else if kind === 'SLB V'}
      <path d="M2 1 V9" />
      <path d="M5.6 1 V9" opacity="0.55" />
      <path d="M9.2 1 V9" opacity="0.4" />
      <path d="M12.8 1 V9" opacity="0.28" />
    {:else if kind === 'SLB H'}
      <path d="M1 1.6 H13" />
      <path d="M1 4 H13" opacity="0.55" />
      <path d="M1 6.4 H13" opacity="0.4" />
      <path d="M1 8.8 H13" opacity="0.28" />
    {:else if kind === 'BOX'}
      <rect x="1" y="1" width="12" height="8" />
      <rect x="3.4" y="2.6" width="7.2" height="4.8" opacity="0.55" />
      <rect x="5.6" y="4" width="2.8" height="2" opacity="0.35" />
    {:else if kind === 'COR A'}
      <line x1="1" y1="9" x2="13" y2="1" stroke-dasharray="1 1" opacity="0.55" />
      <path d="M3 7.6 V4.6" />
      <path d="M8.6 5.4 H11.6" opacity="0.4" />
    {:else if kind === 'COR B'}
      <line x1="1" y1="1" x2="13" y2="9" stroke-dasharray="1 1" opacity="0.55" />
      <path d="M3 2.4 V5.4" />
      <path d="M8.6 4.6 H11.6" opacity="0.4" />
    {:else if kind === 'TUNL'}
      <rect x="1" y="1" width="12" height="8" />
      <rect x="3.8" y="2.9" width="6.4" height="4.2" opacity="0.5" />
      <rect x="5.9" y="4.3" width="2.2" height="1.4" opacity="0.32" />
      <path d="M1 1 L5.9 4.3 M13 1 L8.1 4.3 M1 9 L5.9 5.7 M13 9 L8.1 5.7" opacity="0.3" />
    {:else if kind === 'SPIN'}
      <line x1="2.4" y1="8.4" x2="11.6" y2="1.6" stroke-dasharray="1 1" opacity="0.55" />
      <path d="M4.6 4.2 L7.4 6.2" />
      <path d="M2 2.6 A 5 5 0 0 1 7 1.4" opacity="0.6" />
      <path d="M6.2 0.6 L7.6 1.5 L6.3 2.4" opacity="0.6" />
    {/if}
  </g>
</svg>
