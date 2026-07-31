<script lang="ts">
  import type { ModuleDefinition } from '$lib/modules/catalog';
  import WebGpuCanvas from '$lib/components/WebGpuCanvas.svelte';
  import ScreenOverlay from '$lib/components/rack/ScreenOverlay.svelte';
  import ScreenBadge from '$lib/components/rack/ScreenBadge.svelte';
  import VUMeter from '$lib/components/rack/VUMeter.svelte';
  import { parseAccentColor } from '$lib/modules/registry';
  import { pgmSource } from '$lib/stores/pgm';
  import { bypassed, moduleParams, videoLayers } from '$lib/stores/rack';
  import { transportDisplay } from '$lib/stores/transportDisplay';

  interface Props {
    modules: ModuleDefinition[];
  }

  let { modules }: Props = $props();

  const live = $derived(modules.find((m) => m.id === $pgmSource) ?? modules[0]);
  const clip = $derived(live ? $videoLayers[live.id] : null);
  const params = $derived(live ? ($moduleParams[live.id] ?? {}) : {});
  const liveColor = $derived(parseAccentColor(live?.accentColor ?? '#38bdf8'));
  const isBypassed = $derived(live ? ($bypassed[live.id] ?? false) : false);
  const td = $derived($transportDisplay);
</script>

<div
  style="flex:0 0 auto;height:clamp(260px, 28vh, 460px);display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#101214,#0c0d0f);border-bottom:2px solid #0d0e0f;padding:6px;min-width:0;container-type:size"
>
  {#if live}
    <div
      style="position:relative;aspect-ratio:16/9;width:min(100%, calc(100cqh * 16 / 9));background:#000;border:1px solid #1a1c1e;border-radius:2px;overflow:hidden"
    >
      <WebGpuCanvas id="pgm" moduleId={live.id} color={liveColor} class="absolute inset-0 w-full h-full" />
      <ScreenOverlay />
      <ScreenBadge
        text={isBypassed
          ? `PGM · ${live.name} · BYPASSED`
          : `PGM · ${live.name} · MIX ${Math.round(params.mix ?? 50)}%`}
        color={isBypassed ? '#ef4444' : live.accentColor}
      />
      <div
        style="position:absolute;bottom:4px;left:5px;z-index:10;background:rgba(0,0,0,0.7);border-radius:2px;padding:0 4px"
      >
        <span style="font-family:var(--font-mono);font-size:6.5px;color:#566070;letter-spacing:0.08em">
          {clip ? clip.name : 'SRC · TEST PATTERN'}
        </span>
      </div>
      <div
        style="position:absolute;top:4px;right:5px;z-index:8;display:flex;gap:2px;align-items:flex-end;opacity:0.5"
      >
        <VUMeter value={td.bassAmp * 100} color={live.accentColor} />
        <VUMeter value={td.amplitude * 200} color={live.accentColor} />
      </div>
      <div
        style="position:absolute;inset:0;z-index:6;pointer-events:none;border:1px solid {live.accentColor}44"
      ></div>
    </div>
  {/if}
</div>
