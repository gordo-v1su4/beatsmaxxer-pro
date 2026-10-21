<script lang="ts">
  import { requireHostedAccess, serviceUnlockRequested } from '$lib/access/accessGate';
  import TimingPanel from '$lib/components/timing/TimingPanel.svelte';
  import { timingSourcesCompact } from '$lib/stores/timingLayout';
  import TimingSections from '$lib/components/timing/TimingSections.svelte';
  import TimingFooter from '$lib/components/timing/TimingFooter.svelte';
  import { onMount, onDestroy, tick } from 'svelte';
  import { waitForStartupReady } from '$lib/runtime/startupReady';
  import { SPLASH_REVEAL_SECONDS } from '$lib/rendering/webgpu/splashTimeline';
  import { installArrangementPersistence } from '$lib/arrangement/persistence';
  onMount(installArrangementPersistence);
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
  import PerformViewportFit from '$lib/components/PerformViewportFit.svelte';
  import RackSlot from '$lib/components/RackSlot.svelte';
  import ScrewRail from '$lib/components/rack/ScrewRail.svelte';
  import DragGhost from '$lib/components/DragGhost.svelte';
  import SideRail from '$lib/components/SideRail.svelte';
  import ArrangeView from '$lib/components/ArrangeView.svelte';
  import CapabilityGate from '$lib/components/CapabilityGate.svelte';
  import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
  import { pgmDirector } from '$lib/runtime/pgm/PgmDirector';
  import { startAppLoop, stopAppLoop } from '$lib/runtime/AppLoop';
  import { startLifecycleWatch } from '$lib/runtime/lifecycle';
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
  import { supportsModuleMidi } from '$lib/modules/midiContracts';
  import { attachModuleMidiFile } from '$lib/stores/moduleMidi';
  import { setModuleTriggerSource } from '$lib/stores/midiTrigger';
  import {
    fetchAndLoadQaMedia,
    shouldAutoloadQaArrangerMidi,
    shouldAutoloadQaMidi,
    shouldAutoloadQaSequencerArm,
    shouldAutoloadQaLoopRegion,
    qaLoopRegionForDuration,
  } from '$lib/qa/loadQaMedia';
  import { arrangementLoopRegion, loadDemoArrangement } from '$lib/stores/arrangement';
  import { sequencerArmed } from '$lib/stores/sequencer';
  import { loadRackClipsFromFiles } from '$lib/media/loadRackClips';
  import { addClipsToLibrary, type LibraryClip } from '$lib/stores/clipLibrary';
  import { initVideoSourcePort } from '$lib/platform/videoSource';
  import LoadingSplash from '$lib/components/LoadingSplash.svelte';
  import MobileShell from '$lib/mobile/MobileShell.svelte';
  import { isMobileShell, initMobileEnv } from '$lib/mobile/mobileEnv';
  import { seedMobileQaClips } from '$lib/mobile/mobileSession';
  import { bootStep, bootLogSettle } from '$lib/stores/bootLog';
  import { get } from 'svelte/store';
  import { skipDevSplashReplay } from '$lib/runtime/devBoot';
  const skipSplash = skipDevSplashReplay() && !(
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('splash') === 'hold'
  );

  /** How long the splash intro takes to land, from when it mounts. */
  const SPLASH_INTRO_MS = SPLASH_REVEAL_SECONDS * 1000 + 200;
  /** The workspace mounts behind the first painted splash frame. */
  let introDone = $state(skipSplash);
  let splashPhase = $state<'gpu' | 'shaders' | 'armed' | 'go' | 'ready' | 'error'>(skipSplash?'ready':'gpu');
  let splashError = $state('');
  let resolveSplashGraphic: (result: { error?: string; paintedAt: number }) => void;
  const splashGraphicReady = new Promise<{ error?: string; paintedAt: number }>((resolve) => {
    resolveSplashGraphic = resolve;
  });
  const startupAbort = new AbortController();
  onDestroy(() => startupAbort.abort());
  let splashDone = $state(0);
  let splashTotal = $state(0);
  let splashExitTimer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(splashExitTimer));

  const ALL_MODULES = listCatalog();
  const rackModules = $derived(
    [...$rackTop, ...$rackBottom]
      .map((id) => ALL_MODULES.find((module) => module.id === id))
      .filter((module) => module !== undefined)
  );
  let unsubHold: (() => void) | undefined;
  let stopMobileEnv: (() => void) | undefined;
  let stopLifecycle: (() => void) | undefined;

  const activeClipSlotCount = $derived($rackTop.length + $rackBottom.length);

  const loadedClipCount = $derived(
    [
      ...$rackTop.map((_, index) => `top-${index}`),
      ...$rackBottom.map((_, index) => `bottom-${index}`)
    ].filter((id) => $videoLayers[id]).length
  );

  onMount(async () => {
    // The splash and its intro mount with this component, so this is when the
    // intro starts. Not navigation start: a reload while the GPU is still busy
    // can hold the first frame back by seconds.
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

    // Paint the title card, then load the workspace behind its animation.
    // The intro's minimum duration is checked only after startup has finished.
    const automated = params.has('qa') || navigator.webdriver;
    await document.fonts.ready;
    await tick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    introDone = true;

    const stepProbe = bootStep('Checking graphics support');
    const cap = await probeWebGpu();
    capabilities.set(cap);
    stepProbe.note(cap.webgpu ? 'WebGPU' : 'unavailable');
    stepProbe.done();

    let engineReady = false;
    if (cap.webgpu) {
      const stepDevice = bootStep('Waking up the graphics card');
      engineReady = await webGpuEngine.init();
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
    stopLifecycle = startLifecycleWatch();
    installBmxQaHook();

    // Every app load begins unheld. With no song playing, the beat-driven cards
    // remain static; playback advances them on the authoritative audio timeline.
    fxHold.set(false);
    unsubHold = fxHold.subscribe((hold) => webGpuEngine.setPaused(hold));
    stepClock.done();

    // Hold the title card for every compiled pipeline and a subsequent frame.
    // Slow graphics never silently bypass this gate.
    if (cap.webgpu && engineReady) {
      if (!skipSplash) splashPhase = 'shaders';
      const stepShaders = bootStep('Compiling effect shaders');
      try {
        await waitForStartupReady(
          () => webGpuEngine.fxPipelineWarmup,
          ({ ready, total }) => {
            splashTotal = total;
            splashDone = ready;
            if (total > 0) stepShaders.note(`${ready} / ${total}`);
          },
          startupAbort.signal
        );
        stepShaders.done();
      } catch (error) {
        if (startupAbort.signal.aborted) return;
        splashError = error instanceof Error ? error.message : 'Graphics could not finish loading.';
        splashPhase = 'error';
        return;
      }
    }

    if (params.has('qa')) {
      const stepQa = bootStep('Loading song rhythm and test clips');
      try {
        // The phone has one slot and a clip bank; the rack has ten slots and no
        // bank. Fanning the manifest across slots leaves the phone's grid empty,
        // so each shell seeds itself the way its own import path would.
        if (get(isMobileShell)) await seedMobileQaClips();
        else await fetchAndLoadQaMedia({
          midi: shouldAutoloadQaMidi(window.location.search),
          arrangerMidi: shouldAutoloadQaArrangerMidi(window.location.search),
        });
      } catch (err) {
        console.error('[QA] loadQaMedia failed:', err);
        stepQa.note('failed');
      }
      stepQa.done();
    }
    if (params.get('qaAutoplay') === '1') {
      const stepPlay = bootStep('Starting playback');
      await audioEngine.waitForRhythmReady();
      await audioEngine.start();
      stepPlay.done();
    }
    if (shouldAutoloadQaSequencerArm(window.location.search)) {
      // A session now starts with no cuts; the ARM gate needs some to play.
      loadDemoArrangement();
      sequencerArmed.set(true);
    }
    if (shouldAutoloadQaLoopRegion(window.location.search)) {
      arrangementLoopRegion.set(qaLoopRegionForDuration(audioEngine.getState().duration));
    }
    bootLogSettle();
    if (startupAbort.signal.aborted) return;
    // Preserve the existing limited workspace on unsupported devices. The
    // capability probe is bounded, even if the shared device request stalls.
    if (!skipSplash && (!cap.webgpu || !engineReady)) {
      splashPhase = 'ready';
      return;
    }
    if (!skipSplash) {
      const graphic = await splashGraphicReady;
      if (startupAbort.signal.aborted) return;
      if (graphic.error) {
        splashError = graphic.error;
        splashPhase = 'error';
        return;
      }
      if (!automated) {
        const remaining = SPLASH_INTRO_MS - (performance.now() - graphic.paintedAt);
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, remaining)));
      }
      if (startupAbort.signal.aborted) return;
      if (params.get('splash') === 'hold') splashPhase = 'armed';
      else {
        splashPhase = 'go';
        splashExitTimer = setTimeout(() => { splashPhase = 'ready'; }, 350);
      }
    }
  });

  onDestroy(() => {
    unsubHold?.();
    stopMobileEnv?.();
    stopLifecycle?.();
    stopAppLoop();
    pgmDirector.stop();
    stopTransportPoll();
    void mediaRuntime.dispose();
    webGpuEngine.dispose();
  });

  async function setSlotVideo(slotId: string, file: File) {
    if (!await requireHostedAccess()) return;
    await loadRackClipsFromFiles([file], slotId);
  }

  async function clearSlotVideo(slotId: string) {
    await mediaRuntime.removeModuleClip(slotId);
  }

  async function setModuleMidi(id: string, file: File) {
    if (!supportsModuleMidi(id)) {
      console.warn(`[midi] ${id} has no meaningful MIDI consumer; ${file.name} was not attached.`);
      return;
    }
    try {
      await attachModuleMidiFile(id, file);
    } catch (err) {
      console.error('Failed to parse MIDI file:', err);
    }
  }

  function clearModuleMidi(id: string) {
    midiLayers.update((layers) => ({ ...layers, [id]: null }));
    // Hand the module back to the track. Leaving it on 'midi' with no part
    // loaded would silently stop it reacting to anything at all, and the only
    // control that could undo that has just been removed from the UI along with
    // the file — the same irreversible-decision trap configureTimeSampler
    // already documents on the other MIDI path.
    setModuleTriggerSource(id, 'audio');
  }

  async function loadClips(files: File[]) {
    if (!await requireHostedAccess()) return;
    // The picker fills the rack as it always has; the bank keeps the same files
    // so a clip can be re-assigned later without reopening the picker.
    await loadRackClipsFromFiles(files);
    void addClipsToLibrary(files);
  }

  /** Drop from the clip bank — swaps that slot's media, leaving its effect alone. */
  async function assignLibraryClip(clip: LibraryClip, row: 'top' | 'bottom', slotIndex: number) {
    const slotId = `${row}-${slotIndex}`;
    if (clip.source.kind === 'file') await loadRackClipsFromFiles([clip.source.file], slotId);
    else await mediaRuntime.registerModuleClip(slotId, clip.name, clip.source.url);
  }

  async function loadClipsFromModule(startId: string, files: File[]) {
    if (!await requireHostedAccess()) return;
    await loadRackClipsFromFiles(files, startId);
  }
