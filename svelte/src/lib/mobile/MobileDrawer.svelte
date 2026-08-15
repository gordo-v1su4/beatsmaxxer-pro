<script lang="ts">
  import { X, Upload } from '@lucide/svelte';
  import { audioEngine } from '$lib/audio';
  import { isHostedAnalysisEnabled } from '$lib/audio/essentia';
  import { planAudioUpload } from '$lib/audio/hostedAnalysisDecision';
  import {
    readHostedAnalysisPreference,
    setHostedAnalysisPreference
  } from '$lib/audio/hostedAnalysisPreference';
  import MobileAnalysisConsent from '$lib/mobile/MobileAnalysisConsent.svelte';
  import { AUDIO_FILE_ACCEPT } from '$lib/media/filePickerAccept';
  import { listCatalog, type ModuleCategory, type ModuleDefinition } from '$lib/modules/catalog';
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import MobileClipGrid from './MobileClipGrid.svelte';
  import ModulePosterTile from './ModulePosterTile.svelte';
  import { activeModuleId, setActiveModuleById } from './mobileSession';
  import { drawerOpen, drawerTab, type DrawerTab } from './mobileUi';

  /**
   * The browsers, as a drawer over the picture.
   *
   * The desktop keeps the FX library and the clip bank permanently open in a
   * 160px rail because it has 2552px to spend. A phone does not, and the picture
   * is the product — so the browsers become something you pull over the frame
   * and push back off it, translucent enough that the shot underneath is still
   * legible while you are choosing against it.
   *
   * Nothing in here mounts a canvas or a video. The clip tiles are poster frames
   * decoded at import; the module tiles are drawn diagrams.
   */

  const GROUPS: { key: ModuleCategory; label: string }[] = [
    { key: 'beat', label: 'BEAT FX' },
    { key: 'camera', label: 'CAMERA' },
    { key: 'film', label: 'FILM' }
  ];

  const catalog: ModuleDefinition[] = listCatalog();
  const grouped = GROUPS.map((group) => ({
    ...group,
    modules: catalog.filter((mod) => mod.category === group.key)
  }));

  const TABS: { key: DrawerTab; label: string }[] = [
    { key: 'clips', label: 'CLIPS' },
    { key: 'fx', label: 'FX' },
    { key: 'song', label: 'SONG' }
  ];

  const td = $derived($transportDisplay);

  // Lifted verbatim from TopBar so the phone and the rack never disagree about
  // what the analyser is doing.
  const rhyLabel = $derived.by(() => {
    switch (td.analysisStatus) {
      case 'analyzing':
        return 'RHY·…';
      case 'ready':
        return 'RHY·OK';
      case 'fallback':
        return 'RHY·RT';
      case 'error':
        return 'RHY·ERR';
      default:
        return td.usingUploadedTrack ? 'RHY·…' : 'RHY·OFF';
    }
  });

  const rhyColor = $derived.by(() => {
    switch (td.analysisStatus) {
      case 'analyzing':
        return '#f59e0b';
      case 'ready':
        return '#4ade80';
      case 'fallback':
        return '#38bdf8';
      case 'error':
        return '#ef4444';
      default:
        return td.usingUploadedTrack ? '#f59e0b' : '#4a5060';
    }
  });

  const rhyNote = $derived.by(() => {
    switch (td.analysisStatus) {
      case 'analyzing':
        return 'Finding the beat grid…';
      case 'ready':
        return td.analysisConfidence != null
          ? `Beat grid locked · ${Math.round(td.analysisConfidence * 100)}% confidence`
          : 'Beat grid locked';
      case 'fallback':
        return 'Following the beat in real time';
      case 'error':
        return td.analysisError ?? 'Analysis failed — following in real time';
      default:
        return td.usingUploadedTrack ? 'Preparing…' : 'Load a track to drive the effects';
    }
  });

  let audioInput = $state<HTMLInputElement>();
  let loadingTrack = $state(false);
  let pendingTrack = $state<File | null>(null);
  const hostedAnalysisAvailable = isHostedAnalysisEnabled();

  async function loadTrack(file: File, hostedAnalysis: boolean) {
    loadingTrack = true;
    try {
      await audioEngine.loadAudioFile(file, { hostedAnalysis });
    } finally {
      loadingTrack = false;
    }
  }

  async function onTrackChosen(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    // The hosted path uploads the file, so it needs a disclosure. The phone used
    // to have nowhere to show one and so never took that path at all -- every
    // song load fell to the weaker realtime grid. It has a sheet now, and the
    // decision is the same one the desktop bar makes, from the same stored
    // answer, so opting in on either surface carries to the other.
    const plan = planAudioUpload(readHostedAnalysisPreference(), hostedAnalysisAvailable);
    if (plan.action === 'ask') {
      pendingTrack = file;
      return;
    }
    await loadTrack(file, plan.hostedAnalysis);
  }

  async function resolveConsent(choice: 'analyze' | 'local' | 'cancel', remember: boolean) {
    const file = pendingTrack;
    pendingTrack = null;
    // Cancel leaves nothing loaded, matching the desktop bar.
    if (!file || choice === 'cancel') return;
    if (remember) setHostedAnalysisPreference(choice);
    await loadTrack(file, choice === 'analyze');
  }

  function close() {
    drawerOpen.set(false);
  }

  function chooseModule(id: string) {
    setActiveModuleById(id);
    close();
  }

  /**
   * Swipe-to-close.
   *
   * The panel scrolls vertically, so it cannot simply claim every gesture:
   * `touch-action: pan-y` lets the browser keep the scroll and hands us the
   * horizontal pans, and we only capture the pointer once the movement is
   * decisively leftward. The right-edge rail is the exception — it exists only
   * to be dragged, so it takes `touch-action: none` and starts immediately.
   */
  const DISMISS_FRACTION = 0.35;
  const INTENT_PX = 8;

  let panel = $state<HTMLElement>();
  let dragging = $state(false);
  let dragX = $state(0);
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let suppressClick = false;

  /** Capture is an optimisation, not a requirement — never let it kill the drag. */
  function capture(id: number) {
    try {
      panel?.setPointerCapture(id);
    } catch {
      /* pointer already gone */
    }
  }

  function beginDrag(e: PointerEvent, immediate = false) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    suppressClick = false;
    if (immediate) {
      dragging = true;
      dragX = 0;
      capture(e.pointerId);
    }
  }

  function moveDrag(e: PointerEvent) {
    if (pointerId !== e.pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!dragging) {
      if (Math.abs(dx) < INTENT_PX && Math.abs(dy) < INTENT_PX) return;
      // Vertical or rightward: the list owns it, and we stay out of the way for
      // the rest of this gesture.
      if (dx > 0 || Math.abs(dy) >= Math.abs(dx)) {
        pointerId = null;
        return;
      }
      dragging = true;
      capture(e.pointerId);
    }

    suppressClick = true;
    dragX = Math.min(0, dx);
  }

  function endDrag(e: PointerEvent) {
    if (pointerId !== e.pointerId) return;
    if (panel?.hasPointerCapture(e.pointerId)) panel.releasePointerCapture(e.pointerId);
    pointerId = null;
    if (!dragging) return;

    const width = panel?.offsetWidth ?? 1;
    const dismissed = -dragX > width * DISMISS_FRACTION;
    // Drop the inline transform in the same tick so the class transition — not
    // the drag — carries the panel the rest of the way, open or shut.
    dragging = false;
    dragX = 0;
    if (dismissed) close();
  }

  function cancelDrag(e: PointerEvent) {
    if (pointerId !== e.pointerId) return;
    pointerId = null;
    dragging = false;
    dragX = 0;
  }
