<script lang="ts">
  import { Menu } from '@lucide/svelte';
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import { openDrawer, mobileToast } from './mobileUi';
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

<header class="mtb" class:floating>
  <div class="mtb-row">
    <button
      type="button"
      class="mtb-menu"
      aria-label="Open clip and effect browsers"
      onclick={() => openDrawer('clips')}
    >
      <Menu size={20} />
    </button>

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
    /* mobile.css resolves the four insets into tokens; read those rather than
       spelling env() out again per component. */
    padding-top: var(--m-safe-top, 0px);
    background: linear-gradient(180deg, #16181a 0%, #101112 100%);
    border-bottom: 1px solid var(--m-line, #0d0e0f);
    font-family: var(--font-ui);
    /* The bar is chrome; taps belong to its own controls. */
    touch-action: manipulation;
  }

  /* Perform posture: out of flow entirely, so the stage gets the whole viewport
     and this rides over the top edge of the picture. */
  .mtb.floating {
    position: fixed;
    inset: 0 0 auto 0;
    background: linear-gradient(180deg, rgba(10, 11, 12, 0.82), rgba(10, 11, 12, 0));
    border-bottom: none;
    backdrop-filter: blur(8px) saturate(0.8);
    -webkit-backdrop-filter: blur(8px) saturate(0.8);
    /* Landscape notches live on the short edges. */
    padding-left: var(--m-safe-left, 0px);
    padding-right: var(--m-safe-right, 0px);
    pointer-events: none;
  }
  .mtb.floating .mtb-row {
    height: 40px;
  }
  .mtb.floating .mtb-menu,
  .mtb.floating .mtb-bpm {
    pointer-events: auto;
  }

  .mtb-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    height: 44px;
    padding: 0 6px;
  }

  .mtb-menu {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    /* 44px is the floor for a thumb; the desktop's 14px icon buttons are not
       reachable targets on glass. */
    width: var(--m-tap, 44px);
    height: var(--m-tap, 44px);
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: #8a939f;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .mtb-menu:active {
    color: #dfe6ee;
  }

  .mtb-brand {
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
    overflow: hidden;
  }

  .mtb-word {
    font-family: var(--font-brand);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.16em;
    color: #c8d2dc;
    white-space: nowrap;
  }

  .mtb-pro {
    font-family: var(--font-brand);
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.18em;
    color: #5a6472;
    border: 1px solid #23282e;
    border-radius: 2px;
    padding: 1px 3px;
    line-height: 1;
  }

  .mtb-bpm {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    /* Matches the hamburger's footprint so the wordmark stays optically centred. */
    min-width: 44px;
    height: 44px;
    padding-right: 6px;
  }

  .mtb-pip {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #1e2226;
    transition:
      background 40ms linear,
      box-shadow 40ms linear;
  }
  .mtb-pip.on {
    background: #f59e0b;
    box-shadow: 0 0 6px #f59e0b;
  }

  .mtb-bpm-value {
    font-family: var(--font-mono);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: #e2a030;
    line-height: 1;
  }

  .mtb-bpm-unit {
    font-size: 8px;
    font-weight: 500;
    letter-spacing: 0.16em;
    color: #3c434c;
  }

  /* A hairline of text, not a card that shoves the picture down. */
  .mtb-toast {
    padding: 4px 12px;
    background: #0a0b0c;
    border-top: 1px solid #0d0e0f;
    color: #8ec5ff;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mtb.floating .mtb-toast {
    background: rgba(10, 11, 12, 0.78);
    border-top: none;
    margin: 0 6px;
    border-radius: 2px;
  }
</style>
