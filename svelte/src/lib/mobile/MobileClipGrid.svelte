<script lang="ts">
  import { Play, Plus, Film } from '@lucide/svelte';
  import { addClipsToLibrary, clipLibrary, type LibraryClip } from '$lib/stores/clipLibrary';
  import { formatClipDuration } from '$lib/media/clipThumbnail';
  import { VIDEO_FILE_ACCEPT } from '$lib/media/filePickerAccept';
  import {
    advanceBars,
    advanceMode,
    CLIP_ADVANCE_BARS,
    clipQueueIds,
    loadStageClip,
    stageClipId,
    toggleQueuedClip,
    type AdvanceMode
  } from './mobileSession';

  /**
   * The clip bank as posters.
   *
   * The desktop browser is a drag source: you pick up a tile and drop it on one
   * of ten slots. The phone has one slot, so there is nothing to aim at and the
   * drag has no meaning. What is left is the choice itself — which clips are in
   * the set, and how the set advances — which is the Beatleap shape: pick, then
   * say how they follow each other.
   *
   * Every tile is the poster frame decoded once at import. No <video> is mounted
   * here at any point; the one moving picture on the phone is the program stage.
   */

  let fileInput = $state<HTMLInputElement>();
  let importing = $state(false);

  const clips = $derived($clipLibrary);
  const queued = $derived($clipQueueIds);

  const MODES: { key: AdvanceMode; label: string; blurb: string }[] = [
    { key: 'hold', label: 'HOLD', blurb: 'Stay on this clip' },
    { key: 'linear', label: 'LINEAR', blurb: 'Next in pick order' },
    { key: 'random', label: 'RANDOM', blurb: 'Jump to any other' }
  ];

  /** 1-based position in the set, or 0 when the clip is not picked. */
  function queuePosition(clip: LibraryClip) {
    return queued.indexOf(clip.id) + 1;
  }

  function pickFiles() {
    fileInput?.click();
  }

  async function onFilesChosen(input: HTMLInputElement) {
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;
    importing = true;
    try {
      await addClipsToLibrary(files);
    } finally {
      importing = false;
      // Reset so re-picking the same files fires change again.
      input.value = '';
    }
  }

  /**
   * Long-press stages a clip without adding it to the set — the "show me this
   * one now" gesture. The tap it shadows (pick/unpick) must not also fire, so a
   * fired long press swallows the click that follows it.
   */
  const LONG_PRESS_MS = 450;
  const MOVE_TOLERANCE = 10;

  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let pressStart = { x: 0, y: 0 };
  let longFired = false;

  function beginPress(clip: LibraryClip, e: PointerEvent) {
    cancelPress();
    longFired = false;
    pressStart = { x: e.clientX, y: e.clientY };
    pressTimer = setTimeout(() => {
      pressTimer = null;
      longFired = true;
      navigator.vibrate?.(12);
      void loadStageClip(clip);
    }, LONG_PRESS_MS);
  }

  function movePress(e: PointerEvent) {
    if (!pressTimer) return;
    if (
      Math.abs(e.clientX - pressStart.x) > MOVE_TOLERANCE ||
      Math.abs(e.clientY - pressStart.y) > MOVE_TOLERANCE
    ) {
      cancelPress();
    }
  }

  function cancelPress() {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  }

  function onTileClick(clip: LibraryClip) {
    cancelPress();
    if (longFired) {
      longFired = false;
      return;
    }
    void toggleQueuedClip(clip);
  }
</script>

