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
      // Vertical or rightward: the list owns it. Only a deliberate swipe back
      // toward the shelf's left edge dismisses it.
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

  <!-- Pure gesture surface: the shelf's exposed edge always dismisses left. -->
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
    background: var(--m-scrim, rgba(4, 6, 7, 0.1));
    opacity: 0;
    pointer-events: none;
    cursor: pointer;
    transition: opacity var(--m-dur, 220ms) var(--m-ease, cubic-bezier(0.2, 0, 0, 1));
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
    right: auto;
    z-index: 61;
    box-sizing: border-box;
    /* Keep enough of the live picture exposed to make this read as a shelf,
       not a page transition. The cap keeps it compact on forced-mobile QA. */
    width: min(86vw, 380px);
    max-width: 86vw;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--m-glass, rgba(8, 10, 12, 0.22));
    backdrop-filter: var(--m-blur, blur(4px));
    -webkit-backdrop-filter: var(--m-blur, blur(4px));
    border-top: none;
    border-right: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0 var(--m-radius-sheet, 20px) var(--m-radius-sheet, 20px) 0;
    transform: translateX(-110%);
    transition: transform var(--m-dur, 220ms) var(--m-ease, cubic-bezier(0.2, 0, 0, 1));
    font-family: var(--font-ui);
    color: var(--m-ink, #e5e7eb);
    padding-left: var(--m-safe-left, 0px);
    padding-right: 8px;
    padding-top: var(--m-safe-top, 0px);
    padding-bottom: var(--m-safe-bottom, 0px);
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
    padding: 8px 4px 0 12px;
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
    height: var(--m-tap, 44px);
    padding: 0 8px 2px;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--m-ink-faint, #555e6a);
    font-family: var(--font-ui);
    font-size: var(--m-text-xs, 11px);
    font-weight: 600;
    letter-spacing: 0.16em;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition:
      color 0.15s,
      border-color 0.15s;
  }
  .drawer-tab.is-on {
    border-bottom-color: var(--m-accent, #2dd4bf);
    color: var(--m-ink, #e5e7eb);
  }

  .drawer-close {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: var(--m-tap, 44px);
    height: var(--m-tap, 44px);
    padding: 0;
    border: none;
    background: transparent;
    color: var(--m-ink-faint, #555e6a);
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
    inset: 0 0 0 auto;
    width: 18px;
    display: grid;
    place-items: center;
    touch-action: none;
    cursor: grab;
  }
  .drawer-grip {
    width: 4px;
    height: 40px;
    border-radius: var(--m-radius-pill, 999px);
    background: rgba(255, 255, 255, 0.28);
  }

  /* ---- FX tab ---- */

  .fx {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 12px 28px;
  }

  .fx-group {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.2em;
    color: var(--m-ink-faint, #555e6a);
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
    color: var(--m-ink-faint, #555e6a);
  }

  /* ---- SONG tab ---- */

  .song {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px 12px 28px;
  }

  .song-load {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: var(--m-tap-lg, 48px);
    border: 1px solid color-mix(in srgb, var(--m-accent, #2dd4bf) 28%, var(--m-line-soft, #1e2226));
    border-radius: var(--m-radius, 12px);
    background: color-mix(in srgb, var(--m-accent, #2dd4bf) 8%, var(--m-raised, #17191c));
    color: var(--m-accent-soft, #99f6e4);
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
    border: 1px solid var(--m-line-soft, #1e2226);
    border-radius: var(--m-radius, 12px);
    background: rgba(8, 10, 12, 0.28);
  }

  .song-label {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.2em;
    color: var(--m-ink-faint, #555e6a);
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
    border-radius: var(--m-radius-xs, 6px);
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
    color: var(--m-ink-faint, #555e6a);
  }

  @media (prefers-reduced-motion: reduce) {
    .drawer,
    .drawer-scrim {
      transition: none;
    }
  }
</style>
