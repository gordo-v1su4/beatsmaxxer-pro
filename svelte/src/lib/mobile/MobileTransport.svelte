<script lang="ts">
  import { Play, Square, Minus, Plus, Menu } from '@lucide/svelte';
  import { audioEngine } from '$lib/audio';
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import VUMeter from '$lib/components/rack/VUMeter.svelte';
  import {
    activeModule,
    advanceBars,
    advanceMode,
    CLIP_ADVANCE_BARS,
    type AdvanceMode
  } from './mobileSession';
  import { isPerformPosture } from './mobileEnv';
  import { openDrawer } from './mobileUi';

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

  /**
   * How often the picture moves to the next clip — on the performance rail,
   * beside the things it belongs with.
   *
   * The interval was fixed at eight bars and unreachable, so LINEAR and RANDOM
   * each had exactly one tempo. It could have gone in the CLIPS drawer next to
   * the mode buttons, but that is where a set gets *built*; this is a thing you
   * reach for mid-track, watching the picture, which is the same reason BPM and
   * KEY are on this row rather than in a menu.
   *
   * OFF is folded into the same stepper rather than left as a separate HOLD
   * button, because "how often does the video change" and "does the video
   * change" are one question, and answering it in two places is how the two get
   * out of step. Stepping off the bottom holds; stepping back on restores
   * whichever order the drawer was last set to, so RANDOM does not silently
   * become LINEAR on the way back.
   */
  // `number[]`, not a literal tuple: advanceBars is a plain number, and a
  // readonly tuple of literals makes indexOf() reject it.
  const ADVANCE_STOPS: readonly number[] = [0, ...CLIP_ADVANCE_BARS];

  /** Remembered so turning advance back on returns the order it had. */
  let lastMovingMode: Exclude<AdvanceMode, 'hold'> = $state('linear');
  $effect(() => {
    if ($advanceMode !== 'hold') lastMovingMode = $advanceMode;
  });

  const advanceIndex = $derived(
    $advanceMode === 'hold' ? 0 : Math.max(1, ADVANCE_STOPS.indexOf($advanceBars))
  );
  const advanceLabel = $derived($advanceMode === 'hold' ? 'OFF' : `${$advanceBars}`);

  function nudgeAdvance(delta: number) {
    const next = Math.max(0, Math.min(ADVANCE_STOPS.length - 1, advanceIndex + delta));
    if (next === 0) {
      advanceMode.set('hold');
      return;
    }
    advanceMode.set(lastMovingMode);
    advanceBars.set(ADVANCE_STOPS[next]!);
  }

  /**
   * Hold to repeat.
   *
   * Every one of these was one step per tap, which is fine for a nudge and
   * absurd for a move: getting BPM from 128 to 90 was thirty-eight separate
   * taps on a phone, while the track played. Holding now repeats, and
   * accelerates the longer it is held, so a nudge and a move are the same
   * gesture at two durations rather than two different amounts of work.
   *
   * 420ms before the first repeat is the usual key-repeat delay and is what
   * keeps a deliberate single tap single. The interval then falls from 140ms to
   * 40ms over about a second and a half, which crosses a useful BPM range in
   * roughly the time it takes to decide you have gone far enough.
   */
  const REPEAT_DELAY_MS = 420;
  const REPEAT_START_MS = 140;
  const REPEAT_MIN_MS = 40;

  let repeatTimer: ReturnType<typeof setTimeout> | null = null;

  function stopRepeat() {
    if (repeatTimer !== null) clearTimeout(repeatTimer);
    repeatTimer = null;
  }

  /**
   * Runs `step` now, then again on an accelerating schedule until released.
   * Bound to pointerdown rather than click, so the release handlers below are
   * what end it -- including pointercancel, which is what a browser sends when
   * it decides mid-gesture that a stroke was a scroll.
   */
  function holdToRepeat(event: PointerEvent, step: () => void) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    stopRepeat();
    step();
    navigator.vibrate?.(6);

    let interval = REPEAT_START_MS;
    const tick = () => {
      step();
      interval = Math.max(REPEAT_MIN_MS, interval * 0.86);
      repeatTimer = setTimeout(tick, interval);
    };
    repeatTimer = setTimeout(tick, REPEAT_DELAY_MS);
  }

  /**
   * The keyboard's way in.
   *
   * Moving these to pointerdown took Enter and Space with it: a keyboard
   * activation raises `click` and never a pointer event, so without this the
   * steppers became mouse-and-touch only. A click that came from a real pointer
   * has already been handled by the hold above, and `detail` is how the two are
   * told apart -- pointer-driven clicks carry a click count of at least one,
   * keyboard-driven ones carry zero.
   */
  function keyActivate(event: MouseEvent, step: () => void) {
    if (event.detail !== 0) return;
    step();
  }

  $effect(() => stopRepeat);
