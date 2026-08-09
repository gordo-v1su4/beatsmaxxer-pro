<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { webGpuEngine } from '$lib/rendering/webgpu/WebGpuEngine';
  import { probeWebGpu } from '$lib/rendering/webgpu/capability';
  import { capabilities } from '$lib/stores/capabilities';
  import {
    moduleParams,
    videoLayers,
    midiLayers,
    rackTop,
    rackBottom,
    MAX_RACK_SLOTS_PER_ROW,
    randomize,
    clearParams
  } from '$lib/stores/rack';
  import { listCatalog } from '$lib/modules/catalog';
  import TopBar from '$lib/components/TopBar.svelte';
  import AccessGate from '$lib/components/AccessGate.svelte';
  import PgmRail from '$lib/components/PgmRail.svelte';
  import MainViewer from '$lib/components/MainViewer.svelte';
  import RackSlot from '$lib/components/RackSlot.svelte';
  import ScrewRail from '$lib/components/rack/ScrewRail.svelte';
  import DragGhost from '$lib/components/DragGhost.svelte';
  import SideRail from '$lib/components/SideRail.svelte';
  import BeatSequencer from '$lib/components/BeatSequencer.svelte';
  import CapabilityGate from '$lib/components/CapabilityGate.svelte';
  import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
  import { pgmDirector } from '$lib/runtime/pgm/PgmDirector';
  import { startAppLoop, stopAppLoop } from '$lib/runtime/AppLoop';
  import { startTransportPoll, stopTransportPoll } from '$lib/stores/transportDisplay';
  import { installBspQaHook } from '$lib/qa/bspQa';
  import { fxHold } from '$lib/stores/rack';
  import { topRowCompact, bottomRowCompact } from '$lib/stores/rackUi';
  import { audioEngine } from '$lib/audio';
  import { parseMidi } from '$lib/audio/MidiParser';
  import { fetchAndLoadQaMedia } from '$lib/qa/loadQaMedia';
  import { runDesktopNativeProof } from '$lib/qa/desktopNativeProof';
  import { loadRackClipsFromFiles } from '$lib/media/loadRackClips';
  import { addClipsToLibrary, type LibraryClip } from '$lib/stores/clipLibrary';
  import { initVideoSourcePort } from '$lib/platform/videoSource';
  import { startNativeCompositorBridge } from '$lib/platform/nativeCompositor';
  import { isDesktopNativeDecodeEnabled } from '$lib/platform/desktopDecode';

  const ALL_MODULES = listCatalog();
  const rackModules = $derived(
    [...$rackTop, ...$rackBottom]
      .map((id) => ALL_MODULES.find((module) => module.id === id))
      .filter((module) => module !== undefined)
  );
  let unsubHold: (() => void) | undefined;
  let stopNativeCompositorBridge: (() => void) | undefined;

  const activeClipSlotCount = $derived($rackTop.length + $rackBottom.length);

  const loadedClipCount = $derived(
    [
      ...$rackTop.map((_, index) => `top-${index}`),
      ...$rackBottom.map((_, index) => `bottom-${index}`)
    ].filter((id) => $videoLayers[id]).length
  );

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const nativeDesktopProof =
      params.get('desktopProof') === '1' && isDesktopNativeDecodeEnabled();
    const cap = nativeDesktopProof
      ? {
          renderer: 'webgpu_active' as const,
          webgpu: true,
          webcodecs: false,
          reason: null
        }
      : await probeWebGpu();
    capabilities.set(cap);
    if (cap.webgpu && !nativeDesktopProof) {
      await webGpuEngine.init();
      webGpuEngine.start();
    }

    await initVideoSourcePort();
    stopNativeCompositorBridge = startNativeCompositorBridge();
    startTransportPoll();
    pgmDirector.start();
    startAppLoop();
    installBspQaHook();

    // Every app load begins unheld. With no song playing, the beat-driven cards
    // remain static; playback advances them on the authoritative audio timeline.
    fxHold.set(false);
    unsubHold = fxHold.subscribe((hold) => webGpuEngine.setPaused(hold));

    if (params.get('desktopProof') === '1') {
      void runDesktopNativeProof().catch((error) => {
        console.error('[desktop proof] failed:', error);
      });
      return;
    }
    if (params.has('qa')) {
      try {
        await fetchAndLoadQaMedia();
      } catch (err) {
        console.error('[QA] loadQaMedia failed:', err);
      }
    }
    if (params.get('qaAutoplay') === '1') {
      await audioEngine.start();
    }
  });

  onDestroy(() => {
    unsubHold?.();
    stopNativeCompositorBridge?.();
    stopAppLoop();
    pgmDirector.stop();
    stopTransportPoll();
    void mediaRuntime.dispose();
    webGpuEngine.dispose();
  });

  async function setSlotVideo(slotId: string, file: File) {
    await loadRackClipsFromFiles([file], slotId);
  }

  async function clearSlotVideo(slotId: string) {
    await mediaRuntime.removeModuleClip(slotId);
  }

  async function setModuleMidi(id: string, file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const data = parseMidi(buffer);
      midiLayers.update((layers) => ({
        ...layers,
        [id]: { name: file.name, notes: data.notes, duration: data.duration }
      }));
    } catch (err) {
      console.error('Failed to parse MIDI file:', err);
    }
  }

  function clearModuleMidi(id: string) {
    midiLayers.update((layers) => ({ ...layers, [id]: null }));
  }

  async function loadClips(files: File[]) {
    // The picker fills the rack as it always has; the bank keeps the same files
    // so a clip can be re-assigned later without reopening the picker.
    await loadRackClipsFromFiles(files);
    void addClipsToLibrary(files);
  }

  /** Drop from the clip bank — swaps that slot's media, leaving its effect alone. */
  async function assignLibraryClip(clip: LibraryClip, row: 'top' | 'bottom', slotIndex: number) {
    await loadRackClipsFromFiles([clip.file], `${row}-${slotIndex}`);
  }

  async function loadClipsFromModule(startId: string, files: File[]) {
    await loadRackClipsFromFiles(files, startId);
  }
