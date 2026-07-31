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
    randomize,
    clearParams
  } from '$lib/stores/rack';
  import { listCatalog } from '$lib/modules/catalog';
  import TopBar from '$lib/components/TopBar.svelte';
  import PgmRail from '$lib/components/PgmRail.svelte';
  import MainViewer from '$lib/components/MainViewer.svelte';
  import RackSlot from '$lib/components/RackSlot.svelte';
  import ScrewRail from '$lib/components/rack/ScrewRail.svelte';
  import DragGhost from '$lib/components/DragGhost.svelte';
  import ModulePalette from '$lib/components/ModulePalette.svelte';
  import BeatSequencer from '$lib/components/BeatSequencer.svelte';
  import CapabilityGate from '$lib/components/CapabilityGate.svelte';
  import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
  import { pgmDirector } from '$lib/runtime/pgm/PgmDirector';
  import { startAppLoop, stopAppLoop } from '$lib/runtime/AppLoop';
  import { startTransportPoll, stopTransportPoll } from '$lib/stores/transportDisplay';
  import { installBspQaHook } from '$lib/qa/bspQa';
  import { fxHold } from '$lib/stores/rack';
  import { topRowCompact, bottomRowCompact } from '$lib/stores/rackUi';
  import { videoPool } from '$lib/media/VideoPool';
  import { audioEngine } from '$lib/audio';
  import { parseMidi } from '$lib/audio/MidiParser';
  import { fetchAndLoadQaMedia } from '$lib/qa/loadQaMedia';
  import { loadRackClipsFromFiles } from '$lib/media/loadRackClips';

  const ALL_MODULES = listCatalog();
  const RACK_SLOT_COUNT = 8;

  let unsubHold: (() => void) | undefined;

  const loadedClipCount = $derived(
    [...$rackTop, ...$rackBottom].filter((id) => $videoLayers[id]).length
  );

  onMount(async () => {
    const cap = await probeWebGpu();
    capabilities.set(cap);
    if (cap.webgpu) {
      await webGpuEngine.init();
      webGpuEngine.start();
    }

    startTransportPoll();
    pgmDirector.start();
    startAppLoop();
    installBspQaHook();

    unsubHold = fxHold.subscribe((hold) => webGpuEngine.setPaused(hold));

    const params = new URLSearchParams(window.location.search);
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
    stopAppLoop();
    pgmDirector.stop();
    stopTransportPoll();
    videoPool.dispose();
    webGpuEngine.dispose();
  });

  async function setModuleVideo(id: string, file: File) {
    await loadRackClipsFromFiles([file], id);
  }

  function clearModuleVideo(id: string) {
    videoLayers.update((layers) => ({ ...layers, [id]: null }));
    mediaRuntime.removeModuleClip(id);
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
    await loadRackClipsFromFiles(files);
  }

  async function loadClipsFromModule(startId: string, files: File[]) {
    await loadRackClipsFromFiles(files, startId);
  }
</script>

<div class="app-viewport">
<DragGhost />
<CapabilityGate state={$capabilities} />

<div class="app-shell">
  <TopBar
    onRandomize={randomize}
    onClear={clearParams}
    onLoadClips={loadClips}
    {loadedClipCount}
    clipSlotCount={RACK_SLOT_COUNT}
  />

  <div class="rack-workspace">
    <div class="side-panels" style="display:flex;flex-shrink:0">
      <ModulePalette />
      <ScrewRail side="left" class="hide-on-mobile" />
      <PgmRail modules={ALL_MODULES} />
    </div>

    <div style="width:3px;background:#0d0e0f;flex-shrink:0" class="hide-on-mobile"></div>

    <div class="rack-main">
      <MainViewer modules={ALL_MODULES} />

      <div
        class="rack-row"
        style="height:{$topRowCompact
          ? 'auto'
          : 'clamp(420px, calc((100vw - 186px) * 9 / 64 + 244px), 544px)'};flex-shrink:{$topRowCompact ? '0' : '1'};min-height:{$topRowCompact ? 'unset' : '300px'};transition:height 0.2s ease"
      >
        {#each $rackTop as moduleId, i (`top-${i}`)}
          <RackSlot
            row="top"
            slotIndex={i}
            canvasId="top-{i}"
            {moduleId}
            params={$moduleParams[moduleId] ?? {}}
            onVideoUpload={(f) => setModuleVideo(moduleId, f)}
            onVideosUpload={(files) => loadClipsFromModule(moduleId, files)}
            onClearVideo={() => clearModuleVideo(moduleId)}
            onMidiUpload={(f) => setModuleMidi(moduleId, f)}
            onClearMidi={() => clearModuleMidi(moduleId)}
          />
        {/each}
      </div>

      <div
        class="rack-row"
        style="height:{$bottomRowCompact
          ? 'auto'
          : 'clamp(240px, calc((100vw - 186px) * 9 / 64 + 96px), 404px)'};flex-shrink:{$bottomRowCompact ? '0' : '1'};min-height:{$bottomRowCompact ? 'unset' : '176px'};border-top:2px solid #0d0e0f;transition:height 0.2s ease"
      >
        {#each $rackBottom as moduleId, i (`bottom-${i}`)}
          <RackSlot
            row="bottom"
            slotIndex={i}
            canvasId="bottom-{i}"
            {moduleId}
            params={$moduleParams[moduleId] ?? {}}
            onVideoUpload={(f) => setModuleVideo(moduleId, f)}
            onVideosUpload={(files) => loadClipsFromModule(moduleId, files)}
            onClearVideo={() => clearModuleVideo(moduleId)}
          />
        {/each}
      </div>

      <BeatSequencer />
    </div>

    <ScrewRail side="right" class="hide-on-mobile" />
  </div>
</div>
</div>
