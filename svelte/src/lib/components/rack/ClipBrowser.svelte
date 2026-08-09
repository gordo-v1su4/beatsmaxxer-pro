<script lang="ts">
  import { get } from 'svelte/store';
  import { FolderOpen, X } from '@lucide/svelte';
  import {
    clipDragState,
    endClipDrag,
    moveClipDrag,
    setClipHoverTarget,
    startClipDrag
  } from '$lib/stores/clipDrag';
  import {
    addClipsToLibrary,
    clipLibrary,
    removeClipFromLibrary,
    type LibraryClip
  } from '$lib/stores/clipLibrary';
  import { videoLayers } from '$lib/stores/rack';
  import { formatClipDuration } from '$lib/media/clipThumbnail';
  import type { RackRow } from '$lib/stores/drag';

  interface Props {
    /** Assign a library clip to one rack slot. */
    onAssignClip: (clip: LibraryClip, row: RackRow, slotIndex: number) => void;
  }

  let { onAssignClip }: Props = $props();

  let query = $state('');
  let importing = $state(false);
  let fileInput = $state<HTMLInputElement>();

  const clips = $derived(
    $clipLibrary.filter((clip) => clip.name.toLowerCase().includes(query.trim().toLowerCase()))
  );

  /**
   * A clip counts as mounted when some slot is showing that exact file. Matching
   * on the File first matters: two takes can share a filename, and marking the
   * wrong tile "in rack" would send the operator hunting for a clip that is not
   * actually loaded.
   */
  const mounted = $derived(
    new Set(
      Object.values($videoLayers)
        .filter((layer) => layer != null)
        .map((layer) => (layer!.file ? `${layer!.file.name}:${layer!.file.size}` : layer!.name))
    )
  );

  function isMounted(clip: LibraryClip) {
    return mounted.has(`${clip.file.name}:${clip.file.size}`) || mounted.has(clip.name);
  }

  export async function importFiles(files: File[]) {
    if (files.length === 0) return;
    importing = true;
    try {
      await addClipsToLibrary(files);
    } finally {
      importing = false;
    }
  }

  function beginDrag(clip: LibraryClip, e: PointerEvent) {
    e.preventDefault();
    startClipDrag(clip, e.clientX, e.clientY);
    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onWindowUp);
  }

  function onWindowMove(e: PointerEvent) {
    moveClipDrag(e.clientX, e.clientY);
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const slot = el?.closest('[data-rack-slot]') as HTMLElement | null;
    // Only slots that already hold a module can take a clip — an empty add-slot
    // has no effect to render the media through.
    if (slot?.dataset.row != null && slot.dataset.index != null && slot.dataset.hasModule === 'true') {
      setClipHoverTarget({
        row: slot.dataset.row as RackRow,
        slotIndex: Number(slot.dataset.index)
      });
    } else {
      setClipHoverTarget(null);
    }
  }

  function onWindowUp() {
    window.removeEventListener('pointermove', onWindowMove);
    window.removeEventListener('pointerup', onWindowUp);
    const state = get(clipDragState);
    const clip = state.clipId ? $clipLibrary.find((c) => c.id === state.clipId) : null;
    if (state.hoverTarget && clip) {
      onAssignClip(clip, state.hoverTarget.row, state.hoverTarget.slotIndex);
    }
    endClipDrag();
  }
</script>

<div class="cb-tools">
  <input class="cb-search" placeholder="Search…" bind:value={query} spellcheck="false" />
  <button
    type="button"
    class="cb-import"
    onclick={() => fileInput?.click()}
    disabled={importing}
    title="Import video files into the bank"
  >
    <FolderOpen size={10} />
    {importing ? '…' : 'ADD'}
  </button>
  <input
    bind:this={fileInput}
    type="file"
    accept="video/*"
    multiple
    hidden
    onchange={(e) => {
      const input = e.currentTarget;
      void importFiles(Array.from(input.files ?? [])).then(() => {
        // Reset so re-picking the same folder fires change again.
        input.value = '';
      });
    }}
  />
</div>