</script>

{#snippet rackRows()}
      <div
        class="rack-row top-rack-row"
        style="height:auto;flex-shrink:0;min-height:{($viewMode==='timing' || $topRowCompact) ? 'unset' : '300px'};transition:min-height 0.2s ease"
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
        style="height:auto;flex-shrink:0;min-height:{($viewMode==='timing' || $bottomRowCompact) ? 'unset' : '196px'};border-top:2px solid #0d0e0f;transition:min-height 0.2s ease"
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

{/snippet}

<div class="app-viewport" class:mobile-shell-active={$isMobileShell}>
<LoadingSplash phase={splashPhase} done={splashDone} total={splashTotal} error={splashError}
  onGraphicReady={(error) => resolveSplashGraphic({ error, paintedAt: performance.now() })} />
<div inert={splashPhase !== 'ready'} style="display:contents">
<!--
  One deployment gate for both shells. Mobile can request hosted analysis, and
  the protected proxy requires the same signed cookie as desktop. AccessGate
  remains invisible when the endpoint reports an open deployment, so local
  development keeps its fail-open behavior without a route-specific bypass.
-->
<AccessGate />
<div inert={$serviceUnlockRequested} style="display:contents">
<CapabilityGate state={$capabilities} />

<!--
  Two shells, one engine. The rack below is unchanged; the phone gets its own
  tree because the rack's smallest honest width is 2552px and no breakpoint
  closes that gap. DragGhost stays on the desktop side — there is no drag-and-
  drop surface on the phone to ghost.
-->
{#if !introDone}
  <!-- Wait for the title card to paint before mounting the workspace. -->
{:else if $isMobileShell}
  <MobileShell />
{:else}
<DragGhost />

<div class="app-shell">
  <PerformViewportFit active={$viewMode==='perform'} />
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
  <div class="rack-workspace" class:timing-workspace={$viewMode==='timing'} class:timing-compact={$timingSourcesCompact} style="display:{$viewMode === 'arrange' ? 'none' : 'flex'}">
    <div
      class="side-panels"
      style="display:flex;flex-shrink:0;width:calc({$fxLibOpen
        ? 'var(--fx-lib-width)'
        : 'var(--fx-lib-collapsed)'} + var(--side-rail-width) + {$viewMode==='perform'?'0px':$pgmRailOpen
        ? 'var(--pgm-rail-width)'
        : 'var(--pgm-rail-collapsed)'})"
    >
      <SideRail onAssignClip={assignLibraryClip} />
      <ScrewRail side="left" class="hide-on-mobile" />
      {#if $viewMode!=='perform'}<PgmRail modules={rackModules} />{/if}
    </div>

    <div style="width:3px;background:#0d0e0f;flex-shrink:0" class="hide-on-mobile"></div>

    <div class="rack-main">
      <MainViewer modules={rackModules} />
      <TimingSections/>

      {#if $viewMode==='perform'}
        <div class="perform-rack-area">
          <div class="perform-source-rail" style:width={$pgmRailOpen?'var(--pgm-rail-width)':'var(--pgm-rail-collapsed)'}><PgmRail modules={rackModules}/></div>
          <div class="perform-rows">{@render rackRows()}</div>
        </div>
      {:else}
        {@render rackRows()}
      {/if}
      {#if $viewMode==='perform'}<TimingFooter />{/if}

      {#if $viewMode==='timing'}<TimingPanel/>{/if}
    </div>

    <ScrewRail side="right" class="hide-on-mobile" />
  </div>

  {#if $viewMode === 'arrange'}
    <div class="arrange-workspace">
      <ArrangeView />
    </div>
  {/if}
</div>
{/if}
</div>
</div>
</div>
