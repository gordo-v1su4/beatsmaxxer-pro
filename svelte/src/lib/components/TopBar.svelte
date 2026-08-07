<script lang="ts">
  import { Upload, Play, Square, Music4, Disc3, Pause, Film, X, Undo2, Redo2, Shuffle } from '@lucide/svelte';
  import { audioEngine } from '$lib/audio';
  import { canRedo, canUndo, fxHold, redoRackParams, undoRackParams } from '$lib/stores/rack';
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import TopBtn from '$lib/components/rack/TopBtn.svelte';
  import { FACTORY_PRESETS, selectedPreset, selectPreset, type PresetName } from '$lib/stores/presets';
  import { isHostedAnalysisEnabled } from '$lib/audio/essentia';
  import {
    readHostedAnalysisPreference,
    setHostedAnalysisPreference,
    type HostedAnalysisPreference
  } from '$lib/audio/hostedAnalysisPreference';

  interface Props {
    onRandomize: () => void;
    onClear: () => void;
    onLoadClips?: (files: File[]) => void | Promise<void>;
    loadedClipCount?: number;
    clipSlotCount?: number;
  }

  let {
    onRandomize,
    onClear,
    onLoadClips,
    loadedClipCount = 0,
    clipSlotCount = 0
  }: Props = $props();

  const TEMPO_STEP = 0.1;
  const TEMPO_MIN = 0.5;
  const TEMPO_MAX = 2;

  let tapFlash = $state(false);
  let bpmEdit = $state<string | null>(null);
  let tapTimes: number[] = [];
  let soundTouch = $state(audioEngine.getSoundTouchState());

  let audioInput: HTMLInputElement;
  let clipsInput: HTMLInputElement;
  let bpmInput = $state<HTMLInputElement>();
  let songButton = $state<HTMLButtonElement>();
  let analyzeButton = $state<HTMLButtonElement>();
  let localOnlyButton = $state<HTMLButtonElement>();
  let cancelButton = $state<HTMLButtonElement>();
  let pendingAudioFile = $state<File | null>(null);
  let rememberChoice = $state(false);
  let analysisPreference = $state<HostedAnalysisPreference>('ask');
  const hostedAnalysisAvailable = isHostedAnalysisEnabled();

  $effect(() => {
    analysisPreference = readHostedAnalysisPreference();
  });

  $effect(() => {
    const td = $transportDisplay;
    void td.beat;
    void td.playing;
    void td.amplitude;
    soundTouch = audioEngine.getSoundTouchState();
  });

  const td = $derived($transportDisplay);
  const beatOn = $derived(td.beatPhase < 0.15);
  const beatInBar = $derived(Math.floor(td.beat) % 4);

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

  const rhyTitle = $derived.by(() => {
    if (td.analysisStatus === 'ready') {
      const conf =
        td.analysisConfidence != null ? ` · ${Math.round(td.analysisConfidence * 100)}% conf` : '';
      return `Rhythm analysis succeeded — beat grid from Essentia (analyze once, shift in real time)${conf}`;
    }
    return td.analysisError ?? 'Rhythm analysis status';
  });

  function snapTempo(value: number) {
    const clamped = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, value));
    return Math.round(clamped / TEMPO_STEP) * TEMPO_STEP;
  }

  function refreshSoundTouch() {
    soundTouch = audioEngine.getSoundTouchState();
  }

  function setTempo(value: number) {
    audioEngine.setTempo(snapTempo(value));
    refreshSoundTouch();
  }

  function nudgeTempo(delta: number) {
    setTempo(soundTouch.tempo + delta);
  }

  function nudgePitch(delta: number) {
    audioEngine.setPitch(soundTouch.pitchSemitones + delta);
    refreshSoundTouch();
  }

  function nudgeKey(delta: number) {
    audioEngine.nudgeKey(delta);
    refreshSoundTouch();
  }

  function commitBpm() {
    if (bpmEdit !== null) {
      const v = parseFloat(bpmEdit);
      if (Number.isFinite(v) && v >= 60 && v <= 200) audioEngine.setBPM(v);
    }
    bpmEdit = null;
  }

  function beginBpmEdit() {
    bpmEdit = String(Math.round(td.bpm));
    setTimeout(() => bpmInput?.focus(), 0);
  }

  function handleTap() {
    const now = performance.now();
    tapTimes = tapTimes.filter((t) => now - t < 3000);
    tapTimes.push(now);
    if (tapTimes.length >= 2) {
      const diffs: number[] = [];
      for (let i = 1; i < tapTimes.length; i++) {
        diffs.push(tapTimes[i]! - tapTimes[i - 1]!);
      }
      const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      audioEngine.setBPM(Math.round(60000 / avg));
    }
    tapFlash = true;
    setTimeout(() => (tapFlash = false), 100);
  }

  async function togglePlay() {
    if (td.playing) {
      audioEngine.stop('operator');
    } else {
      await audioEngine.start();
    }
  }

  async function handleAudioUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!file) return;

    // A remembered choice is still an explicit one, so honour it rather than
    // re-prompting. Only ever skips forward from a stored answer; never assumed.
    const remembered = readHostedAnalysisPreference();
    if (remembered === 'analyze' && hostedAnalysisAvailable) {
      await audioEngine.loadAudioFile(file, { hostedAnalysis: true });
      return;
    }
    if (remembered === 'local') {
      await audioEngine.loadAudioFile(file, { hostedAnalysis: false });
      return;
    }

    rememberChoice = false;
    pendingAudioFile = file;
    setTimeout(() => localOnlyButton?.focus(), 0);
  }

  async function resolveAudioUpload(choice: 'analyze' | 'local' | 'cancel') {
    const file = pendingAudioFile;
    pendingAudioFile = null;
    if (!file || choice === 'cancel') {
      songButton?.focus();
      return;
    }
    if (rememberChoice) {
      setHostedAnalysisPreference(choice);
      analysisPreference = choice;
    }
    await audioEngine.loadAudioFile(file, { hostedAnalysis: choice === 'analyze' });
  }

  function resetAnalysisPreference() {
    setHostedAnalysisPreference('ask');
    analysisPreference = 'ask';
  }

  async function handleClipsUpload(e: Event) {
    const files = [...((e.target as HTMLInputElement).files ?? [])];
    if (files.length > 0) await onLoadClips?.(files);
    (e.target as HTMLInputElement).value = '';
  }