</script>

<div class="app-viewport">
<AccessGate />
<DragGhost />
<CapabilityGate state={$capabilities} />

<div class="app-shell">
  <TopBar
    onRandomize={randomize}
    onClear={clearParams}
    onLoadClips={loadClips}
    {loadedClipCount}
    clipSlotCount={activeClipSlotCount}
  />

  <div class="rack-workspace">
    <div class="side-panels" style="display:flex;flex-shrink:0">
      <SideRail onAssignClip={assignLibraryClip} />
      <ScrewRail side="left" class="hide-on-mobile" />
      <PgmRail modules={rackModules} />
    </div>

    <div style="width:3px;background:#0d0e0f;flex-shrink:0" class="hide-on-mobile"></div>

    <div class="rack-main">
      <MainViewer modules={rackModules} />

      <div
        class="rack-row top-rack-row"
        style="height:auto;flex-shrink:0;min-height:{$topRowCompact ? 'unset' : '300px'};transition:min-height 0.2s ease"
      >
        {#each $rackTop as moduleId, i (`top-${i}`)}
          <RackSlot
            row="top"
            slotIndex={i}
            canvasId="top-{i}"
            {moduleId}
            params={$moduleParams[moduleId] ?? {}}
            onVideoUpload={(f) => setSlotVideo(`top-${i}`, f)}
            onVideosUpload={(files) => loadClipsFromModule(`top-${i}`, files)}
            onClearVideo={() => clearSlotVideo(`top-${i}`)}
            onMidiUpload={(f) => setModuleMidi(moduleId, f)}
            onClearMidi={() => clearModuleMidi(moduleId)}
          />
        {/each}
        {#each Array(MAX_RACK_SLOTS_PER_ROW - $rackTop.length) as _, offset (`top-empty-${offset}`)}
          <RackSlot row="top" slotIndex={$rackTop.length + offset} />
        {/each}
      </div>

      <div
        class="rack-row bottom-rack-row"
        style="height:auto;flex-shrink:0;min-height:{$bottomRowCompact ? 'unset' : '196px'};border-top:2px solid #0d0e0f;transition:min-height 0.2s ease"
      >
        {#each $rackBottom as moduleId, i (`bottom-${i}`)}
          <RackSlot
            row="bottom"
            slotIndex={i}
            canvasId="bottom-{i}"
            {moduleId}
            params={$moduleParams[moduleId] ?? {}}
            onVideoUpload={(f) => setSlotVideo(`bottom-${i}`, f)}
            onVideosUpload={(files) => loadClipsFromModule(`bottom-${i}`, files)}
            onClearVideo={() => clearSlotVideo(`bottom-${i}`)}
          />
        {/each}
        {#each Array(MAX_RACK_SLOTS_PER_ROW - $rackBottom.length) as _, offset (`bottom-empty-${offset}`)}
          <RackSlot row="bottom" slotIndex={$rackBottom.length + offset} />
        {/each}
      </div>

      <BeatSequencer />
    </div>

    <ScrewRail side="right" class="hide-on-mobile" />
  </div>
</div>
</div>
