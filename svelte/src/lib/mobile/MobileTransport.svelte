<script lang="ts">
  import { Play, Square, Minus, Plus } from '@lucide/svelte';
  import { audioEngine } from '$lib/audio';
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import VUMeter from '$lib/components/rack/VUMeter.svelte';
  import { activeModule } from './mobileSession';
  import { isPerformPosture } from './mobileEnv';

  /**
   * The thumb strip — transport and the song controls, nothing else.
   *
   * Two things left this row. The module stepper pill went because the sheet
   * header already pages effects with its own arrows, so the name was printed
   * twice on one screen and the pill was the copy doing less work. LOAD SONG
   * went because it is a once-per-session action holding permanent real estate,
   * and the drawer's SONG tab already does it.
   *
   * What replaced them is what you actually reach for while an effect is
   * running: BPM, tempo and key. Every one is a pair of steppers rather than a
   * field — typing a number on a phone while watching a video is not a thing
   * anyone does, and a knob needs more travel than this row has.
   */

  const td = $derived($transportDisplay);
  const bar = $derived(Math.floor(td.beat / 4) + 1);
  const beatInBar = $derived((Math.floor(td.beat) % 4) + 1);
  const mod = $derived($activeModule);
  const accent = $derived(mod?.accentColor ?? '#38bdf8');
  const perform = $derived($isPerformPosture);

  /** Re-read after every mutation; SoundTouch state is not a store. */
  let st = $state(audioEngine.getSoundTouchState());
  $effect(() => {
    void td.beat;
    void td.playing;
    st = audioEngine.getSoundTouchState();
  });

  const TEMPO_MIN = 0.5;
  const TEMPO_MAX = 2;
  const TEMPO_STEP = 0.05;

  async function togglePlay() {
    if (td.playing) audioEngine.stop();
    else await audioEngine.start();
  }

  function nudgeBpm(delta: number) {
    const next = Math.round((td.bpm + delta) * 10) / 10;
    audioEngine.setBPM(Math.max(60, Math.min(200, next)));
    st = audioEngine.getSoundTouchState();
  }

  function nudgeTempo(delta: number) {
    const next = Math.round((st.tempo + delta) * 100) / 100;
    audioEngine.setTempo(Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, next)));
    st = audioEngine.getSoundTouchState();
  }

  function nudgeKey(delta: number) {
    audioEngine.nudgeKey(delta);
    st = audioEngine.getSoundTouchState();
  }

  function nudgePitch(delta: number) {
    // Same range the desktop uses: a full octave either way in semitones.
    const next = Math.max(-12, Math.min(12, st.pitchSemitones + delta));
    audioEngine.setPitch(next);
    st = audioEngine.getSoundTouchState();
  }

  /** Signed, so -2 reads as a transposition rather than as a quantity. */
  const pitchLabel = $derived(
    st.pitchSemitones > 0 ? `+${st.pitchSemitones}` : `${st.pitchSemitones}`
  );
</script>

