<script lang="ts">
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import { mobileToast } from './mobileUi';
  import { isPerformPosture } from './mobileEnv';

  /**
   * The phone's title bar. It carries the three things that must be true at a
   * glance from arm's length — where the browsers are, what app this is, and
   * whether the beat is running — and nothing else. Everything the desktop bar
   * does beyond that (tempo, pitch, presets, CRT) belongs in the sheet.
   */

  const td = $derived($transportDisplay);
  const beatOn = $derived(td.playing && td.beatPhase < 0.15);

  /**
   * Landscape floats the bar over the picture instead of stacking above it. The
   * picture is the product in perform posture, so 44px of chrome would be 44px
   * of picture; a fixed, translucent bar costs nothing but contrast.
   */
  const floating = $derived($isPerformPosture);
</script>

<!--
  The browser key is not here.

  It used to sit in this row's left corner while the drawer it opens rises from
  the bottom of the screen, so the control and the thing it controls were at
  opposite ends of the viewport and the sheet appeared to come from nowhere.
  A sheet should look like it comes from its button. The key now lives at the
  left of the transport row, which is the bottom edge and also the reachable
  end of a phone.
-->
<header class="mtb" class:floating>
  <div class="mtb-row">
    <div class="mtb-brand">
      <span class="mtb-word">BEATSMAXXER</span>
      <span class="mtb-pro">PRO</span>
    </div>

    <div class="mtb-bpm" aria-label="Tempo {Math.round(td.bpm)} BPM">
      <span class="mtb-pip" class:on={beatOn} aria-hidden="true"></span>
      <span class="mtb-bpm-value">{Math.round(td.bpm).toString().padStart(3, '0')}</span>
      <span class="mtb-bpm-unit">BPM</span>
    </div>
  </div>

  {#if $mobileToast}
    <div class="mtb-toast" role="status">{$mobileToast}</div>
  {/if}
</header>

<style>
  .mtb {
    position: relative;
    z-index: 40;
    flex: 0 0 auto;
    width: 100%;
    padding-top: var(--m-safe-top, 0px);
    background: var(--m-glass, rgba(8, 10, 12, 0.22));
    backdrop-filter: var(--m-blur, blur(4px));
    -webkit-backdrop-filter: var(--m-blur, blur(4px));
    border-bottom: 1px solid color-mix(in srgb, var(--m-line-soft, #1e2226) 70%, transparent);
    font-family: var(--font-ui);
    touch-action: manipulation;
  }

  /* Floating means over the live picture, where a backdrop-filter is re-blurred
     by the compositor on every canvas frame. The gradient already carries the
     contrast — see --m-blur-over-picture. */
  .mtb.floating {
    position: fixed;
    inset: 0 0 auto 0;
    background: linear-gradient(180deg, rgba(10, 11, 12, 0.82), rgba(10, 11, 12, 0));
    border-bottom: none;
    backdrop-filter: var(--m-blur-over-picture, none);
    -webkit-backdrop-filter: var(--m-blur-over-picture, none);
    padding-left: var(--m-safe-left, 0px);
    padding-right: var(--m-safe-right, 0px);
    pointer-events: none;
  }
  .mtb.floating .mtb-row {
    height: 44px;
  }
  .mtb.floating .mtb-bpm {
    pointer-events: auto;
  }

  .mtb-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--m-gap, 8px);
    height: var(--m-topbar-h, 48px);
    padding: 0 8px;
  }

  .mtb-brand {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
  }

  .mtb-word {
    font-family: var(--font-brand);
    font-size: var(--m-text-md, 13px);
    font-weight: 600;
    letter-spacing: 0.18em;
    color: var(--m-ink, #e5e7eb);
    white-space: nowrap;
  }

  .mtb-pro {
    font-family: var(--font-brand);
    font-size: var(--m-text-xs, 11px);
    font-weight: 600;
    letter-spacing: 0.16em;
    color: var(--m-accent, #2dd4bf);
    border: 1px solid color-mix(in srgb, var(--m-accent, #2dd4bf) 28%, transparent);
    border-radius: var(--m-radius-xs, 6px);
    padding: 2px 5px;
    line-height: 1;
  }

  .mtb-bpm {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    min-width: var(--m-tap, 44px);
    height: 32px;
    padding: 0 8px 0 6px;
    border-radius: var(--m-radius-pill, 999px);
    background: var(--m-sunken, #070809);
    box-shadow: inset 0 0 0 1px var(--m-line-soft, #1e2226);
  }

  .mtb-pip {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #1e2226;
    transition:
      background 40ms linear,
      box-shadow 40ms linear;
  }
  .mtb-pip.on {
    background: var(--m-tempo, #e2a030);
    box-shadow: 0 0 8px var(--m-tempo, #e2a030);
  }

  .mtb-bpm-value {
    font-family: var(--font-mono);
    font-size: var(--m-text-md, 13px);
    font-variant-numeric: tabular-nums;
    color: var(--m-tempo, #e2a030);
    line-height: 1;
  }

  .mtb-bpm-unit {
    font-size: var(--m-text-xs, 11px);
    font-weight: 500;
    letter-spacing: 0.12em;
    color: var(--m-ink-faint, #555e6a);
  }

  .mtb-toast {
    padding: 6px 14px 8px;
    background: transparent;
    border-top: none;
    color: var(--m-accent-soft, #99f6e4);
    font-size: var(--m-text-xs, 11px);
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mtb.floating .mtb-toast {
    background: rgba(10, 11, 12, 0.72);
    margin: 0 10px 8px;
    padding: 6px 12px;
    border-radius: var(--m-radius-sm, 8px);
  }
</style>