<div class="cg">
  <div class="cg-head">
    <div class="cg-titles">
      <span class="cg-title">CLIP BANK</span>
      <span class="cg-sub">
        {clips.length}
        {clips.length === 1 ? 'CLIP' : 'CLIPS'} · {queued.length} PICKED
      </span>
    </div>
    <button type="button" class="cg-add" onclick={pickFiles} disabled={importing}>
      <Plus size={16} />
      {importing ? 'ADDING…' : 'ADD CLIPS'}
    </button>
  </div>

  <input
    bind:this={fileInput}
    type="file"
    accept={VIDEO_FILE_ACCEPT}
    multiple
    hidden
    onchange={(e) => void onFilesChosen(e.currentTarget)}
  />

  <div class="cg-advance" role="radiogroup" aria-label="How the stage advances between clips">
    <span class="cg-advance-label">ADVANCE</span>
    <div class="cg-modes">
      {#each MODES as mode (mode.key)}
        <button
          type="button"
          role="radio"
          class="cg-mode"
          class:is-on={$advanceMode === mode.key}
          aria-checked={$advanceMode === mode.key}
          title={mode.blurb}
          onclick={() => advanceMode.set(mode.key)}
        >
          {mode.label}
        </button>
      {/each}
    </div>
  </div>

  <!--
    How often it moves. This was fixed at eight bars with nothing to change it,
    so LINEAR and RANDOM were one tempo each and the mode buttons were the only
    thing the set could be shaped with.

    Hidden under HOLD rather than disabled: HOLD does not advance at all, so an
    interval there is a control with no effect, and a greyed row still reads as
    something you are meant to be able to reach.
  -->
  {#if $advanceMode !== 'hold'}
    <div class="cg-every" role="radiogroup" aria-label="How often the stage moves to the next clip">
      <span class="cg-advance-label">EVERY</span>
      <div class="cg-modes">
        {#each CLIP_ADVANCE_BARS as bars (bars)}
          <button
            type="button"
            role="radio"
            class="cg-mode"
            class:is-on={$advanceBars === bars}
            aria-checked={$advanceBars === bars}
            aria-label="{bars} bar{bars === 1 ? '' : 's'}"
            onclick={() => advanceBars.set(bars)}
          >
            {bars}BR
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if clips.length === 0}
    <div class="cg-empty">
      <svg class="cg-empty-art" viewBox="0 0 120 74" role="presentation" aria-hidden="true">
        <g fill="none" stroke-linecap="round" stroke-linejoin="round">
          <rect
            x="10.5"
            y="16.5"
            width="52"
            height="34"
            rx="2"
            stroke="#232830"
            stroke-width="1.6"
          />
          <rect
            x="30.5"
            y="24.5"
            width="52"
            height="34"
            rx="2"
            stroke="#2e343e"
            stroke-width="1.6"
          />
          <rect
            x="50.5"
            y="32.5"
            width="52"
            height="34"
            rx="2"
            stroke="#8ec5ff"
            stroke-width="1.8"
          />
          <path d="M69 41 L69 58 L84 49.5 Z" fill="#8ec5ff" stroke="none" opacity="0.85" />
          <g stroke="#232830" stroke-width="1.4" opacity="0.9">
            <path d="M14 10 H24 M30 10 H40 M46 10 H56" />
          </g>
        </g>
      </svg>
      <h2 class="cg-empty-title">BRING IN SOME CLIPS</h2>
      <p class="cg-empty-copy">
        Pick the shots you want in the set. Tap a poster to add it, long-press to put it on the
        stage right now, then choose how they advance — hold on one, run them in order, or let it
        jump.
      </p>
      <button type="button" class="cg-empty-cta" onclick={pickFiles} disabled={importing}>
        <Plus size={18} />
        {importing ? 'ADDING…' : 'ADD CLIPS'}
      </button>
      <p class="cg-empty-note">Nothing uploads. Files stay on this device.</p>
    </div>
  {:else}
    <div class="cg-grid">
      {#each clips as clip (clip.id)}
        {@const pos = queuePosition(clip)}
        {@const onAir = $stageClipId === clip.id}
        <div class="cg-tile" class:is-picked={pos > 0} class:is-air={onAir}>
          <button
            type="button"
            class="cg-tile-main"
            aria-pressed={pos > 0}
            aria-label="{clip.name}{pos > 0 ? ` — picked, position ${pos}` : ''}{onAir
              ? ' — on air'
              : ''}"
            onpointerdown={(e) => beginPress(clip, e)}
            onpointermove={movePress}
            onpointerup={cancelPress}
            onpointercancel={cancelPress}
            onclick={() => onTileClick(clip)}
          >
            <span class="cg-poster">
              {#if clip.thumbnail}
                <img src={clip.thumbnail} alt="" draggable="false" />
              {:else}
                <span class="cg-poster-ph">
                  <Film size={18} />
                  <span class="cg-poster-ph-name">{clip.name}</span>
                </span>
              {/if}

              {#if pos > 0}
                <span class="cg-pos" aria-hidden="true">{pos}</span>
              {/if}
              {#if onAir}
                <span class="cg-air" aria-hidden="true">ON AIR</span>
              {/if}
              <span class="cg-dur" aria-hidden="true">{formatClipDuration(clip.duration)}</span>
            </span>
            <span class="cg-name">{clip.name}</span>
          </button>

          <button
            type="button"
            class="cg-cue"
            aria-label="Put {clip.name} on the stage now"
            onclick={() => void loadStageClip(clip)}
          >
            <Play size={14} />
          </button>
        </div>
      {/each}
    </div>

    <p class="cg-hint">Tap to pick · long-press or ▶ to stage now</p>
  {/if}
</div>

<style>
  .cg {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 10px 24px;
    font-family: var(--font-ui);
    color: #dfe6ee;
  }

  .cg-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 36px;
  }
  .cg-titles {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .cg-title {
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.18em;
    color: #c8d2dc;
  }
  .cg-sub {
    font-size: 11px;
    letter-spacing: 0.12em;
    color: #5a6472;
    white-space: nowrap;
  }

  .cg-add {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 5px;
    height: var(--m-tap, 44px);
    padding: 0 12px;
    border: 1px solid var(--m-line-soft, #1e2226);
    border-radius: var(--m-radius-pill, 999px);
    background: var(--m-raised, #17191c);
    color: var(--m-ink, #e5e7eb);
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.14em;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .cg-add:active:not(:disabled) {
    background: #161a1d;
    color: #dfe6ee;
  }
  .cg-add:disabled {
    opacity: 0.55;
    cursor: default;
  }

  /* ADVANCE — inline label + segmented control, no box. */
  .cg-advance {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 10px;
    padding: 0;
    border: none;
    background: transparent;
  }
  /* Same row shape as ADVANCE above it, so the two read as one setting in two
     parts — what it does, then how often — rather than as unrelated controls. */
  .cg-every {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 10px;
    padding: 0;
    border: none;
    background: transparent;
  }
  .cg-advance-label {
    flex: 0 0 auto;
    /* Both labels reserve the width of the longer one, so the two button rows
       start on the same x and the pair lines up as a block. */
    min-width: 4.6em;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.18em;
    color: #3f4653;
  }
  .cg-modes {
    display: flex;
    flex: 1 1 auto;
  }
  .cg-mode {
    position: relative;
    flex: 1 1 0;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 40px;
    padding: 0 6px;
    margin-left: -1px;
    border: 1px solid var(--m-line-soft, #1e2226);
    background: var(--m-sunken, #070809);
    color: var(--m-ink-faint, #555e6a);
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-align: center;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition:
      background 0.1s,
      color 0.1s;
  }
  .cg-mode:first-child {
    margin-left: 0;
    border-radius: 0;
  }
  .cg-mode:last-child {
    border-radius: 0;
  }
  .cg-mode.is-on {
    z-index: 1;
    background: #111a14;
    border-color: rgba(53, 224, 138, 0.35);
    color: #35e08a;
  }

  .cg-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .cg-tile {
    position: relative;
    border: 1px solid var(--m-line-soft, #1e2226);
    border-radius: var(--m-radius, 12px);
    background: rgba(18, 20, 22, 0.28);
    overflow: hidden;
    transition: border-color 0.15s;
  }
  .cg-tile.is-picked {
    border-color: #35e08a55;
  }
  .cg-tile.is-air {
    border-color: #ff5f56;
    box-shadow: 0 0 0 1px #ff5f5644;
  }

  .cg-tile-main {
    display: flex;
    flex-direction: column;
    width: 100%;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font-family: var(--font-ui);
    text-align: left;
    cursor: pointer;
    /* This element runs a long-press timer, so the browser must not also decide
       the gesture is a scroll-and-cancel or a double-tap zoom. */
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    user-select: none;
  }
  .cg-tile-main:active .cg-poster {
    opacity: 0.75;
  }

  .cg-poster {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #000;
    transition: opacity 0.12s;
  }
  .cg-poster img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* A clip the browser could not decode still belongs in the bank; name it
     rather than showing an empty rectangle. */
  .cg-poster-ph {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px;
    background: linear-gradient(140deg, #0e1012, #16191c 55%, #0e1012);
    color: #3f4653;
  }
  .cg-poster-ph-name {
    max-width: 100%;
    font-size: 11px;
    letter-spacing: 0.06em;
    color: #5a6472;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cg-pos {
    position: absolute;
    top: 4px;
    left: 4px;
    display: grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: var(--m-radius-pill, 999px);
    background: #35e08a;
    color: #06120c;
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .cg-air {
    position: absolute;
    left: 4px;
    bottom: 4px;
    padding: 2px 5px;
    border-radius: 2px;
    background: #ff5f56;
    color: #140605;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    line-height: 1.1;
  }

  .cg-dur {
    position: absolute;
    right: 4px;
    bottom: 4px;
    padding: 1px 4px;
    border-radius: 2px;
    background: rgba(0, 0, 0, 0.7);
    color: #9db1b6;
    font-size: 11px;
    letter-spacing: 0.06em;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }

  .cg-name {
    display: block;
    padding: 7px 8px 8px;
    font-size: 11px;
    letter-spacing: 0.04em;
    color: #7d8794;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The immediate-stage affordance. Long-press does the same thing, but a
     gesture nobody is told about is not a control. */
  .cg-cue {
    position: absolute;
    top: 0;
    right: 0;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: none;
    background: linear-gradient(225deg, rgba(0, 0, 0, 0.72), rgba(0, 0, 0, 0));
    color: #dfe6ee;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .cg-cue:active {
    color: #ff5f56;
  }
  .cg-tile.is-air .cg-cue {
    color: #ff5f56;
  }

  .cg-hint {
    margin: 0;
    padding: 2px 2px 0;
    font-size: 11px;
    letter-spacing: 0.08em;
    color: #3f4653;
  }

  /* First run, and the only thing a visitor sees before they own any media. */
  .cg-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 8px 12px 28px;
    border: 1px solid var(--m-line-soft, #1e2226);
    border-radius: var(--m-radius, 12px);
    background: linear-gradient(180deg, #101214, #0a0b0c);
    text-align: center;
  }
  .cg-empty-art {
    width: 100%;
    max-width: 220px;
    height: auto;
  }
  .cg-empty-title {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.2em;
    color: #c8d2dc;
  }
  .cg-empty-copy {
    margin: 0;
    max-width: 34ch;
    font-size: 12px;
    line-height: 1.5;
    letter-spacing: 0.02em;
    color: #7d8794;
  }
  .cg-empty-cta {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: var(--m-tap-lg, 48px);
    height: auto;
    padding: 0 18px;
    margin-top: 2px;
    border: 1px solid color-mix(in srgb, var(--m-accent, #2dd4bf) 28%, var(--m-line-soft, #1e2226));
    border-radius: var(--m-radius-pill, 999px);
    background: color-mix(in srgb, var(--m-accent, #2dd4bf) 10%, var(--m-raised, #17191c));
    color: var(--m-accent-soft, #99f6e4);
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.16em;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .cg-empty-cta:active:not(:disabled) {
    background: #161a1d;
    color: #dfe6ee;
  }
  .cg-empty-cta:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .cg-empty-note {
    margin: 0;
    font-size: 11px;
    letter-spacing: 0.1em;
    color: #3f4653;
  }
</style>