<footer class="mt" class:perform>
  <div class="row">
    <button
      type="button"
      class="play"
      data-playing={td.playing}
      aria-label={td.playing ? 'Stop' : 'Play'}
      onclick={togglePlay}
    >
      {#if td.playing}<Square size={13} />{:else}<Play size={13} />{/if}
    </button>

    <div class="beat" class:idle={!td.playing}>
      <span class="beat-value" style="color:{td.playing ? accent : '#444c56'}">
        {bar}<i>·</i>{beatInBar}
      </span>
      <span class="beat-kicker">BAR · BEAT</span>
    </div>

    <div class="meters" aria-hidden="true">
      <VUMeter value={td.bassAmp * 100} color={accent} />
      <VUMeter value={td.amplitude * 200} color={accent} />
    </div>
  </div>

  <!--
    Three steppers on one rail. Each is [−][ value ][+] so the value is never
    something you have to type, and the readouts are recessed so they read as
    the machine telling you where it is rather than as editable fields.
  -->
  <div class="rail">
    <div class="stepper">
      <button type="button" aria-label="BPM down" onclick={() => nudgeBpm(-1)}><Minus size={13} /></button>
      <span class="cell">
        <span class="cell-label">BPM</span>
        <span class="cell-value">{Math.round(td.bpm)}{#if td.bpmLocked}<em>L</em>{/if}</span>
      </span>
      <button type="button" aria-label="BPM up" onclick={() => nudgeBpm(1)}><Plus size={13} /></button>
    </div>

    <div class="stepper">
      <button type="button" aria-label="Tempo down" onclick={() => nudgeTempo(-TEMPO_STEP)}><Minus size={13} /></button>
      <span class="cell">
        <span class="cell-label">TEMPO</span>
        <span class="cell-value">{st.tempo.toFixed(2)}<em>x</em></span>
      </span>
      <button type="button" aria-label="Tempo up" onclick={() => nudgeTempo(TEMPO_STEP)}><Plus size={13} /></button>
    </div>

    <div class="stepper">
      <button type="button" aria-label="Key down" onclick={() => nudgeKey(-1)}><Minus size={13} /></button>
      <span class="cell">
        <span class="cell-label">KEY</span>
        <span class="cell-value">{st.key}</span>
      </span>
      <button type="button" aria-label="Key up" onclick={() => nudgeKey(1)}><Plus size={13} /></button>
    </div>

    <div class="stepper">
      <button type="button" aria-label="Pitch down" onclick={() => nudgePitch(-1)}><Minus size={13} /></button>
      <span class="cell">
        <span class="cell-label">PITCH</span>
        <span class="cell-value">{pitchLabel}<em>st</em></span>
      </span>
      <button type="button" aria-label="Pitch up" onclick={() => nudgePitch(1)}><Plus size={13} /></button>
    </div>
  </div>
</footer>

<style>
  .mt {
    position: relative;
    z-index: 30;
    flex: 0 0 auto;
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 7px 10px calc(7px + env(safe-area-inset-bottom, 0px));
    background: rgba(8, 9, 10, 0.88);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-top: 1px solid #1a1d20;
    font-family: var(--font-ui);
  }

  .mt.perform {
    gap: 5px;
    padding: 5px calc(10px + env(safe-area-inset-right, 0px)) 5px
      calc(10px + env(safe-area-inset-left, 0px));
    background: transparent;
    border-top: none;
  }
  .mt.perform .play,
  .mt.perform .stepper {
    backdrop-filter: blur(10px) saturate(0.8);
    -webkit-backdrop-filter: blur(10px) saturate(0.8);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* Flat play button — easy target, no 3D. */
  .play {
    position: relative;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 28px;
    padding: 0;
    border: 1px solid #23272c;
    border-radius: 2px;
    background: #181b1f;
    box-shadow: none;
    color: #6d7784;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .play::after {
    content: '';
    position: absolute;
    inset: -8px -4px;
  }
  .play[data-playing='true'] {
    border-color: rgba(34, 197, 94, 0.4);
    background: rgba(34, 197, 94, 0.1);
    box-shadow: none;
    color: #22c55e;
  }
  .play:active {
    background: #14171a;
  }

  .beat {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 48px;
  }
  .beat-value {
    font-family: var(--font-mono);
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .beat-value i {
    font-style: normal;
    color: #3a4048;
    padding: 0 1px;
  }
  .beat-kicker {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.16em;
    color: #3a4048;
  }

  .meters {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    margin-left: auto;
  }

  /*
    Two by two, not four across.

    At 375px, four steppers leave 84px each; the two keys take 48 of that and
    the readout is left with 36px — which "1.00x" fills exactly, so TEMPO would
    clip on the narrowest phones. Two rows cost 40px of height and every value
    stays legible, which is the better trade for controls meant to be used while
    watching the picture.
  */
  .rail {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }

  /* Flat steppers — same proportions, no 3D. */
  .stepper {
    display: flex;
    align-items: stretch;
    height: 34px;
    border: 1px solid #1e2226;
    border-radius: 2px;
    background: #181b1f;
    box-shadow: none;
    overflow: hidden;
    min-width: 0;
  }

  .stepper button {
    position: relative;
    flex: 0 0 auto;
    width: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    color: #5a636e;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .stepper button::after {
    content: '';
    position: absolute;
    inset: -8px -4px;
  }
  .stepper button:active {
    color: #d8e2ea;
    background: rgba(255, 255, 255, 0.07);
  }

  /* Readout well — slightly darker than the stepper body. */
  .cell {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    border-left: 1px solid #13161a;
    border-right: 1px solid #13161a;
    background: #0f1215;
    box-shadow: none;
  }
  .cell-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.16em;
    color: #3d4550;
    line-height: 1;
  }
  .cell-value {
    font-family: var(--font-mono);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: #9fe8dc;
    text-shadow: 0 0 8px rgba(45, 212, 191, 0.35);
    line-height: 1;
    white-space: nowrap;
  }
  .cell-value em {
    font-style: normal;
    font-size: 11px;
    color: #46525c;
    padding-left: 1px;
  }

  /* A phone in landscape is ~390px tall; the kicker is the first thing to go. */
  @media (max-height: 430px) {
    .mt.perform .beat-kicker {
      display: none;
    }
  }
</style>
