<script lang="ts">
  import type { ModuleDefinition } from '$lib/modules/catalog';
  import WebGpuCanvas from '$lib/components/WebGpuCanvas.svelte';
  import ScreenOverlay from '$lib/components/rack/ScreenOverlay.svelte';
  import { screenFxViewer } from '$lib/stores/screenFx';
  import VUMeter from '$lib/components/rack/VUMeter.svelte';
  import { parseAccentColor } from '$lib/modules/registry';
  import { pgmSource } from '$lib/stores/pgm';
  import {
    bypassed,
    currentRackSlotForModule,
    moduleParams,
    rackBottom,
    rackTop,
    videoLayers
  } from '$lib/stores/rack';
  import { transportDisplay } from '$lib/stores/transportDisplay';

  interface Props {
    modules: ModuleDefinition[];
  }

  let { modules }: Props = $props();

  const live = $derived(modules.find((m) => m.id === $pgmSource) ?? modules[0]);
  const sourceSlot = $derived(
    live ? currentRackSlotForModule(live.id, $rackTop, $rackBottom) : null
  );
  const clip = $derived(sourceSlot ? $videoLayers[sourceSlot] : null);
  const params = $derived(live ? ($moduleParams[live.id] ?? {}) : {});
  const liveColor = $derived(parseAccentColor(live?.accentColor ?? '#38bdf8'));
  const isBypassed = $derived(live ? ($bypassed[live.id] ?? false) : false);
  const td = $derived($transportDisplay);

  const bar = $derived(Math.floor(td.beat / 4) + 1);
  const beatInBar = $derived((Math.floor(td.beat) % 4) + 1);
</script>

<!--
  The band is height-driven: the screen is 16:9 sized off the container height,
  so on any wide window it leaves several hundred pixels of black on each side.
  That space now carries the readouts that used to sit on the image at 6.5px —
  the operator reads them from across the room, and the picture stays clean.
  Gutters flex, so they absorb whatever the screen does not use at any width.
-->
<div class="main-viewer">
  {#if live}
    <aside class="pgm-gutter pgm-gutter-left">
      <span class="pgm-kicker">PROGRAM</span>
      <span class="pgm-module" style="color:{live.accentColor}">{live.name}</span>
      {#if isBypassed}
        <span class="pgm-state is-bypassed">BYPASSED</span>
      {:else}
        <span class="pgm-state">MIX {Math.round(params.mix ?? 50)}%</span>
      {/if}
      <span class="pgm-rule" style="background:{live.accentColor}33"></span>
      <span class="pgm-kicker">SOURCE</span>
      <span class="pgm-source" title={clip ? clip.name : 'Test pattern'}>
        {clip ? clip.name : 'TEST PATTERN'}
      </span>
    </aside>

    <div class="pgm-screen" style="border-color:{live.accentColor}44">
      <WebGpuCanvas id="pgm" moduleId={live.id} color={liveColor} class="absolute inset-0 w-full h-full" />
      {#if $screenFxViewer}<ScreenOverlay variant="viewer" />{/if}
    </div>

    <aside class="pgm-gutter pgm-gutter-right">
      <span class="pgm-kicker">TRANSPORT</span>
      <span class="pgm-bpm">
        {Math.round(td.bpm)}<small>BPM</small>
        {#if td.bpmLocked}<em class="pgm-lock">LOCK</em>{/if}
      </span>
      <span class="pgm-state" class:is-idle={!td.playing}>
        BAR {bar} · BEAT {beatInBar}
      </span>
      <span class="pgm-rule" style="background:{live.accentColor}33"></span>
      <div class="pgm-meters">
        <VUMeter value={td.bassAmp * 100} color={live.accentColor} />
        <VUMeter value={td.amplitude * 200} color={live.accentColor} />
        <div class="pgm-meter-legend">
          <span>BASS</span>
          <span>PEAK</span>
        </div>
      </div>
      <span class="pgm-source" title={td.trackName || 'No track loaded'}>
        {td.trackName || 'NO TRACK'}
      </span>
    </aside>
  {/if}
</div>

<style>
  .main-viewer {
    flex: 0 0 auto;
    height: clamp(260px, 28vh, 460px);
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: 14px;
    background: linear-gradient(180deg, #101214, #0c0d0f);
    border-bottom: 2px solid #0d0e0f;
    padding: 6px;
    min-width: 0;
    container-type: size;
  }

  .pgm-screen {
    position: relative;
    flex: 0 0 auto;
    align-self: center;
    aspect-ratio: 16 / 9;
    /* Height-bound: 100cqh is the band's inner height, so the screen is as
       large as the band allows and never pushes the gutters to zero. */
    width: min(100%, calc(100cqh * 16 / 9));
    background: #000;
    border: 1px solid;
    border-radius: 2px;
    overflow: hidden;
  }

  .pgm-gutter {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    overflow: hidden;
    padding: 2px 0;
  }
  /* Both columns read inward, so the two blocks frame the picture rather than
     drifting off toward the window edges as the band gets wider. */
  .pgm-gutter-left {
    align-items: flex-end;
    text-align: right;
  }
  .pgm-gutter-right {
    align-items: flex-start;
    text-align: left;
  }

  .pgm-kicker {
    font-family: var(--font-ui);
    font-size: 7px;
    font-weight: 500;
    letter-spacing: 0.22em;
    color: #33383f;
    white-space: nowrap;
  }

  .pgm-module {
    font-family: var(--font-ui);
    font-size: 21px;
    font-weight: 500;
    line-height: 1.05;
    letter-spacing: 0.04em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .pgm-state {
    font-family: var(--font-ui);
    font-size: 9px;
    font-weight: 500;
    letter-spacing: 0.14em;
    color: #7a8090;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .pgm-state.is-bypassed {
    color: #ef4444;
  }
  .pgm-state.is-idle {
    color: #3a4050;
  }

  .pgm-rule {
    width: 34px;
    height: 1px;
    flex-shrink: 0;
    margin: 4px 0;
  }

  .pgm-source {
    font-family: var(--font-mono);
    font-size: 8px;
    letter-spacing: 0.04em;
    color: #566070;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .pgm-bpm {
    display: flex;
    align-items: baseline;
    gap: 3px;
    font-family: var(--font-ui);
    font-size: 21px;
    font-weight: 500;
    line-height: 1.05;
    color: #cfe0e2;
    font-variant-numeric: tabular-nums;
  }
  .pgm-bpm small {
    font-size: 7px;
    letter-spacing: 0.18em;
    color: #33383f;
  }
  .pgm-lock {
    font-size: 6.5px;
    font-style: normal;
    letter-spacing: 0.14em;
    color: #4ade80;
    border: 1px solid #4ade8055;
    border-radius: 2px;
    padding: 0 2px;
  }

  .pgm-meters {
    display: flex;
    align-items: flex-end;
    gap: 4px;
  }
  .pgm-meter-legend {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 36px;
    padding-left: 1px;
  }
  .pgm-meter-legend span {
    font-family: var(--font-ui);
    font-size: 6px;
    letter-spacing: 0.12em;
    color: #2b3038;
    line-height: 1;
  }

  /* Narrow windows have no spare width to give away — drop the readouts and let
     the picture have the band. 960px is the app's existing stacking breakpoint
     in app.css; a second, nearby breakpoint would only add a band of widths
     where the layout has stacked but the gutters have not yet gone. */
  @media (max-width: 960px) {
    .pgm-gutter {
      display: none;
    }
  }
</style>
