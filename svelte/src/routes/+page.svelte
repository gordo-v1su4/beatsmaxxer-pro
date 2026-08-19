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
  import ArrangeView from '$lib/components/ArrangeView.svelte';
  import CapabilityGate from '$lib/components/CapabilityGate.svelte';
  import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
  import { pgmDirector } from '$lib/runtime/pgm/PgmDirector';
  import { startAppLoop, stopAppLoop } from '$lib/runtime/AppLoop';
  import { startTransportPoll, stopTransportPoll } from '$lib/stores/transportDisplay';
  import { installBmxQaHook } from '$lib/qa/bmxQa';
  import { fxHold } from '$lib/stores/rack';
  import {
    topRowCompact,
    bottomRowCompact,
    viewMode,
    fxLibOpen,
    pgmRailOpen
  } from '$lib/stores/rackUi';
  import { audioEngine } from '$lib/audio';
  import { parseMidi } from '$lib/audio/MidiParser';
  import { moduleAcceptsMidi } from '$lib/modules/midiProfiles';
  import { setModuleTriggerSource } from '$lib/stores/midiTrigger';
  import {
    registerModuleMidiChannel,
    removeModuleMidiChannel
  } from '$lib/stores/midiChannels';
  import { fetchAndLoadQaMedia } from '$lib/qa/loadQaMedia';
  import { loadRackClipsFromFiles } from '$lib/media/loadRackClips';
  import { addClipsToLibrary, type LibraryClip } from '$lib/stores/clipLibrary';
  import { initVideoSourcePort } from '$lib/platform/videoSource';
  import LoadingSplash from '$lib/components/LoadingSplash.svelte';
  import MobileShell from '$lib/mobile/MobileShell.svelte';
  import { isMobileShell, initMobileEnv } from '$lib/mobile/mobileEnv';
  import { seedMobileQaClips } from '$lib/mobile/mobileSession';
  import { bootStep, bootLogSettle } from '$lib/stores/bootLog';
  import { get } from 'svelte/store';

  let splashPhase = $state<'gpu' | 'shaders' | 'go' | 'ready'>('gpu');
  let splashDone = $state(0);
  let splashTotal = $state(0);

  const ALL_MODULES = listCatalog();
  const rackModules = $derived(
    [...$rackTop, ...$rackBottom]
      .map((id) => ALL_MODULES.find((module) => module.id === id))
      .filter((module) => module !== undefined)
  );
  let unsubHold: (() => void) | undefined;
  let stopMobileEnv: (() => void) | undefined;

  const activeClipSlotCount = $derived($rackTop.length + $rackBottom.length);

  const loadedClipCount = $derived(
    [
      ...$rackTop.map((_, index) => `top-${index}`),
      ...$rackBottom.map((_, index) => `bottom-${index}`)
    ].filter((id) => $videoLayers[id]).length
  );

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    // Decided before the engine starts: which shell mounts determines how many
    // canvases the engine is about to be asked for — eleven on the rack, one on
    // the phone. Getting this after init would mean attaching ten canvases and
    // tearing them straight back down.
    // Each bootStep() lands *before* the call it names, because the calls below
    // block the main thread and nothing gets painted mid-block. The line on
    // screen when everything freezes has to already say what is running.
    const stepLayout = bootStep('Setting up the workspace');
    stopMobileEnv = initMobileEnv();
    stepLayout.done();

    const stepProbe = bootStep('Checking graphics support');
    const cap = await probeWebGpu();
    capabilities.set(cap);
    stepProbe.note(cap.webgpu ? 'WebGPU' : 'unavailable');
    stepProbe.done();

    if (cap.webgpu) {
      const stepDevice = bootStep('Waking up the graphics card');
      await webGpuEngine.init();
      webGpuEngine.start();
      stepDevice.done();
    }

    const stepVideo = bootStep('Connecting video playback');
    await initVideoSourcePort();
    stepVideo.done();

    const stepClock = bootStep('Starting the transport clock');
    startTransportPoll();
    pgmDirector.start();
    startAppLoop();
    installBmxQaHook();

    // Every app load begins unheld. With no song playing, the beat-driven cards
    // remain static; playback advances them on the authoritative audio timeline.
    fxHold.set(false);
    unsubHold = fxHold.subscribe((hold) => webGpuEngine.setPaused(hold));
    stepClock.done();

    // init() only acquires the device; the stall users actually see is the
    // module shader compiling as each canvas builds its pipeline. Hold the
    // splash until a frame has genuinely been submitted, and cap the wait so a
    // GPU that never reports ready cannot lock the app behind the overlay.
    if (cap.webgpu) {
      splashPhase = 'shaders';
      // The long one. It is pushed before the loop for the same reason as the
      // rest: pipeline creation blocks, so this label is what stays on screen
      // through the stall.
      const stepShaders = bootStep('Compiling effect shaders');
      const deadline = performance.now() + 12000;
      while (!webGpuEngine.hasRenderedFrame && performance.now() < deadline) {
        splashTotal = webGpuEngine.boundCanvasCount;
        splashDone = Math.min(splashTotal, splashDone + 1);
        if (splashTotal > 0) stepShaders.note(`${splashDone} / ${splashTotal}`);
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      }
      stepShaders.done();
    }
    // ?splash=hold keeps the title card up so it can be designed against.
    // A warm load dismisses it in well under a second, which is too fast to
    // iterate on and the reason it could not be reviewed when first built.
    if (params.get('splash') !== 'hold') {
      // 'go' plays the exit; unmount only once it has actually run, so the
      // card hands off instead of blinking out from under the user.
      splashPhase = 'go';
      setTimeout(() => { splashPhase = 'ready'; }, 900);
    }

    if (params.has('qa')) {
      const stepQa = bootStep('Loading test clips');
      try {
        // The phone has one slot and a clip bank; the rack has ten slots and no
        // bank. Fanning the manifest across slots leaves the phone's grid empty,
        // so each shell seeds itself the way its own import path would.
        if (get(isMobileShell)) await seedMobileQaClips();
        else await fetchAndLoadQaMedia();
      } catch (err) {
        console.error('[QA] loadQaMedia failed:', err);
        stepQa.note('failed');
      }
      stepQa.done();
    }
    if (params.get('qaAutoplay') === '1') {
      const stepPlay = bootStep('Starting playback');
      await audioEngine.start();
      stepPlay.done();
    }
    bootLogSettle();
  });

  onDestroy(() => {
    unsubHold?.();
    stopMobileEnv?.();
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
    if (!moduleAcceptsMidi(id)) {
      console.warn(`[midi] ${id} has no meaningful MIDI consumer; ${file.name} was not attached.`);
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const data = parseMidi(buffer);
      const layer = {
        identity: `${file.name}:${file.size}:${file.lastModified}`,
        name: file.name,
        notes: data.notes,
        duration: data.duration
      };
      midiLayers.update((layers) => ({ ...layers, [id]: layer }));
      registerModuleMidiChannel(id, layer);
      setModuleTriggerSource(id, 'midi');
    } catch (err) {
      console.error('Failed to parse MIDI file:', err);
    }
  }

  function clearModuleMidi(id: string) {
    midiLayers.update((layers) => ({ ...layers, [id]: null }));
    removeModuleMidiChannel(id);
    // Hand the module back to the track. Leaving it on 'midi' with no part
    // loaded would silently stop it reacting to anything at all, and the only
    // control that could undo that has just been removed from the UI along with
    // the file — the same irreversible-decision trap configureTimeSampler
    // already documents on the other MIDI path.
    setModuleTriggerSource(id, 'audio');
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

<div class="app-viewport" class:mobile-shell-active={$isMobileShell}>
<LoadingSplash phase={splashPhase} done={splashDone} total={splashTotal} />
<!--
  No PIN on the phone. The phone shell is the public face of this thing — it
  says on arrival that it is a stripped-down representation and points at the
  desktop for the real rack — and a lock screen in front of a showcase is a
  contradiction.

  This costs nothing in protection, which is the only reason it is safe to do.
  The gate's server half is untouched: `/api/analyze` still requires the signed
  cookie, and its policy comment is right that the cookie is the one control a
  request cannot assert its way past. What makes the phone a special case is
  that hosted analysis is the *only* thing that check guards, and the phone
  never asks for it — mobile song loads deliberately run local realtime
  analysis. So the surface being opened here needs no server at all.

  If hosted analysis ever reaches the phone, this decision has to be revisited
  along with it, not quietly inherited.
-->
{#if !$isMobileShell}
  <AccessGate />
{/if}
<CapabilityGate state={$capabilities} />

<!--
  Two shells, one engine. The rack below is unchanged; the phone gets its own
  tree because the rack's smallest honest width is 2552px and no breakpoint
  closes that gap. DragGhost stays on the desktop side — there is no drag-and-
  drop surface on the phone to ghost.
-->
{#if $isMobileShell}
  <MobileShell />
{:else}
<DragGhost />

<div class="app-shell">
  <TopBar
    onRandomize={randomize}
    onClear={clearParams}
    onLoadClips={loadClips}
    {loadedClipCount}
    clipSlotCount={activeClipSlotCount}
  />

  <!-- Two screens, not two panes. Programming wants ten lanes across a whole
       song; performing wants the picture. Stacked in one window each made the
       other worse, so ARRANGE replaces the workspace rather than docking under
       it. The engine keeps running underneath either way. -->
  <div class="rack-workspace" style="display:{$viewMode === 'arrange' ? 'none' : 'flex'}">
    <div
      class="side-panels"
      style="display:flex;flex-shrink:0;width:calc({$fxLibOpen
        ? 'var(--fx-lib-width)'
        : 'var(--fx-lib-collapsed)'} + var(--side-rail-width) + {$pgmRailOpen
        ? 'var(--pgm-rail-width)'
        : 'var(--pgm-rail-collapsed)'})"
    >
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
            onMidiUpload={(f) => setModuleMidi(moduleId, f)}
            onClearMidi={() => clearModuleMidi(moduleId)}
          />
        {/each}
        {#each Array(MAX_RACK_SLOTS_PER_ROW - $rackBottom.length) as _, offset (`bottom-empty-${offset}`)}
          <RackSlot row="bottom" slotIndex={$rackBottom.length + offset} />
        {/each}
      </div>

    </div>

    <ScrewRail side="right" class="hide-on-mobile" />
  </div>

  {#if $viewMode === 'arrange'}
    <ArrangeView />
  {/if}
</div>
{/if}
</div>