<div class="cb-grid">
  {#if $clipLibrary.length === 0}
    <p class="cb-empty">
      Drop video files on this rail, or ADD them. Then drag a tile onto any rack slot.
    </p>
  {:else if clips.length === 0}
    <p class="cb-empty">No clip matches “{query}”.</p>
  {:else}
    {#each clips as clip (clip.id)}
      <div
        class="cb-tile"
        class:is-mounted={isMounted(clip)}
        class:is-dragging={$clipDragState.clipId === clip.id}
        onpointerdown={(e) => beginDrag(clip, e)}
        role="button"
        tabindex="0"
        title="{clip.name}{isMounted(clip) ? ' — in rack' : ''}"
        aria-label="Drag {clip.name} onto a rack slot"
        onkeydown={(e) => {
          if (e.key === 'Delete' || e.key === 'Backspace') removeClipFromLibrary(clip.id);
        }}
      >
        <div class="cb-thumb">
          {#if clip.thumbnail}
            <img src={clip.thumbnail} alt="" draggable="false" />
          {:else}
            <span class="cb-thumb-pending"></span>
          {/if}
          {#if isMounted(clip)}<span class="cb-badge"></span>{/if}
          <span class="cb-dur">{formatClipDuration(clip.duration)}</span>
          <button
            type="button"
            class="cb-remove"
            title="Remove from bank"
            aria-label="Remove {clip.name} from the clip bank"
            onpointerdown={(e) => e.stopPropagation()}
            onclick={() => removeClipFromLibrary(clip.id)}
          >
            <X size={8} />
          </button>
        </div>
        <span class="cb-name">{clip.name}</span>
      </div>
    {/each}
  {/if}
</div>

{#if $clipDragState.active}
  <div class="cb-ghost" style="left:{$clipDragState.x}px;top:{$clipDragState.y}px">
    {#if $clipDragState.thumbnail}
      <img src={$clipDragState.thumbnail} alt="" />
    {/if}
    <span>{$clipDragState.name}</span>
  </div>
{/if}

<style>
  .cb-tools {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 5px 4px 4px;
    flex-shrink: 0;
  }

  .cb-search {
    flex: 1;
    min-width: 0;
    height: 17px;
    padding: 0 5px;
    border: 1px solid #16181b;
    border-radius: 2px;
    background: #0a0b0d;
    color: #cfe0e2;
    font-family: var(--font-ui);
    font-size: 8px;
    letter-spacing: 0.08em;
    outline: none;
  }
  .cb-search:focus {
    border-color: #2a2f36;
  }
  .cb-search::placeholder {
    color: #33383f;
  }

  .cb-import {
    display: flex;
    align-items: center;
    gap: 3px;
    height: 17px;
    padding: 0 5px;
    border: 1px solid #1e2226;
    border-radius: 2px;
    background: #131517;
    color: #4a5260;
    font-family: var(--font-ui);
    font-size: 7px;
    font-weight: 500;
    letter-spacing: 0.1em;
    flex-shrink: 0;
  }
  .cb-import:hover:not(:disabled) {
    background: #1a1c1f;
    color: #cfe0e2;
  }
  .cb-import:disabled {
    cursor: default;
    opacity: 0.6;
  }

  /* Two columns rather than one: the rail is 160px, and a full-width tile shows
     six clips before scrolling where a half-width tile shows fourteen. The thumb
     is still legible at 72px — it only has to answer "which take is this". */
  .cb-grid {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    align-content: start;
    padding: 0 4px 6px;
  }

  .cb-empty {
    grid-column: 1 / -1;
    margin: 0;
    padding: 6px 2px;
    font-family: var(--font-ui);
    font-size: 7px;
    line-height: 1.4;
    letter-spacing: 0.06em;
    color: #33383f;
  }

  .cb-tile {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 2px;
    border-radius: 2px;
    background: #101214;
    border: 1px solid #16181b;
    cursor: grab;
    user-select: none;
    transition: background 0.12s, border-color 0.12s, transform 0.12s;
  }
  .cb-tile:hover {
    background: #1a1c1f;
    border-color: #2a2f36;
  }
  .cb-tile:active {
    cursor: grabbing;
    transform: scale(0.97);
  }
  .cb-tile:focus-visible {
    outline: 1px solid #35e08a;
    outline-offset: 1px;
  }
  .cb-tile.is-mounted {
    border-color: #35e08a44;
  }
  .cb-tile.is-dragging {
    opacity: 0.35;
  }

  .cb-thumb {
    position: relative;
    aspect-ratio: 16 / 9;
    width: 100%;
    background: #000;
    border-radius: 1px;
    overflow: hidden;
  }
  .cb-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .cb-thumb-pending {
    position: absolute;
    inset: 0;
    background: linear-gradient(100deg, #0e1012, #16191c, #0e1012);
  }

  /* A dot, not a word: "IN RACK" does not fit across a 72px thumb, and the
     tile already carries the green border that says the same thing. */
  .cb-badge {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #35e08a;
    box-shadow: 0 0 4px #35e08a;
  }
  .cb-dur {
    position: absolute;
    right: 2px;
    bottom: 2px;
    padding: 0 2px;
    border-radius: 1px;
    background: rgba(0, 0, 0, 0.72);
    font-family: var(--font-ui);
    font-size: 6px;
    letter-spacing: 0.08em;
    color: #9db1b6;
    font-variant-numeric: tabular-nums;
  }

  /* Hidden with opacity rather than display:none — a display:none button is not
     tabbable, so keyboard users had no way to reach remove at all. */
  .cb-remove {
    position: absolute;
    top: 2px;
    right: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 11px;
    height: 11px;
    padding: 0;
    border: 0;
    border-radius: 1px;
    background: rgba(0, 0, 0, 0.72);
    color: #9db1b6;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .cb-tile:hover .cb-remove,
  .cb-tile:focus-within .cb-remove,
  .cb-remove:focus-visible {
    opacity: 1;
  }
  .cb-remove:hover {
    background: #7a2222;
    color: #fff;
  }

  .cb-name {
    font-family: var(--font-ui);
    font-size: 6.5px;
    letter-spacing: 0.02em;
    color: #4a5260;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cb-ghost {
    position: fixed;
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px;
    border: 1px solid #2a2f36;
    border-radius: 2px;
    background: rgba(10, 11, 13, 0.94);
    font-family: var(--font-ui);
    font-size: 7px;
    letter-spacing: 0.08em;
    color: #cfe0e2;
    pointer-events: none;
    transform: translate(10px, 10px);
  }
  .cb-ghost img {
    width: 40px;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: 1px;
  }
</style>