</script>

<!-- Above the drawer: the answer decides whether the file leaves the device, so
     it must not be reachable past or dismissed by the panel underneath. -->
{#if pendingTrack}
  <MobileAnalysisConsent fileName={pendingTrack.name} onResolve={resolveConsent} />
{/if}

<!-- Cross-fades rather than mounting: the panel must be able to animate out, and
     a scrim that appears instantly under a sliding panel reads as a flash. -->
<button
  type="button"
  class="drawer-scrim"
  class:is-open={$drawerOpen}
  tabindex={$drawerOpen ? 0 : -1}
  aria-label="Close browser"
  aria-hidden={!$drawerOpen}
  onclick={close}
></button>

<aside
  bind:this={panel}
  class="drawer"
  class:is-open={$drawerOpen}
  class:is-dragging={dragging}
  aria-label="Clip and effect browsers"
  aria-hidden={!$drawerOpen}
  inert={!$drawerOpen}
  style={dragging ? `transform: translateX(${dragX}px);` : undefined}
  onpointerdown={(e) => beginDrag(e)}
  onpointermove={moveDrag}
  onpointerup={endDrag}
  onpointercancel={cancelDrag}
  onclickcapture={(e) => {
    // A drag that ended over a tile must not also pick that tile.
    if (!suppressClick) return;
    suppressClick = false;
    e.stopPropagation();
    e.preventDefault();
  }}
>
  <header class="drawer-head">
    <div class="drawer-tabs" role="tablist" aria-label="Browser">
      {#each TABS as tab (tab.key)}
        <button
          type="button"
          role="tab"
          class="drawer-tab"
          class:is-on={$drawerTab === tab.key}
          aria-selected={$drawerTab === tab.key}
          onclick={() => drawerTab.set(tab.key)}
        >
          {tab.label}
        </button>
      {/each}
    </div>
    <button type="button" class="drawer-close" aria-label="Close browser" onclick={close}>
      <X size={20} />
    </button>
  </header>

  <div class="drawer-body">
    {#if $drawerTab === 'clips'}
      <MobileClipGrid />
    {:else if $drawerTab === 'fx'}
      <div class="fx">
        {#each grouped as group (group.key)}
          <span class="fx-group">{group.label}</span>
          {#each group.modules as mod (mod.id)}
            <ModulePosterTile
              moduleId={mod.id}
              active={$activeModuleId === mod.id}
              onclick={() => chooseModule(mod.id)}
            />
          {/each}
        {/each}
        <p class="fx-hint">One effect runs at a time. Picking one swaps it under the clip.</p>
      </div>
    {:else}
      <div class="song">
        <button
          type="button"
          class="song-load"
          onclick={() => audioInput?.click()}
          disabled={loadingTrack}
        >
          <Upload size={18} />
          {loadingTrack ? 'LOADING…' : 'LOAD A TRACK'}
        </button>
        <input
          bind:this={audioInput}
          type="file"
          accept={AUDIO_FILE_ACCEPT}
          hidden
          onchange={(e) => void onTrackChosen(e.currentTarget)}
        />

        <div class="song-card">
          <span class="song-label">TRACK</span>
          <span class="song-name" class:is-empty={!td.trackName}>
            {td.trackName || 'No track loaded'}
          </span>

          <div class="song-stats">
            <div class="song-stat">
              <span class="song-label">BPM</span>
              <span class="song-bpm">
                {Math.round(td.bpm)}
                {#if td.bpmLocked}<span class="song-lock">LOCK</span>{/if}
              </span>
            </div>
            <div class="song-stat">
              <span class="song-label">ANALYSIS</span>
              <span
                class="song-rhy"
                style="border-color:{rhyColor}55;color:{rhyColor}"
                title={rhyNote}
              >
                {rhyLabel}
              </span>
            </div>
          </div>

          <p class="song-note">{rhyNote}</p>
        </div>

        <p class="song-hint">
          The track drives every beat-synced effect. Without one the modules still run, they just
          have nothing to run against.
        </p>
      </div>
    {/if}
  </div>

  <!-- Pure gesture surface: it has no other job, so it can afford to take the
       whole gesture instead of waiting to see which way the finger goes. -->
  <div
    class="drawer-rail"
    aria-hidden="true"
    onpointerdown={(e) => {
      e.stopPropagation();
      beginDrag(e, true);
    }}
  >
    <span class="drawer-grip"></span>
  </div>
</aside>

<style>
  .drawer-scrim {
    position: fixed;
    inset: 0;
    z-index: 60;
    margin: 0;
    padding: 0;
    border: none;
    background: rgba(0, 0, 0, 0.5);
    opacity: 0;
    pointer-events: none;
    cursor: pointer;
    transition: opacity 0.3s cubic-bezier(0.2, 0, 0, 1);
    -webkit-tap-highlight-color: transparent;
  }
  .drawer-scrim.is-open {
    opacity: 1;
    pointer-events: auto;
  }

  .drawer {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 61;
    box-sizing: border-box;
    /* 85% leaves a strip of the picture showing, which is the point — you are
       choosing against the shot, not away from it. */
    width: 85vw;
    max-width: 85vw;
    display: flex;
    flex-direction: column;
    background: rgba(12, 12, 12, 0.6);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-right: 1px solid rgba(255, 255, 255, 0.15);
    transform: translateX(-100%);
    transition: transform 0.3s cubic-bezier(0.2, 0, 0, 1);
    font-family: var(--font-ui);
    color: #dfe6ee;
    padding-left: env(safe-area-inset-left, 0px);
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    /* The body scrolls; we take the horizontal pans only. */
    touch-action: pan-y;
    overscroll-behavior: contain;
  }
  .drawer.is-open {
    transform: translateX(0);
  }
  /* A finger already owns the panel — a 300ms ease would lag behind it. */
  .drawer.is-dragging {
    transition: none;
  }

  .drawer-head {
    flex: 0 0 auto;
    display: flex;
    align-items: stretch;
    gap: 6px;
    padding: 0 6px 0 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    touch-action: none;
  }

  .drawer-tabs {
    display: flex;
    align-items: stretch;
    gap: 0;
    flex: 1 1 auto;
    min-width: 0;
  }

  .drawer-tab {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    height: 36px;
    padding: 0 8px 2px;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    color: #424c58;
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.18em;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition:
      color 0.15s,
      border-color 0.15s;
  }
  .drawer-tab.is-on {
    border-bottom-color: rgba(90, 159, 212, 0.65);
    color: #c8d2dc;
  }

  .drawer-close {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    background: transparent;
    color: #424c58;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .drawer-close:active {
    color: #dfe6ee;
  }

  .drawer-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  .drawer-rail {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 18px;
    display: grid;
    place-items: center;
    /* This surface exists to be dragged. */
    touch-action: none;
    cursor: grab;
  }
  .drawer-grip {
    width: 3px;
    height: 44px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.18);
  }

  /* ---- FX tab ---- */

  .fx {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 10px 24px;
  }

  .fx-group {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.2em;
    color: #3f4653;
    white-space: nowrap;
  }
  .fx-group:first-child {
    margin-top: 0;
  }
  .fx-group::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.07);
  }

  .fx-hint {
    margin: 10px 0 0;
    font-size: 11px;
    line-height: 1.4;
    letter-spacing: 0.04em;
    color: #3f4653;
  }

  /* ---- SONG tab ---- */

  .song {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 10px 24px;
  }

  .song-load {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 52px;
    border: 1px solid #23282e;
    border-radius: 3px;
    background: #131416;
    color: #c8d2dc;
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.18em;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .song-load:active:not(:disabled) {
    background: #1c1f23;
  }
  .song-load:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .song-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 10px;
    border: 1px solid #0d0e0f;
    border-radius: 3px;
    background: #0a0b0c;
  }

  .song-label {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.2em;
    color: #3f4653;
  }

  .song-name {
    font-size: 13px;
    letter-spacing: 0.04em;
    color: #dfe6ee;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .song-name.is-empty {
    color: #5a6472;
  }

  .song-stats {
    display: flex;
    gap: 10px;
    margin-top: 4px;
  }
  .song-stat {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .song-bpm {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 18px;
    font-variant-numeric: tabular-nums;
    color: #e2a030;
    line-height: 1;
  }
  .song-lock {
    font-family: var(--font-ui);
    font-size: 11px;
    letter-spacing: 0.14em;
    color: #5a6472;
  }

  .song-rhy {
    align-self: flex-start;
    padding: 3px 6px;
    border: 1px solid;
    border-radius: 2px;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.12em;
    line-height: 1.2;
  }

  .song-note {
    margin: 2px 0 0;
    font-size: 11px;
    line-height: 1.4;
    letter-spacing: 0.04em;
    color: #7d8794;
  }

  .song-hint {
    margin: 0;
    font-size: 11px;
    line-height: 1.45;
    letter-spacing: 0.04em;
    color: #3f4653;
  }
</style>