</script>

<div class="topbar-shell">
  <input bind:this={audioInput} type="file" accept="audio/*" class="hidden" onchange={handleAudioUpload} />
  <input bind:this={clipsInput} type="file" accept="video/*" multiple class="hidden" onchange={handleClipsUpload} />

  <div class="topbar-row">
    <div class="topbar-main">
    <div class="topbar-brand">
      <div
        class="status-dot"
        style="background:{td.playing ? '#22c55e' : '#333a42'};box-shadow:{td.playing ? '0 0 6px #22c55e88' : 'none'}"
      ></div>
      <span class="brand-text">BEATSMAXXING</span>
      <span class="brand-x">×</span>
      <span class="brand-sub">CHE</span>
    </div>

    <div class="divider"></div>

    <button type="button" onclick={togglePlay} class="transport-btn" data-playing={td.playing}>
      {#if td.playing}<Square size={9} />{:else}<Play size={9} />{/if}
      {td.playing ? 'STOP' : 'PLAY'}
    </button>

    <button bind:this={songButton} type="button" onclick={() => audioInput?.click()} class="transport-btn" data-active={td.usingUploadedTrack}>
      <Upload size={10} /> SONG
    </button>

    {#if analysisPreference !== 'ask'}
      <button
        type="button"
        onclick={resetAnalysisPreference}
        class="transport-btn consent-memo"
        title="New songs are loaded {analysisPreference === 'analyze'
          ? 'with hosted analysis'
          : 'locally only'} without asking. Click to be asked again."
      >
        AUTO·{analysisPreference === 'analyze' ? 'RHY' : 'LOC'}
      </button>
    {/if}

    {#if onLoadClips}
      <button
        type="button"
        onclick={() => clipsInput?.click()}
        title="Load video clips into rack slots ({loadedClipCount}/{clipSlotCount} filled)"
        class="transport-btn"
        data-clips={loadedClipCount > 0}
      >
        <Film size={10} /> CLIPS
        <span class="clip-count">{loadedClipCount}/{clipSlotCount}</span>
      </button>
    {/if}

    {#if td.usingUploadedTrack}
      <button type="button" onclick={() => audioEngine.clearUploadedTrack()} class="transport-btn transport-btn-danger">
        <X size={10} /> REMOVE
      </button>
    {/if}

    <div class="divider"></div>

    <div class="audio-group">
      <div
        class="bpm-block"
        title={td.bpmLocked ? 'Manual BPM — drives playback tempo (click BPM·M to restore Essentia)' : 'Effective BPM — follows tempo slider; click to type'}
      >
        <div
          class="beat-led"
          style="background:{beatOn && td.playing ? '#f59e0b' : '#1e2226'};box-shadow:{beatOn && td.playing ? '0 0 5px #f59e0b' : 'none'}"
        ></div>
        <div class="bpm-digit-slot">
          {#if bpmEdit !== null}
            <input
              bind:this={bpmInput}
              value={bpmEdit}
              oninput={(e) => (bpmEdit = e.currentTarget.value.replace(/[^0-9.]/g, ''))}
              onblur={commitBpm}
              onkeydown={(e) => {
                if (e.key === 'Enter') commitBpm();
                if (e.key === 'Escape') bpmEdit = null;
              }}
              class="bpm-input"
            />
          {:else}
            <span
              role="button"
              tabindex="0"
              onclick={beginBpmEdit}
              onkeydown={(e) => e.key === 'Enter' && beginBpmEdit()}
              class="bpm-value"
            >
              {Math.round(td.bpm).toString().padStart(3, '0')}
            </span>
          {/if}
        </div>
        <span
          role="button"
          tabindex="0"
          onclick={() => {
            if (td.bpmLocked) audioEngine.unlockBPM();
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter' && td.bpmLocked) audioEngine.unlockBPM();
          }}
          class="bpm-mode"
          style="color:{td.bpmLocked ? '#e2a030' : '#4a5060'};cursor:{td.bpmLocked ? 'pointer' : 'default'}"
        >
          {td.bpmLocked ? 'BPM·M' : 'BPM·A'}
        </span>
      </div>

      <div class="beat-dots">
        {#each [0, 1, 2, 3] as i (i)}
          {@const active = i === beatInBar && td.playing}
          <div
            style="background:{active ? '#38bdf8' : '#1a1e24'};box-shadow:{active ? '0 0 5px #38bdf8' : 'none'};border-color:{active ? '#38bdf844' : '#141618'}"
          ></div>
        {/each}
      </div>

      <div class="phase-bar">
        <div
          style="width:{td.beatPhase * 100}%;border-right:{td.playing ? '1px solid #22c55e' : 'none'};transition:{td.beatPhase < 0.05 ? 'none' : 'width 0.02s linear'}"
        ></div>
        <span>{td.beatPhase.toFixed(2)}</span>
      </div>
    </div>

    <div class="rhy-badge" title={rhyTitle} style="border-color:{rhyColor}33;color:{rhyColor}">
      <Disc3 size={10} />
      {rhyLabel}
    </div>

    <button type="button" onclick={handleTap} class="tap-btn" data-flash={tapFlash}>TAP</button>

    <div class="divider"></div>

    <div class="step-block key-block" title="Musical key — SoundTouch pitch shift">
      <button type="button" onclick={() => nudgeKey(-1)} class="step-btn" aria-label="Key down">−</button>
      <span>KEY·{soundTouch.key}</span>
      <button type="button" onclick={() => nudgeKey(1)} class="step-btn" aria-label="Key up">+</button>
    </div>

    <div class="step-block pitch-block" title="Pitch shift — audio only, beat markers unchanged">
      <button type="button" onclick={() => nudgePitch(-1)} class="step-btn" aria-label="Pitch down">−</button>
      <span>PITCH·{soundTouch.pitchSemitones >= 0 ? '+' : ''}{soundTouch.pitchSemitones}</span>
      <button type="button" onclick={() => nudgePitch(1)} class="step-btn" aria-label="Pitch up">+</button>
    </div>

    <div class="tempo-block" class:soundtouch-on={soundTouch.active} title="Tempo — changes playback speed and effective BPM (0.5×–2×)">
      <button type="button" onclick={() => nudgeTempo(-TEMPO_STEP)} class="step-btn" aria-label="Decrease tempo">−</button>
      <span class="slider-label">TEMPO</span>
      <input
        type="range"
        min={TEMPO_MIN}
        max={TEMPO_MAX}
        step={TEMPO_STEP}
        value={soundTouch.tempo}
        oninput={(e) => setTempo(Number(e.currentTarget.value))}
      />
      <span class="slider-val">{soundTouch.tempo.toFixed(1)}×</span>
      <button type="button" onclick={() => nudgeTempo(TEMPO_STEP)} class="step-btn" aria-label="Increase tempo">+</button>
    </div>

    <div class="slider-block vol-block" title="Master volume">
      <span class="slider-label">VOL</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={soundTouch.volume}
        oninput={(e) => {
          audioEngine.setVolume(Number(e.currentTarget.value));
          refreshSoundTouch();
        }}
      />
    </div>

    <select
      class="preset-select"
      title="Factory preset"
      value={$selectedPreset}
      onchange={(e) => selectPreset(e.currentTarget.value as PresetName)}
    >
      {#each FACTORY_PRESETS as preset (preset)}
        <option value={preset}>{preset}</option>
      {/each}
    </select>
    </div>

    <div class="topbar-actions">
    <TopBtn label="UNDO" onclick={undoRackParams} disabled={!$canUndo}>
      {#snippet icon()}<Undo2 size={10} />{/snippet}
    </TopBtn>
    <TopBtn label="REDO" onclick={redoRackParams} disabled={!$canRedo}>
      {#snippet icon()}<Redo2 size={10} />{/snippet}
    </TopBtn>
    <TopBtn label="RANDOMIZE" onclick={onRandomize} accent>
      {#snippet icon()}<Shuffle size={10} />{/snippet}
    </TopBtn>
    <TopBtn label="CLEAR" onclick={onClear} danger>
      {#snippet icon()}<X size={10} />{/snippet}
    </TopBtn>

    <button
      type="button"
      onclick={() => fxHold.update((h) => !h)}
      title={$fxHold ? 'Resume FX preview shaders' : 'Freeze all FX preview shaders'}
      aria-label={$fxHold ? 'Resume FX shaders' : 'Hold FX shaders'}
      class="hold-btn"
      data-active={$fxHold}
    >
      {#if $fxHold}<Play size={11} />{:else}<Pause size={11} />{/if}
    </button>

    <div class="divider"></div>

    <div class="topbar-track">
      {#if td.usingUploadedTrack && td.trackName}
        <div class="track-chip">
          <Music4 size={11} color="#38bdf8" />
          <span class="track-name" style="color:#8ec5ff">{td.trackName}</span>
        </div>
      {/if}

      <div class="vu-meter">
        {#each Array.from({ length: 16 }) as _, i (i)}
          {@const threshold = i / 16}
          {@const lit = td.playing && td.amplitude * 3.4 > threshold}
          {@const c = i > 13 ? '#ef4444' : i > 10 ? '#eab308' : '#22c55e'}
          <div
            style="height:{4 + (i < 8 ? i : 15 - i)}px;background:{lit ? c : '#1a1e24'};box-shadow:{lit ? `0 0 3px ${c}66` : 'none'}"
          ></div>
        {/each}
      </div>
    </div>
    </div>
  </div>
</div>

{#if pendingAudioFile}
  <div
    class="analysis-consent-backdrop"
  >
    <div
      class="analysis-consent-dialog"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="analysis-consent-title"
      aria-describedby="analysis-consent-description"
      onkeydown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          void resolveAudioUpload('cancel');
        } else if (e.key === 'Tab' && !e.shiftKey && document.activeElement === cancelButton) {
          e.preventDefault();
          analyzeButton?.focus();
        } else if (e.key === 'Tab' && e.shiftKey && document.activeElement === analyzeButton) {
          e.preventDefault();
          cancelButton?.focus();
        }
      }}
    >
      <h2 id="analysis-consent-title">Analyze this upload?</h2>
      <p id="analysis-consent-description">
        Analyze loads the song locally and sends a bounded, prepared excerpt to the configured
        hosted analysis service. Repository evidence does not establish that service's retention
        or ownership terms.
      </p>
      <p class="analysis-consent-file">{pendingAudioFile.name}</p>
      <label class="analysis-consent-remember">
        <input type="checkbox" bind:checked={rememberChoice} />
        <span>Remember this choice and apply it to new songs automatically</span>
      </label>
      <div class="analysis-consent-actions">
        <button
          bind:this={analyzeButton}
          type="button"
          class="consent-btn consent-btn-analyze"
          onclick={() => resolveAudioUpload('analyze')}
        >ANALYZE</button>
        <button
          bind:this={localOnlyButton}
          type="button"
          class="consent-btn"
          onclick={() => resolveAudioUpload('local')}
        >LOCAL ONLY</button>
        <button
          bind:this={cancelButton}
          type="button"
          class="consent-btn consent-btn-cancel"
          onclick={() => resolveAudioUpload('cancel')}
        >CANCEL</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .hidden {
    display: none;
  }

  /* Rhythm analysis is BEAT FX work, so the prompt borrows that family's teal
     (see modules/palette.ts) instead of a generic UI blue. */
  .analysis-consent-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(6, 8, 9, 0.62);
    backdrop-filter: blur(10px) saturate(0.7);
    -webkit-backdrop-filter: blur(10px) saturate(0.7);
  }

  .analysis-consent-dialog {
    width: min(440px, 100%);
    padding: 18px;
    border: 1px solid #1d2b2b;
    /* The rack is square-cornered throughout — 2px is the house value. */
    border-radius: 2px;
    background:
      radial-gradient(120% 100% at 50% 0%, rgba(20, 184, 166, 0.07), transparent 70%),
      rgba(10, 12, 13, 0.92);
    box-shadow:
      0 24px 80px rgba(0, 0, 0, 0.9),
      inset 0 1px 0 rgba(153, 246, 228, 0.07);
    color: #8f9aa6;
    font-family: var(--font-ui);
  }

  /* Rack titles are 10px/0.14em uppercase; 15px/0.08em read as a different
     app's dialog sitting on top of this one. */
  .analysis-consent-dialog h2 {
    margin: 0 0 9px;
    color: #d8e4e2;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .analysis-consent-dialog p {
    margin: 0;
    font-size: 11px;
    line-height: 1.55;
  }

  .analysis-consent-file {
    margin-top: 10px !important;
    overflow: hidden;
    color: #99f6e4;
    font-family: var(--font-mono);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .analysis-consent-remember {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
    color: #79838f;
    cursor: pointer;
    font-size: 10px;
    line-height: 1.35;
  }

  .analysis-consent-remember:hover {
    color: #9aa5b1;
  }

  /* The platform checkbox is a white box with a blue tick and cannot be tinted
     to the rack's palette, so it is drawn here instead. */
  .analysis-consent-remember input {
    flex: none;
    display: grid;
    place-content: center;
    width: 13px;
    height: 13px;
    margin: 0;
    border: 1px solid #37414a;
    border-radius: 2px;
    background: #0a0c0d;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
    transition:
      border-color 120ms ease,
      background 120ms ease;
  }

  .analysis-consent-remember input::after {
    content: '';
    width: 8px;
    height: 8px;
    background: #14b8a6;
    clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
    transform: scale(0);
    transition: transform 120ms ease;
  }

  .analysis-consent-remember input:checked {
    border-color: #14b8a6;
    background: #06201d;
  }

  .analysis-consent-remember input:checked::after {
    transform: scale(1);
  }

  .analysis-consent-remember input:focus-visible {
    outline: 2px solid #14b8a6;
    outline-offset: 2px;
  }

  .analysis-consent-actions {
    display: flex;
    justify-content: flex-end;
    gap: 7px;
    margin-top: 16px;
  }

  .consent-memo {
    color: #99f6e4;
    letter-spacing: 0.06em;
  }

  .consent-btn {
    min-height: 30px;
    padding: 0 12px;
    border: 1px solid #2a3138;
    border-radius: 2px;
    background: #101315;
    color: #8d96a5;
    cursor: pointer;
    font-family: var(--font-ui);
    font-size: 9px;
    font-weight: 500;
    letter-spacing: 0.08em;
    transition:
      border-color 120ms ease,
      background 120ms ease,
      color 120ms ease;
  }

  .consent-btn:hover {
    border-color: #3a434c;
    color: #c2cad4;
  }

  .consent-btn:focus-visible {
    outline: 2px solid #14b8a6;
    outline-offset: 2px;
  }

  /* Primary action: the only one that sends audio anywhere. */
  .consent-btn-analyze {
    border-color: #14b8a6;
    background: linear-gradient(180deg, #0d2b28, #08201d);
    color: #99f6e4;
    box-shadow: inset 0 1px 0 rgba(153, 246, 228, 0.12);
  }

  .consent-btn-analyze:hover {
    border-color: #2dd4bf;
    color: #ccfbf1;
  }

  .consent-btn-cancel {
    color: #a15f5f;
  }

  .consent-btn-cancel:hover {
    color: #c46b6b;
  }

  .topbar-shell {
    flex-shrink: 0;
    width: 100%;
    overflow: hidden;
    font-family: var(--font-ui);
    background: linear-gradient(180deg, #202224 0%, #18191b 60%, #141516 100%);
    border-bottom: 2px solid #0a0b0c;
    border-top: 1px solid #2a2c2e;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.7);
    position: relative;
    z-index: 10;
  }

  .topbar-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 8px;
    height: 46px;
    width: 100%;
    min-width: 0;
  }

  .topbar-main {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
  }

  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }

  .topbar-brand {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    transition: all 0.2s;
  }

  .brand-text {
    font-family: var(--font-brand);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.14em;
    color: #7a8090;
  }

  .brand-x {
    color: #2a3040;
    font-size: 11px;
  }

  .brand-sub {
    font-family: var(--font-brand);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.14em;
    color: #556070;
  }

  .transport-btn {
    height: 26px;
    padding-inline: 10px;
    background: linear-gradient(180deg, #1c2020, #141818);
    border: 1px solid #252729;
    border-radius: 3px;
    cursor: pointer;
    color: #4a5565;
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: 500;
    font-size: 9px;
    letter-spacing: 0.1em;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
    transition: all 0.1s;
    flex-shrink: 0;
  }

  .transport-btn[data-playing='true'] {
    background: linear-gradient(180deg, #1a2a1a, #121c12);
    border-color: #22c55e44;
    color: #22c55e;
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.2);
  }

  .transport-btn[data-active='true'] {
    color: #38bdf8;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.18);
  }

  .transport-btn[data-clips='true'] {
    color: #a78bfa;
    box-shadow: 0 0 8px rgba(167, 139, 250, 0.18);
  }

  .transport-btn-danger {
    background: linear-gradient(180deg, #241919, #1b1212);
    border-color: #462828;
    color: #d56b6b;
  }

  .clip-count {
    font-family: var(--font-mono);
    font-size: 8px;
    color: #4a5060;
  }

  .topbar-track {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .track-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    min-width: 0;
    max-width: 180px;
    padding-inline: 8px;
    background: linear-gradient(180deg, #101214, #0b0d0f);
    border: 1px solid #171a1d;
    border-radius: 3px;
    box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.7);
    overflow: hidden;
  }

  .track-name {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.03em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .vu-meter {
    display: flex;
    gap: 1px;
    align-items: flex-end;
    height: 20px;
    flex-shrink: 0;
  }

  .vu-meter div {
    width: 3px;
    border-radius: 0.5px;
    transition: background 0.04s;
  }

  .audio-group {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
  }

  .bpm-block,
  .beat-dots,
  .phase-bar,
  .rhy-badge,
  .step-block,
  .tempo-block,
  .slider-block {
    height: 26px;
    background: linear-gradient(180deg, #0e1012, #0a0c0e);
    border: 1px solid #1a1c1e;
    border-radius: 2px;
    box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.7);
    flex-shrink: 0;
  }

  .bpm-block {
    display: flex;
    align-items: center;
    gap: 5px;
    padding-inline: 8px;
    width: 118px;
    min-width: 118px;
    max-width: 118px;
    box-sizing: border-box;
  }

  .bpm-digit-slot {
    width: 36px;
    min-width: 36px;
    max-width: 36px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .beat-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    transition: background 0.04s, box-shadow 0.04s;
  }

  .bpm-input {
    width: 100%;
    min-width: 0;
    padding: 0;
    margin: 0;
    background: transparent;
    border: none;
    outline: none;
    font-family: var(--font-mono);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: #ffd77a;
    letter-spacing: 0;
    text-align: center;
    line-height: 1;
  }

  .bpm-value {
    display: block;
    width: 100%;
    font-family: var(--font-mono);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: #e2a030;
    letter-spacing: 0;
    line-height: 1;
    text-align: center;
    cursor: text;
  }

  .bpm-mode {
    width: 34px;
    min-width: 34px;
    flex-shrink: 0;
    text-align: left;
    font-size: 7px;
    font-weight: 500;
    letter-spacing: 0.1em;
  }

  .beat-dots {
    display: flex;
    align-items: center;
    gap: 3px;
    padding-inline: 6px;
    width: 46px;
    min-width: 46px;
    box-sizing: border-box;
  }

  .beat-dots div {
    width: 7px;
    height: 7px;
    border-radius: 1px;
    border: 1px solid;
    transition: all 0.05s;
  }

  .phase-bar {
    width: 58px;
    position: relative;
    overflow: hidden;
  }

  .phase-bar div {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: linear-gradient(90deg, #22c55e22, #22c55e55);
  }

  .phase-bar span {
    position: absolute;
    right: 3px;
    top: 50%;
    transform: translateY(-50%);
    font-family: var(--font-mono);
    font-size: 7px;
    color: #3a4050;
  }

  .divider {
    width: 1px;
    height: 20px;
    background: #1e2226;
    flex-shrink: 0;
  }

  .rhy-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-inline: 7px;
    font-weight: 500;
    font-size: 9px;
    letter-spacing: 0.1em;
    white-space: nowrap;
    width: 62px;
    min-width: 62px;
    box-sizing: border-box;
    justify-content: center;
  }

  .tap-btn {
    height: 26px;
    padding-inline: 8px;
    background: linear-gradient(180deg, #161a1e, #101418);
    border: 1px solid #1e2226;
    border-radius: 3px;
    cursor: pointer;
    color: #3a4555;
    font-weight: 500;
    font-size: 9px;
    letter-spacing: 0.1em;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
    transition: all 0.05s;
    flex-shrink: 0;
  }

  .tap-btn[data-flash='true'] {
    background: linear-gradient(180deg, #1a2a3a, #111c28);
    border-color: #38bdf866;
    color: #38bdf8;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.3);
  }

  .step-block {
    display: flex;
    align-items: center;
    gap: 3px;
    padding-inline: 4px;
    box-sizing: border-box;
  }

  .step-block span {
    font-family: var(--font-mono);
    font-size: 8px;
    color: #94a3b8;
    text-align: center;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .key-block {
    width: 76px;
    min-width: 76px;
  }

  .key-block span {
    color: #c4b5fd;
  }

  .pitch-block {
    width: 92px;
    min-width: 92px;
  }

  .step-btn {
    background: none;
    border: none;
    color: #64748b;
    cursor: pointer;
    font-size: 11px;
    padding: 0 4px;
    line-height: 1;
  }

  .tempo-block {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-inline: 4px;
    width: 168px;
    min-width: 168px;
    box-sizing: border-box;
  }

  .tempo-block.soundtouch-on {
    border-color: #a78bfa33;
  }

  .tempo-block input[type='range'] {
    width: 72px;
    height: 4px;
    accent-color: #38bdf8;
  }

  .slider-block {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-inline: 5px;
    box-sizing: border-box;
  }

  .vol-block {
    width: 88px;
    min-width: 88px;
  }

  .slider-label {
    font-size: 7px;
    color: #64748b;
    font-weight: 500;
  }

  .vol-block input[type='range'] {
    width: 52px;
    height: 4px;
    accent-color: #22c55e;
  }

  .slider-val {
    font-family: var(--font-mono);
    font-size: 8px;
    color: #94a3b8;
    min-width: 28px;
  }

  .preset-select {
    height: 26px;
    width: 128px;
    min-width: 128px;
    max-width: 128px;
    padding: 0 6px;
    background: linear-gradient(180deg, #141618, #0e1012);
    border: 1px solid #252729;
    border-radius: 3px;
    color: #94a3b8;
    font-family: var(--font-ui);
    font-size: 8px;
    font-weight: 500;
    letter-spacing: 0.04em;
    cursor: pointer;
    flex-shrink: 0;
  }

  .hold-btn {
    height: 26px;
    width: 26px;
    flex-shrink: 0;
    padding: 0;
    background: linear-gradient(180deg, #191b1d, #131517);
    border: 1px solid #222428;
    border-radius: 3px;
    cursor: pointer;
    color: #3a4050;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.4);
    transition: all 0.1s;
  }

  .hold-btn[data-active='true'] {
    background: linear-gradient(180deg, #2a1a1a, #1c1212);
    border-color: #ef444466;
    color: #ef4444;
    box-shadow: 0 0 8px rgba(239, 68, 68, 0.25);
  }
</style>