</script>

<footer class="mt" class:perform>
  <div class="row">
    <!--
      The browser key, moved down from the top bar.

      The drawer it opens is a bottom sheet, and the button that opens it was in
      the opposite corner of the screen — so the sheet read as arriving from
      nowhere. Here it sits at the bottom edge the sheet rises from, and on the
      half of the phone a thumb can actually reach.
    -->
    <button
      type="button"
      class="browse"
      aria-label="Open clip and effect browsers"
      onclick={() => openDrawer('clips')}
    >
      <Menu size={20} />
    </button>

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
      <button
        type="button"
        aria-label="BPM down"
        onpointerdown={(e) => holdToRepeat(e, () => nudgeBpm(-1))}
        onclick={(e) => keyActivate(e, () => nudgeBpm(-1))}
        onpointerup={stopRepeat}
        onpointercancel={stopRepeat}
        onpointerleave={stopRepeat}
      ><Minus size={16} /></button>
      <span class="cell">
        <span class="cell-label">BPM</span>
        <span class="cell-value">{Math.round(td.bpm)}{#if td.bpmLocked}<em>L</em>{/if}</span>
      </span>
      <button
        type="button"
        aria-label="BPM up"
        onpointerdown={(e) => holdToRepeat(e, () => nudgeBpm(1))}
        onclick={(e) => keyActivate(e, () => nudgeBpm(1))}
        onpointerup={stopRepeat}
        onpointercancel={stopRepeat}
        onpointerleave={stopRepeat}
      ><Plus size={16} /></button>
    </div>

    <div class="stepper">
      <button
        type="button"
        aria-label="Tempo down"
        onpointerdown={(e) => holdToRepeat(e, () => nudgeTempo(-TEMPO_STEP))}
        onclick={(e) => keyActivate(e, () => nudgeTempo(-TEMPO_STEP))}
        onpointerup={stopRepeat}
        onpointercancel={stopRepeat}
        onpointerleave={stopRepeat}
      ><Minus size={16} /></button>
      <span class="cell">
        <span class="cell-label">TEMPO</span>
        <span class="cell-value">{st.tempo.toFixed(2)}<em>x</em></span>
      </span>
      <button
        type="button"
        aria-label="Tempo up"
        onpointerdown={(e) => holdToRepeat(e, () => nudgeTempo(TEMPO_STEP))}
        onclick={(e) => keyActivate(e, () => nudgeTempo(TEMPO_STEP))}
        onpointerup={stopRepeat}
        onpointercancel={stopRepeat}
        onpointerleave={stopRepeat}
      ><Plus size={16} /></button>
    </div>

    <div class="stepper">
      <button
        type="button"
        aria-label="Key down"
        onpointerdown={(e) => holdToRepeat(e, () => nudgeKey(-1))}
        onclick={(e) => keyActivate(e, () => nudgeKey(-1))}
        onpointerup={stopRepeat}
        onpointercancel={stopRepeat}
        onpointerleave={stopRepeat}
      ><Minus size={16} /></button>
      <span class="cell">
        <span class="cell-label">KEY</span>
        <span class="cell-value">{st.key}</span>
      </span>
      <button
        type="button"
        aria-label="Key up"
        onpointerdown={(e) => holdToRepeat(e, () => nudgeKey(1))}
        onclick={(e) => keyActivate(e, () => nudgeKey(1))}
        onpointerup={stopRepeat}
        onpointercancel={stopRepeat}
        onpointerleave={stopRepeat}
      ><Plus size={16} /></button>
    </div>

    <div class="stepper">
      <button
        type="button"
        aria-label="Pitch down"
        onpointerdown={(e) => holdToRepeat(e, () => nudgePitch(-1))}
        onclick={(e) => keyActivate(e, () => nudgePitch(-1))}
        onpointerup={stopRepeat}
        onpointercancel={stopRepeat}
        onpointerleave={stopRepeat}
      ><Minus size={16} /></button>
      <span class="cell">
        <span class="cell-label">PITCH</span>
        <span class="cell-value">{pitchLabel}<em>st</em></span>
      </span>
      <button
        type="button"
        aria-label="Pitch up"
        onpointerdown={(e) => holdToRepeat(e, () => nudgePitch(1))}
        onclick={(e) => keyActivate(e, () => nudgePitch(1))}
        onpointerup={stopRepeat}
        onpointercancel={stopRepeat}
        onpointerleave={stopRepeat}
      ><Plus size={16} /></button>
    </div>

    <!-- Full width on its own row: it is the only control here that changes the
         picture rather than the sound, and an odd fifth cell in a two-column
         grid would have left a hole beside it anyway. -->
    <div class="stepper stepper-wide">
      <button
        type="button"
        aria-label="Advance less often"
        onpointerdown={(e) => holdToRepeat(e, () => nudgeAdvance(-1))}
        onclick={(e) => keyActivate(e, () => nudgeAdvance(-1))}
        onpointerup={stopRepeat}
        onpointercancel={stopRepeat}
        onpointerleave={stopRepeat}
      ><Minus size={16} /></button>
      <span class="cell">
        <span class="cell-label">NEXT CLIP</span>
        <span class="cell-value" class:is-off={$advanceMode === 'hold'}>
          {advanceLabel}{#if $advanceMode !== 'hold'}<em>BR</em>{/if}
        </span>
      </span>
      <button
        type="button"
        aria-label="Advance more often"
        onpointerdown={(e) => holdToRepeat(e, () => nudgeAdvance(1))}
        onclick={(e) => keyActivate(e, () => nudgeAdvance(1))}
        onpointerup={stopRepeat}
        onpointercancel={stopRepeat}
        onpointerleave={stopRepeat}
      ><Plus size={16} /></button>
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
    gap: 8px;
    padding: 10px 12px 10px;
    background: transparent;
    font-family: var(--font-ui);
  }

  .mt.perform {
    gap: 6px;
    padding: 6px calc(12px + var(--m-safe-right, 0px)) 6px
      calc(12px + var(--m-safe-left, 0px));
  }
  /* Landscape floats these over the live canvas, so they take the tint rather
     than a per-frame backdrop blur — see --m-blur-over-picture. */
  .mt.perform .browse,
  .mt.perform .play,
  .mt.perform .stepper {
    backdrop-filter: var(--m-blur-over-picture, none);
    -webkit-backdrop-filter: var(--m-blur-over-picture, none);
    background-color: rgba(10, 12, 14, 0.72);
    background-image: var(--m-bevel-face, linear-gradient(180deg, #1e2227 0%, #171a1e 55%, #131518 100%));
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  /* Same bevel family as PLAY but a step smaller and unlit, so the primary
     action still reads first in the row. */
  .browse {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--m-tap, 44px);
    height: var(--m-tap, 44px);
    padding: 0;
    border: 1px solid;
    border-color: var(--m-bevel-edge, #2a2e34 #16181a #121416 #16181a);
    border-radius: var(--m-radius, 2px);
    background: var(--m-bevel-face, linear-gradient(180deg, #1e2227 0%, #171a1e 55%, #131518 100%));
    box-shadow: var(--m-bevel-in, inset 0 1px 0 rgba(255, 255, 255, 0.05), inset 0 -2px 3px rgba(0, 0, 0, 0.48));
    color: var(--m-ink-dim, #8a93a0);
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .browse:active {
    color: var(--m-ink, #e5e7eb);
    background: #14171a;
  }

  .play {
    position: relative;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--m-tap-lg, 48px);
    height: var(--m-tap-lg, 48px);
    padding: 0;
    border: 1px solid;
    border-color: var(--m-bevel-edge, #2a2e34 #16181a #121416 #16181a);
    border-radius: var(--m-radius, 2px);
    background: var(--m-bevel-face, linear-gradient(180deg, #1e2227 0%, #171a1e 55%, #131518 100%));
    box-shadow: var(--m-bevel-in, inset 0 1px 0 rgba(255, 255, 255, 0.05), inset 0 -2px 3px rgba(0, 0, 0, 0.48));
    color: var(--m-ink-dim, #8a93a0);
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition:
      background var(--m-dur-fast, 120ms) var(--m-ease, ease),
      border-color var(--m-dur-fast, 120ms) var(--m-ease, ease),
      color var(--m-dur-fast, 120ms) var(--m-ease, ease);
  }
  .play:active {
    box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.7);
    background: #14171a;
  }
  .play[data-playing='true'] {
    border-color: color-mix(in srgb, var(--m-live, #22c55e) 50%, transparent);
    background: color-mix(in srgb, var(--m-live, #22c55e) 16%, #14171a);
    color: var(--m-live, #22c55e);
    box-shadow: 0 0 18px color-mix(in srgb, var(--m-live, #22c55e) 22%, transparent);
  }

  .beat {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 56px;
  }
  .beat-value {
    font-family: var(--font-mono);
    font-size: var(--m-text-xl, 19px);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .beat-value i {
    font-style: normal;
    color: var(--m-ink-faint, #555e6a);
    padding: 0 2px;
  }
  .beat-kicker {
    font-size: var(--m-text-xs, 11px);
    font-weight: 600;
    letter-spacing: 0.16em;
    color: var(--m-ink-faint, #555e6a);
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
    clip on the narrowest phones. Two rows cost height and every value
    stays legible, which is the better trade for controls meant to be used while
    watching the picture.
  */
  .rail {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .stepper {
    display: flex;
    align-items: stretch;
    height: var(--m-tap, 44px);
    border: 1px solid;
    border-color: var(--m-bevel-edge, #2a2e34 #16181a #121416 #16181a);
    border-radius: var(--m-radius, 2px);
    background: var(--m-bevel-face, linear-gradient(180deg, #1e2227 0%, #171a1e 55%, #131518 100%));
    box-shadow: var(--m-bevel-in, inset 0 1px 0 rgba(255, 255, 255, 0.05), inset 0 -2px 3px rgba(0, 0, 0, 0.48));
    overflow: hidden;
    min-width: 0;
  }

  .stepper button {
    position: relative;
    flex: 0 0 auto;
    width: var(--m-tap-sm, 36px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--m-ink-dim, #8a93a0);
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .stepper button:active {
    color: var(--m-ink, #e5e7eb);
    background: rgba(255, 255, 255, 0.07);
  }

  .cell {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border-left: 1px solid var(--m-line, #0d0e0f);
    border-right: 1px solid var(--m-line, #0d0e0f);
    background: var(--m-sunken, #070809);
  }
  .cell-label {
    font-size: var(--m-text-xs, 11px);
    font-weight: 600;
    letter-spacing: 0.14em;
    color: var(--m-ink-faint, #555e6a);
    line-height: 1;
  }
  .cell-value {
    font-family: var(--font-mono);
    font-size: var(--m-text-sm, 12px);
    font-variant-numeric: tabular-nums;
    color: var(--m-accent-soft, #99f6e4);
    text-shadow: 0 0 8px rgba(45, 212, 191, 0.35);
    line-height: 1;
    white-space: nowrap;
  }
  .cell-value em {
    font-style: normal;
    font-size: var(--m-text-xs, 11px);
    color: var(--m-ink-faint, #555e6a);
    padding-left: 1px;
  }

  .stepper-wide {
    grid-column: 1 / -1;
  }
  /* OFF is a real state, not a missing value, so it reads in the ink colour
     rather than the lit accent the other readouts use. */
  .cell-value.is-off {
    color: var(--m-ink-faint, #555e6a);
    text-shadow: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .play {
      transition: none;
    }
  }

  @media (max-height: 430px) {
    .mt.perform .beat-kicker {
      display: none;
    }
  }
</style>
