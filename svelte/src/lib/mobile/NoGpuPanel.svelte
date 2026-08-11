<script lang="ts">
  /**
   * Stands in for the picture when the browser cannot run the shaders.
   *
   * WebGPU is not a given on a phone: it needs Chrome/Edge on Android or
   * Safari on a recent iOS, and every other browser on the device — including
   * every third-party iOS browser, which is Safari underneath but often an
   * older one — falls through to here.
   *
   * The important part is what it does *not* do: it does not blank the app.
   * The selected module is still named, described and tinted with its own
   * accent, so the phone reads as an instrument you cannot currently hear
   * rather than as a page that failed to load. Paging modules still works
   * behind it.
   *
   * Complements CapabilityGate rather than repeating it: that component is the
   * desktop's corner toast and now suppresses itself while the phone shell is
   * mounted, because this panel is the phone's version of the same news.
   */
  import { MonitorOff } from '@lucide/svelte';
  import { capabilities } from '$lib/stores/capabilities';
  import { activeModule } from './mobileSession';

  // 'checking' also reports webgpu:false, so keying off `webgpu` alone would
  // flash this panel over the picture for the length of the probe.
  const unavailable = $derived($capabilities.renderer === 'webgpu_unavailable');
  const accent = $derived($activeModule?.accentColor ?? '#2dd4bf');
</script>

{#if unavailable}
  <div class="nogpu" style="--accent:{accent}" role="status" aria-live="polite">
    <div class="grid" aria-hidden="true"></div>

    <div class="inner">
      <div class="head">
        <span class="icon" aria-hidden="true"><MonitorOff size={14} strokeWidth={1.75} /></span>
        <span class="kicker">NO GPU PIPELINE</span>
      </div>

      <p class="lede">This browser can’t run the shaders, so there’s no picture to show.</p>

      <ul class="browsers">
        <li>Chrome or Edge on Android</li>
        <li>Safari on iOS 26 or newer</li>
        <li>Chrome, Edge or Safari on desktop</li>
      </ul>

      {#if $activeModule}
        <div class="module">
          <span class="module-label">SELECTED MODULE</span>
          <span class="module-name">{$activeModule.name}</span>
          {#if $activeModule.description}
            <span class="module-desc">{$activeModule.description}</span>
          {/if}
        </div>
      {/if}

      {#if $capabilities.reason}
        <span class="reason">{$capabilities.reason}</span>
      {/if}
    </div>
  </div>
{/if}

<style>
  .nogpu {
    position: relative;
    /* Fills a sized stage; falls back to the picture's 16:9 when the parent has
       no definite height (aspect-ratio only applies when a dimension is auto). */
    width: 100%;
    height: 100%;
    aspect-ratio: 16 / 9;
    /* Only bites in the fallback case: 16:9 of a landscape phone is taller than
       the phone, and the panel must never push the transport off the screen. */
    max-height: 100dvh;
    overflow: hidden;
    background:
      radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 68%),
      #070809;
    font-family: var(--font-ui);
  }

  /* Faint engineering grid — the panel should look like part of the instrument,
     not like an error page dropped into it. */
  .grid {
    position: absolute;
    inset: 0;
    opacity: 0.5;
    background-image:
      linear-gradient(90deg, rgba(255, 255, 255, 0.022) 1px, transparent 1px),
      linear-gradient(180deg, rgba(255, 255, 255, 0.022) 1px, transparent 1px);
    background-size: 28px 28px;
  }

  .inner {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 9px;
    align-items: flex-start;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 16px calc(16px + var(--m-safe-right, 0px)) 16px calc(16px + var(--m-safe-left, 0px));
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .icon {
    display: flex;
    color: var(--accent);
  }

  .kicker {
    color: var(--accent);
    font-size: var(--m-text-xs, 11px);
    font-weight: 500;
    letter-spacing: var(--m-track-wide, 0.26em);
    text-transform: uppercase;
    line-height: 1;
  }

  .lede {
    max-width: 46ch;
    margin: 0;
    color: #c2cad2;
    font-size: var(--m-text-lg, 15px);
    line-height: 1.4;
  }

  .browsers {
    display: flex;
    flex-wrap: wrap;
    gap: 5px 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .browsers li {
    padding: 5px 8px;
    border: 1px solid var(--m-line-soft, #1e2226);
    border-radius: var(--m-radius, 2px);
    background: rgba(255, 255, 255, 0.02);
    color: var(--m-ink-dim, #7a8090);
    font-size: var(--m-text-xs, 11px);
    letter-spacing: 0.06em;
    line-height: 1.1;
  }

  /* The app is not dead: whatever module is selected is still named here, with
     its own accent, so paging modules visibly does something. */
  .module {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 3px;
    padding: 8px 10px 9px;
    border: 1px solid var(--m-line-soft, #1e2226);
    border-left: 2px solid var(--accent);
    border-radius: var(--m-radius, 2px);
    background: rgba(10, 11, 12, 0.72);
  }

  .module-label {
    color: var(--m-ink-faint, #4a515c);
    font-size: var(--m-text-xs, 11px);
    font-weight: 500;
    letter-spacing: var(--m-track, 0.16em);
    line-height: 1;
  }

  .module-name {
    color: #e7edf2;
    font-size: var(--m-text-xl, 19px);
    font-weight: 500;
    letter-spacing: 0.08em;
    line-height: 1.05;
  }

  .module-desc {
    color: var(--m-ink-dim, #7a8090);
    font-size: var(--m-text-sm, 12px);
    line-height: 1.3;
  }

  .reason {
    color: #3d434c;
    font-family: var(--font-mono);
    font-size: var(--m-text-xs, 11px);
    letter-spacing: 0.02em;
    overflow-wrap: anywhere;
  }

  /* Landscape is short. Tighten everything, and drop the raw probe reason —
     it is the only line here that is for a developer rather than the user. The
     browser list stays: it is the answer to "what do I do about this". */
  @media (orientation: landscape) and (max-height: 500px) {
    .inner {
      gap: 7px;
      padding-top: 12px;
      padding-bottom: 12px;
    }
    .lede {
      font-size: var(--m-text-md, 13px);
    }
    .browsers li {
      padding: 4px 7px;
    }
    .module {
      padding: 6px 9px 7px;
    }
    .module-name {
      font-size: var(--m-text-lg, 15px);
    }
    .reason {
      display: none;
    }
  }
</style>
