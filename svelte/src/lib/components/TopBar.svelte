<script lang="ts">
  import { Upload, AlignJustify, Play, Square, Music4, Disc3, Pause, Film, X, Undo2, Redo2, Shuffle } from '@lucide/svelte';
  import { audioEngine } from '$lib/audio';
  import { fxHold } from '$lib/stores/rack';
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import TopBtn from '$lib/components/rack/TopBtn.svelte';

  interface Props {
    onRandomize: () => void;
    onClear: () => void;
    onLoadClips?: (files: File[]) => void;
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

  let tapFlash = $state(false);
  let bpmEdit = $state<string | null>(null);
  let tapTimes: number[] = [];

  let audioInput: HTMLInputElement;
  let clipsInput: HTMLInputElement;

  const td = $derived($transportDisplay);
  const beatOn = $derived(td.beatPhase < 0.15);
  const beatInBar = $derived(Math.floor(td.beat) % 4);

  const rhyLabel = $derived.by(() => {
    switch (td.analysisStatus) {
      case 'analyzing':
        return 'RHY·…';
      case 'ready':
        return td.analysisConfidence != null && td.analysisConfidence >= 0.7 ? 'RHY·OK' : 'RHY·OK';
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

  function commitBpm() {
    if (bpmEdit !== null) {
      const v = parseFloat(bpmEdit);
      if (Number.isFinite(v) && v >= 60 && v <= 200) audioEngine.setBPM(v);
    }
    bpmEdit = null;
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
      audioEngine.stop();
    } else {
      await audioEngine.start();
    }
  }

  async function handleAudioUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await audioEngine.loadAudioFile(file);
    (e.target as HTMLInputElement).value = '';
  }

  function handleClipsUpload(e: Event) {
    const files = [...((e.target as HTMLInputElement).files ?? [])];
    if (files.length > 0) onLoadClips?.(files);
    (e.target as HTMLInputElement).value = '';
  }
</script>

<div
  style="height:46px;background:linear-gradient(180deg,#202224 0%,#18191b 60%,#141516 100%);border-bottom:2px solid #0a0b0c;border-top:1px solid #2a2c2e;display:flex;align-items:center;justify-content:space-between;padding:0 8px;flex-shrink:0;box-shadow:0 2px 10px rgba(0,0,0,0.7);position:relative;z-index:10;gap:6px;font-family:var(--font-ui)"
>
  <input bind:this={audioInput} type="file" accept="audio/*" class="hidden" onchange={handleAudioUpload} />
  <input bind:this={clipsInput} type="file" accept="video/*" multiple class="hidden" onchange={handleClipsUpload} />

  <div style="display:flex;align-items:center;gap:6px;min-width:220px">
    <button type="button" style="background:none;border:none;cursor:pointer;padding:3px;color:#454a52;display:flex;align-items:center">
      <AlignJustify size={13} />
    </button>
    <div
      style="width:7px;height:7px;border-radius:50%;background:{td.playing ? '#22c55e' : '#333a42'};box-shadow:{td.playing ? '0 0 6px #22c55e88' : 'none'};transition:all 0.2s"
    ></div>
    <span style="font-family:var(--font-brand);font-size:10px;font-weight:700;letter-spacing:0.14em;color:#7a8090">BEATSURFING</span>
    <span style="color:#2a3040;font-size:11px">×</span>
    <span style="font-family:var(--font-brand);font-size:10px;font-weight:700;letter-spacing:0.14em;color:#556070">CHE</span>
  </div>

  <div style="display:flex;align-items:center;gap:4px;flex:1;justify-content:center;min-width:0;flex-wrap:nowrap;overflow:hidden" class="topbar-center">
    <button
      type="button"
      onclick={togglePlay}
      style="height:26px;padding-inline:10px;background:{td.playing
        ? 'linear-gradient(180deg,#1a2a1a,#121c12)'
        : 'linear-gradient(180deg,#1c2020,#141818)'};border-style:solid;border-width:1px;border-color:{td.playing
        ? '#22c55e33 #22c55e44 #22c55e44 #22c55e44'
        : '#252729 #1e2226 #1e2226 #1e2226'};border-radius:3px;cursor:pointer;color:{td.playing
        ? '#22c55e'
        : '#4a5565'};display:flex;align-items:center;gap:4px;font-family:var(--font-ui);font-weight:700;font-size:9px;letter-spacing:0.1em;box-shadow:{td.playing
        ? '0 0 8px rgba(34,197,94,0.2)'
        : 'inset 0 1px 3px rgba(0,0,0,0.5)'};transition:all 0.1s"
    >
      {#if td.playing}<Square size={9} />{:else}<Play size={9} />{/if}
      {td.playing ? 'STOP' : 'PLAY'}
    </button>

    <button
      type="button"
      onclick={() => audioInput?.click()}
      style="height:26px;padding-inline:8px;background:linear-gradient(180deg,#191d24,#12161c);border-style:solid;border-width:1px;border-color:#29313c #20262e #20262e #20262e;border-radius:3px;cursor:pointer;color:{td.usingUploadedTrack
        ? '#38bdf8'
        : '#516072'};display:flex;align-items:center;gap:4px;font-family:var(--font-ui);font-weight:700;font-size:9px;letter-spacing:0.1em;box-shadow:{td.usingUploadedTrack
        ? '0 0 8px rgba(56,189,248,0.18)'
        : 'inset 0 1px 3px rgba(0,0,0,0.5)'}"
    >
      <Upload size={10} /> SONG
    </button>

    {#if onLoadClips}
      <button
        type="button"
        onclick={() => clipsInput?.click()}
        title="Load clips into empty slots ({loadedClipCount}/{clipSlotCount} filled)"
        style="height:26px;padding-inline:8px;background:linear-gradient(180deg,#191d24,#12161c);border-style:solid;border-width:1px;border-color:#29313c #20262e #20262e #20262e;border-radius:3px;cursor:pointer;color:{loadedClipCount > 0
          ? '#a78bfa'
          : '#516072'};display:flex;align-items:center;gap:4px;font-family:var(--font-ui);font-weight:700;font-size:9px;letter-spacing:0.1em;box-shadow:{loadedClipCount > 0
          ? '0 0 8px rgba(167,139,250,0.18)'
          : 'inset 0 1px 3px rgba(0,0,0,0.5)'}"
      >
        <Film size={10} /> CLIPS
        <span style="font-family:var(--font-mono);font-size:8px;color:#4a5060">{loadedClipCount}/{clipSlotCount}</span>
      </button>
    {/if}

    {#if td.usingUploadedTrack}
      <button
        type="button"
        onclick={() => audioEngine.clearUploadedTrack()}
        style="height:26px;padding-inline:8px;background:linear-gradient(180deg,#241919,#1b1212);border-style:solid;border-width:1px;border-color:#462828 #382020 #382020 #382020;border-radius:3px;cursor:pointer;color:#d56b6b;display:flex;align-items:center;gap:4px;font-family:var(--font-ui);font-weight:700;font-size:9px;letter-spacing:0.1em"
      >
        <X size={10} /> REMOVE
      </button>
    {/if}

    <div style="width:1px;height:20px;background:#1e2226"></div>

    <div style="display:flex;align-items:center;gap:3px">
      <div
        title={td.bpmLocked ? 'Manual BPM (click badge to re-enable auto-detect)' : 'Click number to type BPM'}
        style="height:26px;padding-inline:8px;background:linear-gradient(180deg,#0e1012,#0a0c0e);border:1px solid #1a1c1e;border-radius:2px;display:flex;align-items:center;gap:5px;box-shadow:inset 0 2px 5px rgba(0,0,0,0.7)"
      >
        <div
          style="width:6px;height:6px;border-radius:50%;background:{beatOn && td.playing ? '#f59e0b' : '#1e2226'};box-shadow:{beatOn && td.playing ? '0 0 5px #f59e0b' : 'none'};transition:background 0.04s, box-shadow 0.04s;flex-shrink:0"
        ></div>
        {#if bpmEdit !== null}
          <input
            autofocus
            value={bpmEdit}
            oninput={(e) => (bpmEdit = e.currentTarget.value.replace(/[^0-9.]/g, ''))}
            onblur={commitBpm}
            onkeydown={(e) => {
              if (e.key === 'Enter') commitBpm();
              if (e.key === 'Escape') bpmEdit = null;
            }}
            style="width:34px;background:transparent;border:none;outline:none;font-family:var(--font-mono);font-size:13px;color:#ffd77a;letter-spacing:0.05em"
          />
        {:else}
          <span
            role="button"
            tabindex="0"
            onclick={() => (bpmEdit = String(Math.round(td.bpm)))}
            onkeydown={(e) => e.key === 'Enter' && (bpmEdit = String(Math.round(td.bpm)))}
            style="font-family:var(--font-mono);font-size:13px;color:#e2a030;letter-spacing:0.05em;line-height:1;cursor:text"
          >
            {Math.round(td.bpm).toString().padStart(3, '0')}
          </span>
        {/if}
        <span
          role="button"
          tabindex="0"
          onclick={() => {
            if (td.bpmLocked) audioEngine.unlockBPM();
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter' && td.bpmLocked) audioEngine.unlockBPM();
          }}
          style="font-family:var(--font-ui);font-size:7px;font-weight:700;letter-spacing:0.1em;color:{td.bpmLocked
            ? '#e2a030'
            : '#4a5060'};cursor:{td.bpmLocked ? 'pointer' : 'default'}"
        >
          {td.bpmLocked ? 'BPM·M' : 'BPM·A'}
        </span>
      </div>

      <div
        style="height:26px;padding-inline:6px;background:linear-gradient(180deg,#0e1012,#0a0c0e);border:1px solid #1a1c1e;border-radius:2px;display:flex;align-items:center;gap:3px;box-shadow:inset 0 2px 5px rgba(0,0,0,0.7)"
      >
        {#each [0, 1, 2, 3] as i (i)}
          {@const active = i === beatInBar && td.playing}
          <div
            style="width:7px;height:7px;border-radius:1px;background:{active ? '#38bdf8' : '#1a1e24'};box-shadow:{active ? '0 0 5px #38bdf8' : 'none'};border:1px solid {active ? '#38bdf844' : '#141618'};transition:all 0.05s"
          ></div>
        {/each}
      </div>

      <div style="width:58px;height:26px;position:relative;background:#0a0b0c;border:1px solid #1a1c1e;border-radius:2px;overflow:hidden">
        <div
          style="position:absolute;left:0;top:0;bottom:0;width:{td.beatPhase * 100}%;background:linear-gradient(90deg,#22c55e22,#22c55e55);border-right:{td.playing ? '1px solid #22c55e' : 'none'};transition:{td.beatPhase < 0.05 ? 'none' : 'width 0.02s linear'}"
        ></div>
        <span
          style="position:absolute;right:3px;top:50%;transform:translateY(-50%);font-family:var(--font-mono);font-size:7px;color:#3a4050"
        >
          {td.beatPhase.toFixed(2)}
        </span>
      </div>
    </div>

    <div style="width:1px;height:20px;background:#1e2226"></div>

    <div
      title={td.analysisError ?? (td.analysisStatus === 'ready' && td.analysisConfidence != null ? `Beat grid · ${Math.round(td.analysisConfidence * 100)}% conf` : 'Rhythm analysis')}
      style="height:26px;padding-inline:7px;background:linear-gradient(180deg,#0e1012,#0a0c0e);border:1px solid {rhyColor}33;border-radius:2px;display:flex;align-items:center;gap:4px;box-shadow:inset 0 2px 5px rgba(0,0,0,0.7);color:{rhyColor};font-family:var(--font-ui);font-weight:700;font-size:9px;letter-spacing:0.1em;flex-shrink:0;white-space:nowrap"
    >
      <Disc3 size={10} />
      {rhyLabel}
    </div>

    <button
      type="button"
      onclick={handleTap}
      style="height:26px;padding-inline:8px;background:{tapFlash
        ? 'linear-gradient(180deg,#1a2a3a,#111c28)'
        : 'linear-gradient(180deg,#161a1e,#101418)'};border:1px solid {tapFlash ? '#38bdf866' : '#1e2226'};border-radius:3px;cursor:pointer;color:{tapFlash ? '#38bdf8' : '#3a4555'};font-family:var(--font-ui);font-weight:700;font-size:9px;letter-spacing:0.1em;box-shadow:{tapFlash
        ? '0 0 8px rgba(56,189,248,0.3)'
        : 'inset 0 1px 3px rgba(0,0,0,0.5)'};transition:all 0.05s"
    >
      TAP
    </button>

    <div style="width:1px;height:20px;background:#1e2226"></div>

    <TopBtn label="UNDO">
      {#snippet icon()}<Undo2 size={10} />{/snippet}
    </TopBtn>
    <TopBtn label="REDO">
      {#snippet icon()}<Redo2 size={10} />{/snippet}
    </TopBtn>
    <TopBtn label="RANDOMIZE" onclick={onRandomize} accent>
      {#snippet icon()}<Shuffle size={10} />{/snippet}
    </TopBtn>
    <TopBtn label="CLEAR" onclick={onClear} danger>
      {#snippet icon()}<X size={10} />{/snippet}
    </TopBtn>

    <div style="width:1px;height:20px;background:#1e2226"></div>

    <button
      type="button"
      onclick={() => fxHold.update((h) => !h)}
      title={$fxHold ? 'Resume FX preview shaders' : 'Freeze all FX preview shaders'}
      aria-label={$fxHold ? 'Resume FX shaders' : 'Hold FX shaders'}
      style="height:26px;width:26px;flex-shrink:0;padding:0;background:{$fxHold
        ? 'linear-gradient(180deg,#2a1a1a,#1c1212)'
        : 'linear-gradient(180deg,#191b1d,#131517)'};border-style:solid;border-width:1px;border-color:{$fxHold
        ? '#ef444444 #ef444466 #ef444466 #ef444466'
        : '#222428 #1a1c1e #1a1c1e #1a1c1e'};border-radius:3px;cursor:pointer;color:{$fxHold ? '#ef4444' : '#3a4050'};display:flex;align-items:center;justify-content:center;box-shadow:{$fxHold
        ? '0 0 8px rgba(239,68,68,0.25)'
        : 'inset 0 1px 2px rgba(0,0,0,0.4)'};transition:all 0.1s"
    >
      {#if $fxHold}<Play size={11} />{:else}<Pause size={11} />{/if}
    </button>
  </div>

  <div style="display:flex;align-items:center;gap:8px;min-width:280px;justify-content:flex-end">
    <div
      style="display:flex;align-items:center;gap:6px;height:28px;min-width:154px;max-width:200px;padding-inline:8px;background:linear-gradient(180deg,#101214,#0b0d0f);border:1px solid #171a1d;border-radius:3px;box-shadow:inset 0 2px 5px rgba(0,0,0,0.7);overflow:hidden"
    >
      {#if td.usingUploadedTrack}<Music4 size={11} color="#38bdf8" />{:else}<Disc3 size={11} color="#556070" />{/if}
      <span
        style="font-family:var(--font-mono);font-size:9px;color:{td.usingUploadedTrack ? '#8ec5ff' : '#556070'};letter-spacing:0.03em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
      >
        {td.trackName}
      </span>
    </div>

    <div style="display:flex;gap:1px;align-items:flex-end;height:22px">
      {#each Array.from({ length: 16 }) as _, i (i)}
        {@const threshold = i / 16}
        {@const lit = td.playing && td.amplitude * 3.4 > threshold}
        {@const c = i > 13 ? '#ef4444' : i > 10 ? '#eab308' : '#22c55e'}
        <div
          style="width:3px;height:{4 + (i < 8 ? i : 15 - i)}px;background:{lit ? c : '#1a1e24'};box-shadow:{lit ? `0 0 3px ${c}66` : 'none'};border-radius:0.5px;transition:background 0.04s"
        ></div>
      {/each}
    </div>

    <span style="font-family:var(--font-mono);font-size:9px;color:#2e3440;letter-spacing:0.06em">CHEat code:e590</span>
  </div>
</div>

<style>
  .hidden {
    display: none;
  }
</style>
