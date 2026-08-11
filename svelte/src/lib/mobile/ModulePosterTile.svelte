<script lang="ts">
  import { getModuleDef, type ModuleCategory } from '$lib/modules/catalog';
  import FoldGlyph from '$lib/components/rack/FoldGlyph.svelte';

  /**
   * A module, drawn rather than previewed.
   *
   * The desktop palette can afford a live preview per effect because it has one
   * GPU context already open and a pointer to hover with. The phone mounts
   * exactly one canvas — the program stage — so a browser full of live modules
   * is not on the table. The honest replacement is not a grey box with a name in
   * it: it is a diagram of what the effect does to a frame, which is the only
   * question the list is being asked.
   *
   * Every glyph is drawn in the same 28x20 space at 1.8 stroke — exactly twice
   * FoldGlyph's 14x10 at 0.9 — so INCEPTION can reuse the rack's own fold
   * diagram at 3x and land at an identical stroke weight next to the rest.
   */
  interface Props {
    moduleId: string;
    active?: boolean;
    onclick?: () => void;
  }

  let { moduleId, active = false, onclick }: Props = $props();

  const def = $derived(getModuleDef(moduleId));
  const accent = $derived(def?.accentColor ?? '#8a939f');

  const CATEGORY_LABEL: Record<ModuleCategory, string> = {
    beat: 'BEAT',
    camera: 'CAMERA',
    film: 'FILM'
  };

  /** Fixed scatter, not Math.random: the tile must redraw identically. */
  const GRAIN: [number, number, number][] = [
    [5, 6, 0.9], [9, 9.4, 0.5], [13, 5, 0.75], [17, 12.6, 0.55],
    [21, 7, 0.85], [7, 13.4, 0.4], [11, 14.6, 0.7], [19, 4.4, 0.35],
    [23, 11, 0.6], [15, 9, 0.45], [6, 10.4, 0.3], [24, 6, 0.5],
    [12, 11.4, 0.35], [20, 15, 0.45]
  ];
</script>

