<script lang="ts">
  import { Play, Square, ChevronLeft, ChevronRight, Upload } from '@lucide/svelte';
  import { audioEngine } from '$lib/audio';
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import VUMeter from '$lib/components/rack/VUMeter.svelte';
  import { activeModule, pageModule } from './mobileSession';
  import { isPerformPosture } from './mobileEnv';

  /**
   * The thumb strip.
   *
   * The desktop top bar is forty controls in a 46px row. This is five, at sizes
   * a thumb can actually hit, and the one that matters most — the module
   * stepper — is a persistent pill that stays put underneath every sheet and
   * drawer. Paging effects is the phone's primary verb; it should never be
   * something you have to open a panel to do.
   */

  let audioInput = $state<HTMLInputElement>();

  const td = $derived($transportDisplay);
  const bar = $derived(Math.floor(td.beat / 4) + 1);
  const beatInBar = $derived((Math.floor(td.beat) % 4) + 1);
  const mod = $derived($activeModule);
  const accent = $derived(mod?.accentColor ?? '#38bdf8');
  const perform = $derived($isPerformPosture);

  async function togglePlay() {
    if (td.playing) audioEngine.stop();
    else await audioEngine.start();
  }

  async function handleAudio(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    // No options: hosted analysis is opt-in on the desktop behind a consent
    // dialog, and a phone strip is not the place to ask. Local-only is the
    // safe default and still gives a real-time beat grid.
    await audioEngine.loadAudioFile(file);
  }
</script>

<footer class="mt" class:perform>
  <input
    bind:this={audioInput}
    type="file"
    accept="audio/*"
    class="file-input"
    onchange={handleAudio}
  />

  <!-- The stepper pill. Persistent, thumb-height, accent-coloured: it is how you
       walk the catalog without taking your eyes off the picture. -->
  <div class="stepper" style="--accent:{accent}">
    <button type="button" class="step" aria-label="Previous effect" onclick={() => pageModule(-1)}>
      <ChevronLeft size={20} />
    </button>
    <span class="step-label" style="color:{accent}">{mod?.name ?? ''}</span>
    <button type="button" class="step" aria-label="Next effect" onclick={() => pageModule(1)}>
      <ChevronRight size={20} />
    </button>
  </div>

  <div class="row">
    <button
      type="button"
      class="play"
      data-playing={td.playing}
      aria-label={td.playing ? 'Stop' : 'Play'}
      onclick={togglePlay}
    >
      {#if td.playing}<Square size={16} />{:else}<Play size={16} />{/if}
    </button>

    <div class="beat" class:idle={!td.playing}>
      <span class="beat-value">{bar}<i>·</i>{beatInBar}</span>
      <span class="beat-kicker">BAR · BEAT</span>
    </div>

    <div class="meters" aria-hidden="true">
      <VUMeter value={td.bassAmp * 100} color={accent} />
      <VUMeter value={td.amplitude * 200} color={accent} />
      <div class="meter-legend">
        <span>BASS</span>
        <span>PEAK</span>
      </div>
    </div>

    <button type="button" class="song" onclick={() => audioInput?.click()}>
      <Upload size={14} />
      <span>LOAD SONG</span>
    </button>
  </div>
</footer>

<style>
  .mt {
    position: relative;
    z-index: 30;
    flex: 0 0 auto;
    /* Portrait: the shell's body is a flex column and the stage is top-pinned,
       so the strip claims the slack and settles at the bottom of the viewport —
       thumb height is the whole point of it. Inert in landscape, where the shell
       wraps this in its own fixed container. */
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 12px calc(8px + var(--m-safe-bottom, 0px));
    background: linear-gradient(180deg, var(--m-sheet, #131416) 0%, var(--m-bg, #0a0b0c) 100%);
    border-top: 1px solid var(--m-line, #0d0e0f);
    font-family: var(--font-ui);
  }

  /* Landscape: the strip rides over the picture. It deliberately does NOT
     position itself — MobileShell owns the perform placement (`.mobile-perform-
     transport`: fixed, its own scrim, its own bottom safe-area padding), and a
     second fixed box inside it would double the scrim and the inset. This only
     changes how the strip reads on top of a picture. */
  .mt.perform {
    gap: 6px;
    padding: 6px calc(12px + var(--m-safe-right, 0px)) 6px calc(12px + var(--m-safe-left, 0px));
    background: transparent;
    border-top: none;
  }
  .mt.perform .stepper,
  .mt.perform .play,
  .mt.perform .song {
    /* Over moving video, flat panels disappear; the glass keeps them legible
       without adding another opaque band across the picture. */
    backdrop-filter: blur(10px) saturate(0.8);
    -webkit-backdrop-filter: blur(10px) saturate(0.8);
  }

  .file-input {
    display: none;
  }

  .stepper {
    display: flex;
    align-items: center;
    height: 48px;
    background: linear-gradient(180deg, #131416, #0d0e0f);
    border: 1px solid color-mix(in srgb, var(--accent) 26%, #0d0e0f);
    border-radius: 24px;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.7);
    overflow: hidden;
  }

  .step {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 46px;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: #7a8390;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .step:active {
    color: #e2e9f0;
    background: rgba(255, 255, 255, 0.04);
  }

  .step-label {
    flex: 1 1 auto;
    min-width: 0;
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .play {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 48px;
    margin: 0;
    padding: 0;
    border: 1px solid #23282c;
    border-radius: 3px;
    background: linear-gradient(180deg, #1c2020, #141818);
    color: #6d7784;
    cursor: pointer;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .play[data-playing='true'] {
    background: linear-gradient(180deg, #1a2a1a, #121c12);
    border-color: #22c55e55;
    color: #22c55e;
    box-shadow: 0 0 10px rgba(34, 197, 94, 0.2);
  }

  .beat {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 52px;
  }
  .beat-value {
    font-family: var(--font-mono);
    font-size: 17px;
    font-variant-numeric: tabular-nums;
    color: #cfe0e2;
    line-height: 1;
  }
  .beat-value i {
    font-style: normal;
    color: #3a4048;
    padding: 0 1px;
  }
  .beat.idle .beat-value {
    color: #444c56;
  }
  .beat-kicker {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.16em;
    color: #3a4048;
  }

  .meters {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    margin-left: auto;
  }
  .meter-legend {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 36px;
    padding-left: 1px;
  }
  .meter-legend span {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.1em;
    color: #2f353d;
    line-height: 1;
  }

  .song {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 48px;
    padding: 0 14px;
    margin: 0;
    border: 1px solid #23282c;
    border-radius: 3px;
    background: linear-gradient(180deg, #1c2020, #141818);
    color: #8a939f;
    cursor: pointer;
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .song:active {
    color: #dfe6ee;
  }

  /* A phone in landscape is ~390px tall; the legend and the LOAD label are the
     first things to go when the strip has to share that with the picture. */
  @media (max-height: 430px) {
    .mt.perform .meter-legend,
    .mt.perform .beat-kicker {
      display: none;
    }
    .mt.perform .song span {
      display: none;
    }
    .mt.perform .song {
      padding: 0;
      width: 48px;
    }
  }
</style>
