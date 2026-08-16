<script lang="ts">
  /**
   * The same instrument, shrunk — not the rack scaled down.
   *
   * The desktop control surface is built at 6.5–10px type on 14–30px targets,
   * which is a mouse's idea of dense and a thumb's idea of impossible. This
   * renders the *identical parameters* from `moduleControlSpecs.ts` at sizes a
   * finger can actually hit: pads at 46px, tracks at 44px, nothing under 11px.
   *
   * Every write goes through `updateParam`/`updateParams`, so the phone and the
   * rack are editing one store and a value dialled here is the value the desktop
   * shows. Drags are wrapped in a rack param transaction so a whole slide is one
   * undo step rather than sixty.
   */
  import { presetsForModule } from '$lib/modules/presets';
  import { sliderValueForKey } from '$lib/components/controlKeyboard';
  import {
    updateParam,
    updateParams,
    beginRackParamTransaction,
    endRackParamTransaction,
    runRackParamTransaction
  } from '$lib/stores/rack';
  import {
    mobileSpecForModule,
    primaryTolerance,
    PLUMBING_PARAMS,
    type MobileButtonGroup,
    type MobileButtonSpec
  } from './moduleControlSpecs';

  interface Props {
    moduleId: string;
    params: Record<string, number>;
    color: string;
  }
  let { moduleId, params, color }: Props = $props();

  const spec = $derived(mobileSpecForModule(moduleId));
  const presets = $derived(presetsForModule(moduleId));
  /** Modules with no authored spec get their raw params, as the rack's `{:else}` does. */
  const fallbackKeys = $derived(Object.keys(params).filter((k) => !PLUMBING_PARAMS.has(k)));

  /**
   * The track reserves half a thumb at each end so 0 and 100 sit inside it
   * rather than half off it. The width lives in CSS (`--thumb`) because MIX
   * uses a bigger one, and the maths has to agree with what is drawn or the
   * value under the finger drifts from the value in the readout.
   */
  const THUMB_FALLBACK = 22;

  function thumbWidth(el: HTMLElement): number {
    const raw = parseFloat(getComputedStyle(el).getPropertyValue('--thumb'));
    return Number.isFinite(raw) && raw > 0 ? raw : THUMB_FALLBACK;
  }

  function nearestSetLabel(
    group: MobileButtonGroup,
    values: Record<string, number>
  ): string | null {
    let best: string | null = null;
    let bestDistance = Infinity;
    for (const btn of group.buttons) {
      const keys = group.matchKeys ?? Object.keys(btn.set);
      let distance = 0;
      for (const key of keys) distance += Math.abs((values[key] ?? 0) - (btn.set[key] ?? 0));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = btn.label;
      }
    }
    return bestDistance <= (group.tolerance ?? 40) ? best : null;
  }

  function isActive(
    group: MobileButtonGroup,
    btn: MobileButtonSpec,
    values: Record<string, number>
  ): boolean {
    if (group.match === 'set') return nearestSetLabel(group, values) === btn.label;
    const want = btn.set[group.primary];
    if (want === undefined) return false;
    const current = values[group.primary];
    if (group.match === 'exact') return Math.round(current ?? NaN) === want;
    return Math.abs((current ?? 50) - want) <= primaryTolerance(group.buttons, group.primary);
  }

  function applyButton(group: MobileButtonGroup, btn: MobileButtonSpec) {
    const values: Record<string, number> = { ...btn.set };
    // TRANSITION fires the move you just chose, so the choice is visible at once.
    if (group.retrigger) values[group.retrigger] = ((params[group.retrigger] ?? 0) + 1) % 100;
    updateParams(moduleId, values);
  }

  function bump(param: string) {
    updateParam(moduleId, param, ((params[param] ?? 0) + 1) % 100);
  }

  function toggle(param: string) {
    updateParam(moduleId, param, (params[param] ?? 0) > 50 ? 0 : 100);
  }

  function presetActive(set: Record<string, number>): boolean {
    return Object.entries(set).every(([k, v]) => Math.abs((params[k] ?? -999) - v) <= 1);
  }

  /** "Whip bar — sharp 1-beat wipe" reads as "WHIP BAR" on a 46px pad. */
  function presetLabel(title: string): string {
    return (title.split('—')[0] ?? title).trim().toUpperCase();
  }

  /**
   * A slider that only answers to taps is a button in disguise. The whole
   * 44px track is the hit area, the pointer is captured on the way down, and
   * the value follows the finger for as long as it is held.
   */
  function slideDown(e: PointerEvent, key: string) {
    const el = e.currentTarget as HTMLElement;
    e.preventDefault();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Capture is an optimisation — it keeps the drag alive when the finger
      // leaves the track. Losing it must not cost us the drag itself.
    }
    beginRackParamTransaction();
    const thumb = thumbWidth(el);

    const apply = (clientX: number) => {
      const rect = el.getBoundingClientRect();
      const usable = Math.max(1, rect.width - thumb);
      const ratio = (clientX - rect.left - thumb / 2) / usable;
      updateParam(moduleId, key, Math.round(Math.max(0, Math.min(100, ratio * 100))));
    };

    const move = (ev: PointerEvent) => {
      if (ev.pointerId === e.pointerId) apply(ev.clientX);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      try {
        el.releasePointerCapture(ev.pointerId);
      } catch {
        // Already released, or the pointer is gone.
      }
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      endRackParamTransaction();
    };

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    apply(e.clientX);
  }

  function slideKey(e: KeyboardEvent, key: string, value: number) {
    const next = sliderValueForKey(e.key, value, 0, 100);
    if (next === null) return;
    e.preventDefault();
    runRackParamTransaction(() => updateParam(moduleId, key, Math.round(next)));
  }

  /** SPEEDRAMP's pads carry the curve they write; the label alone is a code. */
  function curvePath(c: { y0: number; x1: number; y1: number; x2: number; y2: number; y3: number }) {
    const X = (v: number) => 3 + (v / 100) * 38;
    const Y = (v: number) => 3 + ((100 - v) / 100) * 14;
    return `M ${X(0)} ${Y(c.y0)} C ${X(c.x1)} ${Y(c.y1)}, ${X(c.x2)} ${Y(c.y2)}, ${X(100)} ${Y(c.y3)}`;
  }
