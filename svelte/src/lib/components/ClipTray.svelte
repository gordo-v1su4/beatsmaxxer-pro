<script lang="ts">
  import { get } from 'svelte/store';
  import { ChevronDown, ChevronUp, FolderOpen, X } from '@lucide/svelte';
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
  import { clipLibraryOpen } from '$lib/stores/rackUi';
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

  async function importFiles(files: File[]) {
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

<section class="clip-tray">
  <div class="clip-tray-head">
    <button
      type="button"
      class="clip-tray-toggle"
      onclick={() => clipLibraryOpen.update((v) => !v)}
      title="Clip bank — drag a clip down onto any rack slot"
    >
      {#if $clipLibraryOpen}<ChevronUp size={11} />{:else}<ChevronDown size={11} />{/if}
      <span>CLIPS</span>
      <span class="clip-count">{$clipLibrary.length}</span>
    </button>

    {#if $clipLibraryOpen}
      <input
        class="clip-search"
        placeholder="Search clips…"
        bind:value={query}
        spellcheck="false"
      />
      <span class="clip-hint">drag a clip onto any slot</span>
    {/if}

    <button type="button" class="clip-import" onclick={() => fileInput?.click()} disabled={importing}>
      <FolderOpen size={10} />
      {importing ? 'READING…' : 'IMPORT'}
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

  {#if $clipLibraryOpen}
    <div class="clip-strip">
      {#if $clipLibrary.length === 0}
        <p class="clip-empty">
          No clips yet — IMPORT a folder of video, then drag them onto rack slots.
        </p>
      {:else if clips.length === 0}
        <p class="clip-empty">No clip matches “{query}”.</p>
      {:else}
        {#each clips as clip (clip.id)}
          <div
            class="clip-tile"
            class:is-mounted={isMounted(clip)}
            class:is-dragging={$clipDragState.clipId === clip.id}
            onpointerdown={(e) => beginDrag(clip, e)}
            role="button"
            tabindex="0"
            aria-label="Drag {clip.name} onto a rack slot"
            onkeydown={(e) => {
              if (e.key === 'Delete' || e.key === 'Backspace') removeClipFromLibrary(clip.id);
            }}
          >
            <div class="clip-thumb">
              {#if clip.thumbnail}
                <img src={clip.thumbnail} alt="" draggable="false" />
              {:else}
                <span class="clip-thumb-pending"></span>
              {/if}
              {#if isMounted(clip)}<span class="clip-badge">IN RACK</span>{/if}
              <span class="clip-dur">{formatClipDuration(clip.duration)}</span>
              <button
                type="button"
                class="clip-remove"
                title="Remove from bank"
                onpointerdown={(e) => e.stopPropagation()}
                onclick={() => removeClipFromLibrary(clip.id)}
              >
                <X size={9} />
              </button>
            </div>
            <span class="clip-name">{clip.name}</span>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</section>

{#if $clipDragState.active}
  <div
    class="clip-ghost"
    style="left:{$clipDragState.x}px;top:{$clipDragState.y}px"
  >
    {#if $clipDragState.thumbnail}
      <img src={$clipDragState.thumbnail} alt="" />
    {/if}
    <span>{$clipDragState.name}</span>
  </div>
{/if}

<style>
  .clip-tray {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, #0c0d0f, #08090b);
    border-bottom: 2px solid #0d0e0f;
  }

  .clip-tray-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px;
    background: linear-gradient(180deg, #141618, #0f1012);
    border-bottom: 1px solid #0d0e0f;
  }

  .clip-tray-toggle,
  .clip-import {
    display: flex;
    align-items: center;
    gap: 4px;
    border: 0;
    background: transparent;
    padding: 2px 4px;
    border-radius: 2px;
    cursor: pointer;
    color: #556070;
    font-family: var(--font-ui);
    font-size: 8px;
    font-weight: 500;
    letter-spacing: 0.14em;
    transition: background 0.12s, color 0.12s;
  }
  .clip-tray-toggle:hover,
  .clip-import:hover:not(:disabled) {
    background: #1a1c1f;
    color: #cfe0e2;
  }
  .clip-import {
    margin-left: auto;
    color: #4a5260;
  }
  .clip-import:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .clip-count {
    color: #33383f;
    font-variant-numeric: tabular-nums;
  }

  .clip-search {
    width: 130px;
    height: 16px;
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
  .clip-search:focus {
    border-color: #2a2f36;
  }
  .clip-search::placeholder {
    color: #33383f;
  }

  .clip-hint {
    font-family: var(--font-ui);
    font-size: 7px;
    letter-spacing: 0.12em;
    color: #33383f;
  }

  .clip-strip {
    display: flex;
    gap: 5px;
    align-items: flex-start;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 5px 6px;
  }

  .clip-empty {
    margin: 0;
    padding: 6px 2px;
    font-family: var(--font-ui);
    font-size: 7px;
    letter-spacing: 0.1em;
    color: #33383f;
  }

  .clip-tile {
    flex: 0 0 auto;
    width: 92px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 3px;
    border-radius: 2px;
    background: #101214;
    border: 1px solid #16181b;
    cursor: grab;
    user-select: none;
    transition: background 0.12s, border-color 0.12s, transform 0.12s;
  }
  .clip-tile:hover {
    background: #1a1c1f;
    border-color: #2a2f36;
  }
  .clip-tile:active {
    cursor: grabbing;
    transform: scale(0.97);
  }
  .clip-tile.is-mounted {
    border-color: #2f4a3a;
  }
  .clip-tile.is-dragging {
    opacity: 0.35;
  }

  .clip-thumb {
    position: relative;
    aspect-ratio: 16 / 9;
    width: 100%;
    background: #000;
    border-radius: 1px;
    overflow: hidden;
  }
  .clip-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .clip-thumb-pending {
    position: absolute;
    inset: 0;
    background: linear-gradient(100deg, #0e1012, #16191c, #0e1012);
  }

  .clip-badge,
  .clip-dur {
    position: absolute;
    bottom: 2px;
    padding: 0 2px;
    border-radius: 1px;
    background: rgba(0, 0, 0, 0.72);
    font-family: var(--font-ui);
    font-size: 6px;
    letter-spacing: 0.1em;
  }
  .clip-badge {
    top: 2px;
    bottom: auto;
    left: 2px;
    background: rgba(53, 224, 138, 0.82);
    color: #06120b;
    font-weight: 600;
  }
  .clip-dur {
    right: 2px;
    color: #9db1b6;
    font-variant-numeric: tabular-nums;
  }

  .clip-remove {
    position: absolute;
    top: 2px;
    right: 2px;
    display: none;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    padding: 0;
    border: 0;
    border-radius: 1px;
    background: rgba(0, 0, 0, 0.72);
    color: #9db1b6;
    cursor: pointer;
  }
  .clip-tile:hover .clip-remove {
    display: flex;
  }
  .clip-remove:hover {
    background: #7a2222;
    color: #fff;
  }

  .clip-name {
    font-family: var(--font-ui);
    font-size: 7px;
    letter-spacing: 0.04em;
    color: #4a5260;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .clip-ghost {
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
  .clip-ghost img {
    width: 40px;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: 1px;
  }
</style>
