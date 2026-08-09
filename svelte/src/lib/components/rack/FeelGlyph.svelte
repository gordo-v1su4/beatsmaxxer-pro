<script lang="ts">
  /**
   * A 22x10 diagram of one STUTTER grid.
   *
   * STR8 / SWNG / DOT name the rhythm but do not show it, and the difference
   * between them is entirely a matter of where the hits land in time — which is
   * exactly the thing a picture can carry and a four-letter label cannot. Each
   * glyph plots one bar of the grid: tick marks on the beat, blocks where the
   * retrigger fires, so uneven spacing is visible at a glance.
   */
  interface Props {
    kind: string;
    color: string;
    dim: boolean;
  }
  let { kind, color, dim }: Props = $props();

  // Matches SPEEDRAMP's inactive curve stroke so every diagram in the rack sits
  // at the same weight before selection.
  const ink = $derived(dim ? '#5a6270' : color);

  // x positions of the hits, in a 0-20 bar. Straight is even; swing pushes the
  // off-beat late; dotted stretches each step to 1.5x so hits drift across.
  const HITS: Record<string, number[]> = {
    STR8: [0, 5, 10, 15],
    SWNG: [0, 6.7, 10, 16.7],
    DOT: [0, 7.5, 15]
  };
</script>

<svg viewBox="0 0 22 10" width="22" height="10" aria-hidden="true" style="display:block">
  <!-- the bar line -->
  <line x1="0.5" y1="8.5" x2="21.5" y2="8.5" stroke={ink} stroke-width="0.6" opacity="0.45" />
  <!-- quarter-note ticks, always even, so the hits above read against a fixed grid -->
  {#each [0, 5, 10, 15, 20] as t (t)}
    <line
      x1={t + 0.8}
      y1="7.2"
      x2={t + 0.8}
      y2="8.5"
      stroke={ink}
      stroke-width="0.5"
      opacity="0.3"
    />
  {/each}
  {#each HITS[kind] ?? [] as h (h)}
    <rect x={h + 0.3} y="1.6" width="1.8" height="5.2" fill={ink} rx="0.3" />
  {/each}
</svg>
