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
    background: linear-gradient(180deg, #131416 0%, #0a0b0c 100%);
    border-top: 1px solid #23262a;
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

  /*
    Rectangular and small. It was a 52x48 slab, which on a phone reads as the
    most important object on screen — it is not; the picture is. 46x30 is still
    an easy target once the ::after expansion is counted.
  */
  .play {
    position: relative;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 30px;
    padding: 0;
    border: 1px solid;
    border-color: #26292d #16181a #131416 #16181a;
    border-radius: 2px;
    background: linear-gradient(180deg, #202429 0%, #191c20 52%, #141619 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.045),
      inset 0 -2px 3px rgba(0, 0, 0, 0.5);
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
    border-color: #22c55e44 #16181a #131416 #16181a;
    color: #22c55e;
    box-shadow:
      inset 0 2px 5px rgba(0, 0, 0, 0.6),
      inset 0 0 10px rgba(34, 197, 94, 0.14),
      0 0 8px rgba(34, 197, 94, 0.18);
  }
  .play:active {
    box-shadow: inset 0 3px 6px rgba(0, 0, 0, 0.7);
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

  .rail {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }

  .stepper {
    display: flex;
    align-items: stretch;
    height: 34px;
    border: 1px solid;
    border-color: #26292d #16181a #131416 #16181a;
    border-radius: 2px;
    background: linear-gradient(180deg, #1c1f23 0%, #17191c 55%, #131518 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
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
  /* Steppers get pressed repeatedly, so the target reaches well past the paint
     on the outer edges where the thumb actually lands. */
  .stepper button::after {
    content: '';
    position: absolute;
    inset: -8px -4px;
  }
  .stepper button:active {
    color: #d8e2ea;
    background: rgba(255, 255, 255, 0.05);
  }

  /* Recessed glass between the two keys. */
  .cell {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    border-left: 1px solid #0c0d0f;
    border-right: 1px solid #0c0d0f;
    background: linear-gradient(180deg, #080a0c, #0d1013 70%, #090b0d);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.75);
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
