<script lang="ts">
  /**
   * Two parameters, one finger, on the picture itself.
   *
   * This is the one control the phone can do better than the rack. The desktop
   * dials effects with a mouse, which is a single point moving one slider at a
   * time, and the reason the rack lays out rows of them. A phone has a large,
   * direct, absolute-positioned input surface — you put your finger where you
   * want the value to be, on both axes at once, without looking at a control.
   * That is a genuinely different instrument, not a smaller version of the same
   * one, and it costs nothing on the GPU: the pad writes parameters and draws
   * two lines.
   *
   * It also solves the phone's real ergonomic problem. The controls live in a
   * sheet, so dialling means covering the thing you are dialling and watching
   * the effect land through a gap. Here the control surface IS the picture.
   *
   * The axes are not configured anywhere. `mobileSpecForModule` already names
   * each module's two continuous parameters in the order its author put them
   * in, which is the same pair the sheet renders as its first two faders — so
   * the pad and the sheet always disagree about nothing, and a module added
   * later gets a pad for free.
   *
   * Off by default. Touching the picture is not obviously a parameter gesture,
   * so the stage arms it explicitly and says which two parameters it has.
   */
  import { moduleParams, updateParam, beginRackParamTransaction, endRackParamTransaction } from '$lib/stores/rack';
  import { mobileSpecForModule } from './moduleControlSpecs';
  import { activeModuleId } from './mobileSession';
  import { macroPadArmed } from './mobileUi';

  interface Props {
    accent: string;
  }
  let { accent }: Props = $props();

  const spec = $derived(mobileSpecForModule($activeModuleId));
  const axisX = $derived(spec?.sliders?.[0] ?? null);
  const axisY = $derived(spec?.sliders?.[1] ?? null);
  /** A module with fewer than two continuous parameters has no pad to offer. */
  const usable = $derived(Boolean(axisX && axisY));

  const params = $derived($moduleParams[$activeModuleId] ?? {});
  const valueX = $derived(clamp(params[axisX?.param ?? ''] ?? 50));
  const valueY = $derived(clamp(params[axisY?.param ?? ''] ?? 50));

  let pad = $state<HTMLDivElement>();
  let holding = $state(false);
  /** Read once per gesture — see MobileFader for why this is not read per move. */
  let rect: { left: number; top: number; width: number; height: number } | null = null;
  let pointer = 0;

  function clamp(v: number) {
    return Math.max(0, Math.min(100, v));
  }

  function apply(clientX: number, clientY: number) {
    if (!rect || !axisX || !axisY) return;
    const x = clamp(((clientX - rect.left) / Math.max(1, rect.width)) * 100);
    // Inverted: up is more. Screen Y grows downward and every physical fader
    // ever built disagrees with it.
    const y = clamp(100 - ((clientY - rect.top) / Math.max(1, rect.height)) * 100);
    updateParam($activeModuleId, axisX.param, Math.round(x));
    updateParam($activeModuleId, axisY.param, Math.round(y));
  }

  function down(event: PointerEvent) {
    if (!usable || !pad) return;
    event.preventDefault();
    const box = pad.getBoundingClientRect();
    rect = { left: box.left, top: box.top, width: box.width, height: box.height };
    pointer = event.pointerId;
    holding = true;
    // One undo entry for the whole gesture, matching every other param control.
    beginRackParamTransaction();
    try {
      pad.setPointerCapture(event.pointerId);
    } catch {
      // Capture is an optimisation: it keeps the value following a finger that
      // has left the picture. Losing it must not cost the gesture.
    }
    navigator.vibrate?.(8);
    apply(event.clientX, event.clientY);
  }

  function move(event: PointerEvent) {
    if (!holding || event.pointerId !== pointer) return;
    event.preventDefault();
    apply(event.clientX, event.clientY);
  }

  function up(event: PointerEvent) {
    if (!holding || event.pointerId !== pointer) return;
    holding = false;
    rect = null;
    try {
      pad?.releasePointerCapture(event.pointerId);
    } catch {
      // Already gone.
    }
    endRackParamTransaction();
  }
</script>

{#if $macroPadArmed && usable}
  <!--
    role="application" rather than a slider: this is a two-axis continuous
    surface and there is no single value for a screen reader to announce. The
    sheet's two faders are the accessible route to the same parameters, and they
    stay in sync because both write the same store.
  -->
  <div
    bind:this={pad}
    class="pad"
    class:holding
    style="--accent:{accent};--x:{valueX};--y:{valueY}"
    role="application"
    aria-label="{axisX?.label} and {axisY?.label} macro pad"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
  >
    <span class="rule rule-v" aria-hidden="true"></span>
    <span class="rule rule-h" aria-hidden="true"></span>
    <span class="node" aria-hidden="true"></span>

    <span class="axis axis-x">{axisX?.label} <b>{Math.round(valueX)}</b></span>
    <span class="axis axis-y">{axisY?.label} <b>{Math.round(valueY)}</b></span>
  </div>
{/if}

<style>
  .pad {
    position: absolute;
    inset: 0;
    z-index: 3;
    /* The gesture is both axes at once, so the browser gets neither. Without
       this a vertical drag scrolls the shell and the pad only sees half of
       every stroke. */
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
    cursor: crosshair;
  }

  /*
    Crosshair, not a filled grid.

    Whatever is drawn here is drawn ON the picture the pad exists to let you
    watch, so it has to be legible against any frame and cover as close to none
    of it as possible. Two hairlines and a node read at a glance over bright and
    dark material alike; a grid or a translucent panel would be competing with
    the thing being judged.
  */
  .rule {
    position: absolute;
    background: color-mix(in srgb, var(--accent) 55%, transparent);
    box-shadow: 0 0 6px color-mix(in srgb, var(--accent) 45%, transparent);
    pointer-events: none;
    opacity: 0.5;
    transition: opacity var(--m-dur-fast, 120ms) linear;
  }
  .pad.holding .rule {
    opacity: 1;
  }

  .rule-v {
    top: 0;
    bottom: 0;
    width: 1px;
    left: calc(var(--x) * 1%);
  }
  .rule-h {
    left: 0;
    right: 0;
    height: 1px;
    /* --y is 0 at the bottom; the rule is positioned from the top. */
    top: calc((100 - var(--y)) * 1%);
  }

  .node {
    position: absolute;
    left: calc(var(--x) * 1%);
    top: calc((100 - var(--y)) * 1%);
    width: 14px;
    height: 14px;
    margin: -7px 0 0 -7px;
    border: 1.5px solid var(--accent);
    border-radius: 50%;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    box-shadow:
      0 0 10px color-mix(in srgb, var(--accent) 60%, transparent),
      0 1px 3px rgba(0, 0, 0, 0.8);
    pointer-events: none;
    transition: transform var(--m-dur-fast, 120ms) var(--m-ease, ease);
  }
  .pad.holding .node {
    transform: scale(1.5);
  }

  /* Readouts sit in the corners the crosshair is least likely to be in, and
     never take pointer events away from the surface. */
  .axis {
    position: absolute;
    font-family: var(--font-mono);
    font-size: var(--m-text-xs, 11px);
    letter-spacing: 0.1em;
    color: var(--m-ink-dim, #8a93a0);
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.95);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    white-space: nowrap;
  }
  .axis b {
    color: var(--accent);
    font-weight: 600;
  }
  .axis-x {
    right: 10px;
    bottom: 10px;
  }
  .axis-y {
    left: 10px;
    top: 10px;
  }

  @media (prefers-reduced-motion: reduce) {
    .node,
    .rule {
      transition: none;
    }
  }
</style>
