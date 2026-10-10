<script lang="ts">
  import TimingPanel from '$lib/components/timing/TimingPanel.svelte';
  import TimingSections from '$lib/components/timing/TimingSections.svelte';
  import TimingFooter from '$lib/components/timing/TimingFooter.svelte';
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
  import { arrangementLoopRegion } from '$lib/stores/arrangement';
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

  /** Shortest the title card stays up, from navigation start (V1S-64). */
  const SPLASH_MIN_MS = 1500;
  /** How long the splash intro takes to land, from when it mounts. */
  const SPLASH_INTRO_MS = 1450;
  /** False while the intro plays: the app is not mounted and the GPU is idle. */
  let introDone = $state(false);
  let splashPhase = $state<'gpu' | 'shaders' | 'armed' | 'go' | 'ready'>('gpu');
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
    const introStartedAt = performance.now();
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

    // Let the title intro play out alone. Mounting the app under the splash
    // (rack, canvases, video elements), even unpainted, starved the
    // compositor and froze the intro for 70-800ms at a time, somewhere
    // different on every load; device bring-up and the shader compiles go
    // through the same GPU process. So the app mounts, and the GPU wakes, only
    // once the intro has landed, behind the settled logo. Automation skips it.
    const automated = params.has('qa') || navigator.webdriver;
    if (!automated) {
      const remaining = SPLASH_INTRO_MS - (performance.now() - introStartedAt);
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, remaining)));
    }
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

    // init() builds only the dry FX pipelines; each effect's own pipeline
    // compiles asynchronously after it (see ModePipelineCache). Hold the
    // splash until a frame has been submitted and those have settled, so the
    // first frame already has its effects, and cap the wait so a GPU that
    // never reports ready cannot lock the app behind the overlay. An engine
    // that never came up has nothing to compile, so it skips the wait.
    if (cap.webgpu && engineReady) {
      splashPhase = 'shaders';
      const stepShaders = bootStep('Compiling effect shaders');
      const deadline = performance.now() + 12000;
      for (;;) {
        const { settled: compiled, total } = webGpuEngine.fxPipelineWarmup;
        const warm = total > 0 && compiled >= total;
        if ((webGpuEngine.hasRenderedFrame && warm) || performance.now() >= deadline) break;
        splashTotal = total;
        splashDone = compiled;
        if (total > 0) stepShaders.note(`${compiled} / ${total}`);
        // Raced against a timer, not a bare rAF. A surface that is not
        // compositing -- a background tab, and every in-app browser pane that
        // has not been scrolled into view -- never fires an animation frame at
        // all, so awaiting one alone parks this loop forever: the deadline
        // below is never re-evaluated and the splash stays up over a working
        // app until the user gives up. That is the reported "splash never
        // dismisses in the in-app browser". Whichever arrives first wins.
        await new Promise((resolve) => {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            resolve(null);
          };
          requestAnimationFrame(done);
          setTimeout(done, 100);
        });
      }
      splashDone = splashTotal;
      if (splashTotal > 0) stepShaders.note(`${splashTotal} / ${splashTotal}`);
      stepShaders.done();
    }
    // ?splash=hold keeps the title card up so it can be designed against.
    // A warm load dismisses it in well under a second, which is too fast to
    // iterate on and the reason it could not be reviewed when first built.
    if (params.get('splash') !== 'hold') {
      // A warm load finishes in well under a second, which flashed the card
      // and its intro away mid-animation (V1S-64). Hold it to a minimum
      // measured from navigation start, so a cold load that already took that
      // long is not held any further. Any key or tap skips the remainder.
      // Automation skips the hold: CDP gates should not wait on a title card.
      const automated = params.has('qa') || navigator.webdriver;
      const holdMs = automated ? 0 : Math.max(0, SPLASH_MIN_MS - performance.now());
      // 'go' plays the exit; unmount only once it has actually run, so the
      // card hands off instead of blinking out from under the user.
      // The skip key is swallowed in the capture phase: it belongs to the
      // splash, and would otherwise land in whatever the app focuses first
      // (the access-code field types the space that dismissed the card).
      let dismissed = false;
      const dismiss = (e?: Event) => {
        if (e?.type === 'keydown') {
          e.preventDefault();
          e.stopPropagation();
        }
        if (dismissed) return;
        dismissed = true;
        window.removeEventListener('keydown', dismiss, true);
        window.removeEventListener('pointerdown', dismiss, true);
        clearTimeout(holdTimer);
        splashPhase = 'go';
        setTimeout(() => { splashPhase = 'ready'; }, 350);
      };
      let holdTimer: ReturnType<typeof setTimeout> | undefined;
      if (holdMs > 0) {
        splashPhase = 'armed';
        window.addEventListener('keydown', dismiss, true);
        window.addEventListener('pointerdown', dismiss, true);
        holdTimer = setTimeout(dismiss, holdMs);
      } else {
        dismiss();
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
      sequencerArmed.set(true);
    }
    if (shouldAutoloadQaLoopRegion(window.location.search)) {
      arrangementLoopRegion.set(qaLoopRegionForDuration(audioEngine.getState().duration));
    }
    bootLogSettle();
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
    await loadRackClipsFromFiles(files, startId);
  }
</script>

<div class="app-viewport" class:mobile-shell-active={$isMobileShell}>
<LoadingSplash phase={splashPhase} done={splashDone} total={splashTotal} />
<!--
  One deployment gate for both shells. Mobile can request hosted analysis, and
  the protected proxy requires the same signed cookie as desktop. AccessGate
  remains invisible when the endpoint reports an open deployment, so local
  development keeps its fail-open behavior without a route-specific bypass.
-->
<AccessGate />
<CapabilityGate state={$capabilities} />

<!--
  Two shells, one engine. The rack below is unchanged; the phone gets its own
  tree because the rack's smallest honest width is 2552px and no breakpoint
  closes that gap. DragGhost stays on the desktop side — there is no drag-and-
  drop surface on the phone to ghost.
-->
{#if !introDone}
  <!-- Nothing mounts under the splash intro; see onMount. -->
{:else if $isMobileShell}
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
  <div class="rack-workspace" class:timing-workspace={$viewMode==='timing'} style="display:{$viewMode === 'arrange' ? 'none' : 'flex'}">
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
      {#if $viewMode==='timing'}<TimingSections/>{/if}

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