{#if def}
  <button
    type="button"
    class="mpt"
    class:is-active={active}
    style="--accent:{accent}"
    aria-pressed={active}
    title={def.description ? `${def.name} — ${def.description}` : def.name}
    onclick={() => onclick?.()}
  >
    <span class="mpt-glyph" aria-hidden="true">
      {#if def.id === 'mirror'}
        <!-- The rack already draws this fold; reuse it rather than invent a
             second vocabulary for the same idea. -->
        <span class="mpt-fold"><FoldGlyph kind="QUAD" color={accent} dim={false} /></span>
      {:else}
        <svg viewBox="0 0 28 20" width="42" height="30" role="presentation">
          <g
            fill="none"
            stroke={accent}
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            {#if def.id === 'transition'}
              <!-- two frames and the wipe line between them -->
              <rect x="1.5" y="3.5" width="13" height="13" opacity="0.9" />
              <rect x="13.5" y="3.5" width="13" height="13" opacity="0.32" />
              <line x1="14" y1="1.2" x2="14" y2="18.8" stroke-dasharray="2 2" opacity="0.7" />
            {:else if def.id === 'speedramp'}
              <!-- the playback-rate curve, flat then steep -->
              <line x1="1.5" y1="17" x2="26.5" y2="17" opacity="0.22" />
              <path d="M1.5 17 C 11 17, 13 3.5, 26.5 3.5" />
              <circle cx="14" cy="10.5" r="1.5" fill={accent} stroke="none" opacity="0.8" />
            {:else if def.id === 'tapdelay'}
              <!-- one frame held, echoing across the division -->
              <line x1="1.5" y1="16.5" x2="26.5" y2="16.5" opacity="0.28" />
              {#each [0, 1, 2, 3] as i (i)}
                <rect
                  x={2 + i * 6.4}
                  y="5.5"
                  width="3.6"
                  height="9"
                  rx="0.6"
                  fill={accent}
                  stroke="none"
                  opacity={1 - i * 0.24}
                />
              {/each}
            {:else if def.id === 'timesampler'}
              <!-- slices played out of order -->
              <line x1="1.5" y1="18" x2="26.5" y2="18" opacity="0.28" />
              {#each [[2, 9.5], [8.4, 3.5], [14.8, 11.5], [21.2, 6.5]] as s, i (i)}
                <rect
                  x={s[0]}
                  y={s[1]}
                  width="4.8"
                  height="6"
                  rx="0.6"
                  fill={accent}
                  stroke="none"
                  opacity={0.95 - i * 0.15}
                />
              {/each}
            {:else if def.id === 'punch'}
              <!-- concentric rings: the crash in -->
              <circle cx="14" cy="10" r="8.4" opacity="0.24" />
              <circle cx="14" cy="10" r="5.4" opacity="0.55" />
              <circle cx="14" cy="10" r="2.4" />
            {:else if def.id === 'shake'}
              <!-- the frame, twice missed -->
              <rect x="3.4" y="3.4" width="16" height="11.5" opacity="0.26" />
              <rect x="7.6" y="4.6" width="16" height="11.5" opacity="0.26" />
              <rect x="5.5" y="4" width="16" height="11.5" />
            {:else if def.id === 'orbit'}
              <!-- the slow path around the subject -->
              <ellipse cx="14" cy="10" rx="11" ry="5.4" opacity="0.45" />
              <circle cx="14" cy="10" r="1.3" fill={accent} stroke="none" opacity="0.5" />
              <circle cx="23.5" cy="7.3" r="2" fill={accent} stroke="none" />
            {:else if def.id === 'focus'}
              <!-- sharp plane, soft plane -->
              <circle cx="8.6" cy="10" r="5.2" />
              <circle cx="19.6" cy="10" r="5.2" stroke-dasharray="1.6 2.2" opacity="0.5" />
              <circle cx="19.6" cy="10" r="7.6" opacity="0.18" />
            {:else if def.id === 'anamorphic'}
              <!-- bars top and bottom, flare across the middle -->
              <rect x="1.5" y="3" width="25" height="14" opacity="0.3" />
              <rect x="1.5" y="3" width="25" height="3.2" fill={accent} stroke="none" opacity="0.75" />
              <rect x="1.5" y="13.8" width="25" height="3.2" fill={accent} stroke="none" opacity="0.75" />
              <line x1="4" y1="10" x2="24" y2="10" opacity="0.85" />
            {:else if def.id === 'grain'}
              <rect x="1.5" y="3" width="25" height="14" opacity="0.3" />
              {#each GRAIN as g, i (i)}
                <circle cx={g[0]} cy={g[1]} r="0.75" fill={accent} stroke="none" opacity={g[2]} />
              {/each}
            {:else if def.id === 'leak'}
              <!-- warmth blooming in from the gate edge -->
              <rect x="1.5" y="3" width="25" height="14" opacity="0.3" />
              <path d="M26.5 3 C 19 6.5, 19 13.5, 26.5 17" opacity="0.85" />
              <path d="M26.5 4.8 C 22.5 7.5, 22.5 12.5, 26.5 15.2" opacity="0.5" />
              <path d="M26.5 6.8 C 24.8 8.4, 24.8 11.6, 26.5 13.2" opacity="0.28" />
            {:else if def.id === 'dutch'}
              <!-- horizon off level, against the level it left -->
              <line x1="2.6" y1="10.5" x2="25.4" y2="10.5" stroke-dasharray="2 2.4" opacity="0.28" />
              <line x1="2.6" y1="14.2" x2="25.4" y2="6.8" />
              <path d="M21.6 10.5 A 8 8 0 0 0 21 8" opacity="0.5" />
            {:else if def.id === 'halation'}
              <!-- a highlight blooming past its own edge -->
              <circle cx="14" cy="10" r="2.8" fill={accent} stroke="none" />
              <circle cx="14" cy="10" r="5.4" opacity="0.42" />
              <circle cx="14" cy="10" r="8.2" opacity="0.18" />
              <line x1="1.6" y1="10" x2="4" y2="10" opacity="0.35" />
              <line x1="24" y1="10" x2="26.4" y2="10" opacity="0.35" />
            {:else if def.id === 'bulge'}
              <!-- straight edges, bowed -->
              <path d="M6 3.6 C 3 8, 3 12, 6 16.4" />
              <path d="M22 3.6 C 25 8, 25 12, 22 16.4" />
              <path d="M6 3.6 C 11 1.4, 17 1.4, 22 3.6" opacity="0.55" />
              <path d="M6 16.4 C 11 18.6, 17 18.6, 22 16.4" opacity="0.55" />
            {:else if def.id === 'vhs'}
              <!-- scanlines, one of them torn off tracking -->
              <rect x="1.5" y="3" width="25" height="14" opacity="0.26" />
              <line x1="3.6" y1="6.2" x2="24.4" y2="6.2" opacity="0.75" />
              <line x1="3.6" y1="9.2" x2="16.5" y2="9.2" opacity="0.75" />
              <line x1="18.6" y1="10" x2="24.4" y2="10" opacity="0.45" />
              <line x1="3.6" y1="12.6" x2="24.4" y2="12.6" opacity="0.7" />
              <line x1="3.6" y1="15.4" x2="20.5" y2="15.4" opacity="0.38" />
            {:else if def.id === 'prism'}
              <!-- one edge, split three ways -->
              <path d="M8.5 4.2 L14.5 10 L8.5 15.8" opacity="0.85" />
              <path d="M12 4.2 L18 10 L12 15.8" opacity="0.5" />
              <path d="M15.5 4.2 L21.5 10 L15.5 15.8" opacity="0.26" />
            {:else if def.id === 'streak'}
              <!-- the frame smeared along its own velocity -->
              <line x1="3" y1="5.6" x2="16.5" y2="5.6" opacity="0.45" />
              <circle cx="19" cy="5.6" r="1.5" fill={accent} stroke="none" opacity="0.7" />
              <line x1="5.5" y1="10.4" x2="19.5" y2="10.4" opacity="0.75" />
              <circle cx="22" cy="10.4" r="1.5" fill={accent} stroke="none" />
              <line x1="3.8" y1="15" x2="14.5" y2="15" opacity="0.32" />
              <circle cx="17" cy="15" r="1.5" fill={accent} stroke="none" opacity="0.5" />
            {:else if def.id === 'lens'}
              <!-- a glass element on the optical axis -->
              <line x1="1.5" y1="10" x2="26.5" y2="10" opacity="0.25" />
              <path d="M14 2.8 C 20 6.4, 20 13.6, 14 17.2 C 8 13.6, 8 6.4, 14 2.8 Z" />
              <path d="M19 10 L26.2 6.4 M19 10 L26.2 13.6" opacity="0.38" />
            {:else}
              <rect x="1.5" y="3" width="25" height="14" opacity="0.45" />
              <line x1="7" y1="10" x2="21" y2="10" opacity="0.7" />
            {/if}
          </g>
        </svg>
      {/if}
    </span>

    <span class="mpt-text">
      <span class="mpt-head">
        <span class="mpt-name">{def.name}</span>
        <span class="mpt-short">{def.shortName}</span>
      </span>
      {#if def.description}
        <span class="mpt-desc">{def.description}</span>
      {/if}
    </span>

    <span class="mpt-cat">{CATEGORY_LABEL[def.category]}</span>
  </button>
{/if}

<style>
  .mpt {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    /* Two lines of 11px copy plus breathing room clears the 44px thumb floor
       with room to spare; the card is the touch target, nothing inside it is. */
    min-height: 64px;
    margin: 0;
    padding: 8px 10px 8px 8px;
    text-align: left;
    border: 1px solid #0d0e0f;
    border-left: 2px solid var(--accent);
    border-radius: 3px;
    background: #131416;
    color: #dfe6ee;
    font-family: var(--font-ui);
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition:
      background 0.15s,
      border-color 0.15s,
      transform 0.1s;
  }
  .mpt:active {
    transform: scale(0.985);
    background: #191b1e;
  }
  .mpt.is-active {
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--accent) 14%, transparent), transparent 60%),
      #16181b;
    border-color: color-mix(in srgb, var(--accent) 45%, #0d0e0f);
    border-left-color: var(--accent);
  }

  .mpt-glyph {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 48px;
    height: 40px;
    border-radius: 2px;
    background: #0a0b0c;
    box-shadow: inset 0 0 0 1px #0d0e0f;
  }
  .mpt.is-active .mpt-glyph {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, #0d0e0f);
  }

  /* FoldGlyph draws at a hard 14x10; scale it into the same 42x30 footprint the
     inline glyphs occupy so the stroke weights match exactly. */
  .mpt-fold {
    display: block;
    width: 42px;
    height: 30px;
    overflow: hidden;
  }
  .mpt-fold :global(svg) {
    transform: scale(3);
    transform-origin: 0 0;
  }

  .mpt-text {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .mpt-head {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
  }

  .mpt-name {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.1em;
    color: #dfe6ee;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mpt-short {
    flex: 0 0 auto;
    padding: 1px 4px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.1em;
    line-height: 1.25;
  }

  .mpt-desc {
    font-size: 11px;
    line-height: 1.3;
    letter-spacing: 0.02em;
    color: #7d8794;
    /* Two lines is the budget — the descriptions are one clause each. */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .mpt-cat {
    flex: 0 0 auto;
    align-self: flex-start;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.14em;
    color: #3f4653;
    white-space: nowrap;
  }
</style>
