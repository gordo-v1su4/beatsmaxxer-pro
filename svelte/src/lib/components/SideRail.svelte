<script lang="ts">
  import { ChevronLeft, ChevronRight } from '@lucide/svelte';
  import ModulePalette from '$lib/components/ModulePalette.svelte';
  import ClipBrowser from '$lib/components/rack/ClipBrowser.svelte';
  import { clipLibrary, type LibraryClip } from '$lib/stores/clipLibrary';
  import { fxLibOpen, showSideRailTab, sideRailTab, type SideRailTab } from '$lib/stores/rackUi';
  import type { RackRow } from '$lib/stores/drag';

  interface Props {
    onAssignClip: (clip: LibraryClip, row: RackRow, slotIndex: number) => void;
  }

  let { onAssignClip }: Props = $props();

  let browser = $state<ClipBrowser>();
  /** Depth counter, not a boolean: dragging over a child fires dragleave on the
      parent, which would flicker the highlight off mid-drag. */
  let dragDepth = $state(0);
  const dropActive = $derived(dragDepth > 0);

  const TABS: { key: SideRailTab; label: string }[] = [
    { key: 'fx', label: 'FX' },
    { key: 'clips', label: 'CLIPS' }
  ];

  function videoFilesFrom(transfer: DataTransfer | null) {
    if (!transfer) return [];
    return Array.from(transfer.files).filter(
      (file) => file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name)
    );
  }

  async function onDrop(event: DragEvent) {
    event.preventDefault();
    dragDepth = 0;
    const files = videoFilesFrom(event.dataTransfer);
    if (files.length === 0) return;
    // Dropping video is an import gesture — switch to the tab the tiles land on
    // rather than filing them behind whichever tab happened to be showing.
    showSideRailTab('clips');
    await browser?.importFiles(files);
  }
</script>

<aside
  class="side-rail"
  class:is-drop-target={dropActive}
  aria-label="Browser rail — FX modules and clip bank"
  style="width:{$fxLibOpen ? 'var(--fx-lib-width)' : 'var(--fx-lib-collapsed)'}"
  ondragenter={(e) => {
    if (e.dataTransfer?.types.includes('Files')) dragDepth += 1;
  }}
  ondragover={(e) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }}
  ondragleave={() => {
    dragDepth = Math.max(0, dragDepth - 1);
  }}
  ondrop={onDrop}
>
  {#if $fxLibOpen}
    <div class="rail-head" role="tablist" aria-label="Browser">
      {#each TABS as tab (tab.key)}
        <button
          type="button"
          role="tab"
          class="rail-tab"
          aria-selected={$sideRailTab === tab.key}
          data-active={$sideRailTab === tab.key}
          onclick={() => sideRailTab.set(tab.key)}
          title={tab.key === 'fx'
            ? 'Effect modules — drag onto a rack slot to swap the effect'
            : 'Clip bank — drag onto a rack slot to swap the video'}
        >
          {tab.label}
          {#if tab.key === 'clips' && $clipLibrary.length > 0}
            <span class="rail-tab-count">{$clipLibrary.length}</span>
          {/if}
        </button>
      {/each}
      <button
        type="button"
        class="rail-collapse"
        onclick={() => fxLibOpen.set(false)}
        aria-label="Retract browser rail"
        title="Retract the rail"
      >
        <ChevronLeft size={11} />
      </button>
    </div>

    {#if $sideRailTab === 'fx'}
      <ModulePalette />
    {:else}
      <ClipBrowser bind:this={browser} {onAssignClip} />
    {/if}
  {:else}
    <button
      type="button"
      class="rail-expand"
      onclick={() => fxLibOpen.set(true)}
      aria-label="Open browser rail"
      title="FX modules and clip bank"
    >
      <ChevronRight size={12} />
      <span class="rail-expand-label">{$sideRailTab === 'fx' ? 'FX' : 'CLIPS'}</span>
    </button>
  {/if}
</aside>

<style>
  .side-rail {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: linear-gradient(180deg, #0c0d0f, #08090b);
    border-right: 1px solid #0d0e0f;
    transition: width 0.2s ease;
  }
  /* Inset rather than a border: a border here would shift the whole rack 1px
     sideways on every dragenter. */
  .side-rail.is-drop-target {
    box-shadow: inset 0 0 0 1px #35e08a99;
    background: linear-gradient(180deg, #0e1512, #0a0f0c);
  }

  .rail-head {
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
    height: 22px;
    background: linear-gradient(180deg, #141618, #0f1012);
    border-bottom: 1px solid #0d0e0f;
  }

  .rail-tab {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 0;
    /* The active marker is a top rule, not a background: two tabs sharing one
       22px strip need the difference readable at a glance from across a room,
       and a 2px accent line reads before a fill does. */
    border-top: 2px solid transparent;
    background: transparent;
    padding: 0 4px;
    color: #3f4653;
    font-family: var(--font-ui);
    font-size: 8px;
    font-weight: 500;
    letter-spacing: 0.14em;
    transition: color 0.12s, background 0.12s, border-color 0.12s;
  }
  .rail-tab:hover {
    color: #8b9aa0;
    background: #16181b;
  }
  .rail-tab[data-active='true'] {
    color: #cfe0e2;
    border-top-color: #35e08a;
    background: #101214;
  }

  .rail-tab-count {
    font-size: 7px;
    letter-spacing: 0.06em;
    color: #55696e;
    font-variant-numeric: tabular-nums;
  }

  .rail-collapse {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    flex-shrink: 0;
    border: 0;
    border-left: 1px solid #0d0e0f;
    background: transparent;
    color: #3f4653;
  }
  .rail-collapse:hover {
    color: #cfe0e2;
    background: #16181b;
  }

  .rail-expand {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 8px 2px;
    border: 0;
    background: linear-gradient(180deg, #141618, #0f1012);
    color: #4a5260;
  }
  .rail-expand:hover {
    color: #cfe0e2;
  }
  /* Rotated so the retracted rail still says what is behind it. */
  .rail-expand-label {
    writing-mode: vertical-rl;
    font-family: var(--font-ui);
    font-size: 8px;
    font-weight: 500;
    letter-spacing: 0.2em;
  }
</style>