</script>

{#snippet slider(key: string, label: string, value: number, big: boolean)}
  <div class="row" class:big>
    <div class="row-head">
      <span class="row-label">{label}</span>
      <span class="row-val">{Math.round(value)}</span>
    </div>
    <!-- data-swipe-ignore keeps the sheet's horizontal paging gesture off the
         one control that is itself a horizontal drag. -->
    <div
      class="track"
      data-swipe-ignore
      data-bsp-proof-id="mobile-slider-{moduleId}-{key}"
      role="slider"
      tabindex="0"
      aria-label={label}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${Math.round(value)} percent`}
      onpointerdown={(e) => slideDown(e, key)}
      onkeydown={(e) => slideKey(e, key, value)}
    >
      <div class="groove">
        <div class="fill" style="width:{value}%"></div>
        {#each [25, 50, 75] as p (p)}
          <div class="tick" style="left:{p}%"></div>
        {/each}
      </div>
      <div
        class="thumb"
        style="left:calc(var(--thumb) / 2 + (100% - var(--thumb)) * {value} / 100)"
      ></div>
    </div>
  </div>
{/snippet}

{#snippet pad(label: string, active: boolean, onpress: () => void, curve?: {
  y0: number; x1: number; y1: number; x2: number; y2: number; y3: number;
})}
  <button type="button" class="pad" class:on={active} aria-pressed={active} onclick={onpress}>
    {#if curve}
      <svg class="pad-curve" viewBox="0 0 44 20" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="10" x2="44" y2="10" stroke="currentColor" stroke-width="0.5" opacity="0.25" />
        <path d={curvePath(curve)} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
    {/if}
    <span class="pad-label">{label}</span>
  </button>
{/snippet}

<div class="controls" style="--accent:{color}">
  {#if spec}
    {#each spec.groups as group (group.label)}
      <section class="group">
        <div class="group-label">{group.label}</div>
        <div
          class="pads"
          style={group.columns ? `grid-template-columns:repeat(${group.columns},1fr)` : ''}
        >
          {#each group.buttons as btn (btn.label)}
            {@render pad(btn.label, isActive(group, btn, params), () => applyButton(group, btn), btn.curve)}
          {/each}
        </div>
      </section>
    {/each}

    {#if (spec.toggles && spec.toggles.length) || (spec.actions && spec.actions.length)}
      <section class="group">
        <div class="group-label">TRIGGER</div>
        <div class="pads">
          {#each spec.toggles ?? [] as t (t.param)}
            {@render pad(t.label, (params[t.param] ?? 0) > 50, () => toggle(t.param))}
          {/each}
          {#each spec.actions ?? [] as a (a.param)}
            <button type="button" class="pad fire" onclick={() => bump(a.param)}>
              <span class="pad-label">{a.label}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <section class="group">
      <div class="group-label">PARAMS</div>
      {#each spec.sliders as sl (sl.param)}
        {@render slider(sl.param, sl.label, params[sl.param] ?? 50, false)}
      {/each}
    </section>
  {:else}
    <!-- No authored spec: show what the module actually has, minus plumbing —
         the same fallback the rack's final `{:else}` branch takes. -->
    <section class="group">
      <div class="group-label">PARAMS</div>
      {#each fallbackKeys as key (key)}
        {@render slider(key, key.toUpperCase(), params[key] ?? 50, false)}
      {/each}
    </section>
  {/if}

  {#if presets.length > 0}
    <section class="group">
      <div class="group-label">PRESET</div>
      <div class="pads">
        {#each presets as p (p.n)}
          {@render pad(presetLabel(p.title), presetActive(p.set), () => updateParams(moduleId, p.set))}
        {/each}
      </div>
    </section>
  {/if}

  <!-- MIX is the one control every module has, and the one you reach for while
       watching the picture. It sits last so the thumb finds it without looking. -->
  <section class="group mix">
    {@render slider('mix', 'MIX', params.mix ?? 100, true)}
  </section>
</div>

<style>
  .controls {
    display: flex;
    flex-direction: column;
    /* Seams, not gaps: the panels butt against each other like a rack unit. */
    gap: 0;
    padding: 0 0 6px;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 7px 10px 9px;
    background: transparent;
    border-top: 1px solid #1a1d20;
    border-bottom: none;
  }
  .group:last-of-type {
    border-bottom: none;
  }

  /* Engraved: a dark line above and a light line below is the standard cut-in
     pair, and it still reads at 11px on a phone. */
  .group-label {
    position: relative;
    padding-left: 9px;
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #5c6672;
    line-height: 1;
    text-shadow:
      0 -1px 0 rgba(0, 0, 0, 0.75),
      0 1px 0 rgba(255, 255, 255, 0.05);
  }
  /* A lit notch in the module's colour — says which module you are inside
     without printing its name a third time. */
  .group-label::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    width: 3px;
    height: 10px;
    margin-top: -5px;
    border-radius: 1px;
    background: var(--accent);
    box-shadow: 0 0 7px color-mix(in srgb, var(--accent) 55%, transparent);
  }

  .pads {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
    gap: 6px;
  }

  /* Flat VST-style pads — no 3D shadows or asymmetric borders. */
  .pad {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 34px;
    padding: 5px 4px;
    border: 1px solid #1e2226;
    border-radius: 2px;
    background: #181b1f;
    box-shadow: none;
    color: #4d5561;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition:
      background 90ms ease,
      border-color 90ms ease,
      color 90ms ease;
  }

  /* Expanded hit area. */
  .pad::after {
    content: '';
    position: absolute;
    inset: -6px -2px;
  }

  .pad.on {
    border-color: color-mix(in srgb, var(--accent) 50%, #1e2226);
    background: color-mix(in srgb, var(--accent) 12%, #181b1f);
    box-shadow: none;
    color: var(--accent);
  }

  .pad:active {
    background: #14171a;
  }

  .pad.fire {
    border-color: #2a1a1a;
    color: #c4585c;
  }
  .pad.fire:active {
    background: #1a1212;
    color: #ff8b8b;
  }

  .pad-label {
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    line-height: 1.1;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  @media (prefers-reduced-motion: reduce) {
    .pad {
      transition: none;
    }
  }

  .pad-curve {
    width: 100%;
    height: 20px;
    display: block;
  }

  .row {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .row-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .row-label {
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #626c78;
    text-shadow: 0 -1px 0 rgba(0, 0, 0, 0.7);
  }

  /* The number reads off a lit display, not off the panel. */
  .row-val {
    font-family: var(--font-mono);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.04em;
    color: var(--accent);
    text-shadow: 0 0 8px color-mix(in srgb, var(--accent) 40%, transparent);
  }

  /* Thin fader — matches the desktop HSlider proportions, scaled for touch. */
  .track {
    /* 6px, matching the rack's 5px handle rather than the 12px block that was
       here. The touch target is not this width -- .track::after grabs at 44px --
       so a slim handle costs nothing on a phone and the two shells stop looking
       like different instruments. --thumb also drives the position maths and
       thumbWidth(), so the drawn width and the value under the finger agree. */
    --thumb: 6px;
    position: relative;
    height: 26px;
    display: flex;
    align-items: center;
    touch-action: none;
    cursor: ew-resize;
    -webkit-tap-highlight-color: transparent;
  }
  /* Painted 26px, grabbed at 44px. */
  .track::after {
    content: '';
    position: absolute;
    inset: -9px 0;
  }

  .track:focus-visible {
    outline: 1px solid color-mix(in srgb, var(--accent) 60%, transparent);
    outline-offset: 2px;
    border-radius: 2px;
  }

  .groove {
    position: absolute;
    left: calc(var(--thumb) / 2);
    right: calc(var(--thumb) / 2);
    height: 3px;
    background: #141618;
    border: 1px solid #1e2022;
    border-radius: 0;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.65);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--accent) 20%, transparent),
      color-mix(in srgb, var(--accent) 45%, transparent)
    );
  }

  /* Quarter marks, same as the rack's track. */
  .tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: #25282c;
    pointer-events: none;
  }

  /* Flat thin handle — no gradients, no grip marks. */
  .thumb {
    position: absolute;
    top: 50%;
    width: var(--thumb);
    height: 18px;
    margin-top: -9px;
    transform: translateX(-50%);
    border-radius: 1px;
    border: 1px solid #333840;
    background: linear-gradient(180deg, #2a2e34, #181a1e);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
    pointer-events: none;
  }

  /* MIX gets a slightly taller groove and wider thumb — still flat. */
  .mix .row-label {
    font-size: 12px;
    letter-spacing: 0.26em;
    color: var(--accent);
    text-shadow: 0 0 9px color-mix(in srgb, var(--accent) 40%, transparent);
  }

  .mix .row-val {
    font-size: 17px;
  }

  .mix .groove {
    height: 4px;
  }

  .mix .track {
    --thumb: 7px;
    height: 34px;
  }
  .mix .thumb {
    height: 22px;
    margin-top: -11px;
  }
</style>
