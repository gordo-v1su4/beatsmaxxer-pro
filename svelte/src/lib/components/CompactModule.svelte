<script lang="ts">
  import { Film, Upload, X } from '@lucide/svelte';
  import type { ModuleDefinition } from '$lib/modules/catalog';
  import type { VideoLayer } from '$lib/engine/contracts';
  import { parseAccentColor } from '$lib/modules/registry';
  import { presetsForModule } from '$lib/modules/presets';
  import WebGpuCanvas from '$lib/components/WebGpuCanvas.svelte';
  import HeaderBtn from '$lib/components/rack/HeaderBtn.svelte';
  import RackBtn from '$lib/components/rack/RackBtn.svelte';
  import HSlider from '$lib/components/rack/HSlider.svelte';
  import MixSection from '$lib/components/rack/MixSection.svelte';
  import ScreenOverlay from '$lib/components/rack/ScreenOverlay.svelte';
  import ScreenBadge from '$lib/components/rack/ScreenBadge.svelte';
  import { bypassed, updateParam, toggleBypass } from '$lib/stores/rack';
  import { moduleCollapsed, toggleModuleCollapsed } from '$lib/stores/rackUi';

  interface Props {
    mod: ModuleDefinition;
    params: Record<string, number>;
    canvasId?: string;
    videoLayer?: VideoLayer | null;
    isOnAir?: boolean;
    onVideoUpload?: (file: File) => void;
    onVideosUpload?: (files: File[]) => void;
    onClearVideo?: () => void;
    onHeaderPointerDown?: (e: PointerEvent) => void;
  }

  let {
    mod,
    params,
    canvasId,
    videoLayer = null,
    isOnAir = false,
    onVideoUpload,
    onVideosUpload,
    onClearVideo,
    onHeaderPointerDown
  }: Props = $props();

  let dragOver = $state(false);
  let dragDepth = $state(0);
  let fileInput: HTMLInputElement;

  const color = $derived(parseAccentColor(mod.accentColor));
  const slotCanvasId = $derived(canvasId ?? mod.id);
  const modulePresets = $derived(presetsForModule(mod.id));
  const collapsed = $derived($moduleCollapsed[mod.id] === true);

  const COMPACT_CONTROLS: Record<
    string,
    {
      buttons: { label: string; set: Record<string, number> }[];
      primary: string;
      sliders: { param: string; label: string }[];
      toggle?: { param: string; label: string };
    }
  > = {
    punch: {
      buttons: [
        { label: 'IN', set: { dir: 10 } },
        { label: 'ALT', set: { dir: 50 } },
        { label: 'OUT', set: { dir: 90 } }
      ],
      primary: 'dir',
      sliders: [
        { param: 'amt', label: 'AMOUNT' },
        { param: 'snap', label: 'SNAP' }
      ]
    },
    shake: {
      buttons: [
        { label: 'WALK', set: { impact: 22, hand: 22, sway: 15 } },
        { label: 'RUN', set: { impact: 48, hand: 45, sway: 30 } },
        { label: 'CHASE', set: { impact: 72, hand: 68, sway: 50 } },
        { label: 'RIOT', set: { impact: 100, hand: 100, sway: 85 } }
      ],
      primary: 'impact',
      sliders: [
        { param: 'hand', label: 'HANDHELD' },
        { param: 'sway', label: 'SWAY' }
      ]
    },
    orbit: {
      buttons: [
        { label: 'SLOW', set: { spd: 15, drift: 32, nudge: 20 } },
        { label: 'MED', set: { spd: 45, drift: 55, nudge: 40 } },
        { label: 'FAST', set: { spd: 72, drift: 75, nudge: 60 } },
        { label: 'WARP', set: { spd: 100, drift: 100, nudge: 90 } }
      ],
      primary: 'spd',
      sliders: [
        { param: 'drift', label: 'DRIFT' },
        { param: 'nudge', label: 'NUDGE' }
      ]
    },
    focus: {
      buttons: [
        { label: 'SOFT', set: { pulse: 22, amt: 18, soft: 30 } },
        { label: 'PULL', set: { pulse: 52, amt: 30, soft: 45 } },
        { label: 'HARD', set: { pulse: 78, amt: 50, soft: 60 } },
        { label: 'BLIND', set: { pulse: 100, amt: 88, soft: 95 } }
      ],
      primary: 'pulse',
      sliders: [
        { param: 'amt', label: 'AMOUNT' },
        { param: 'soft', label: 'BLOOM' }
      ],
      toggle: { param: 'xeye', label: 'XEYE' }
    }
  };

  const spec = $derived(COMPACT_CONTROLS[mod.id]);

  function applyVideoFiles(files: File[]) {
    const clips = files.filter((f) => f.type.startsWith('video/'));
    if (clips.length === 0) return;
    if (clips.length > 1 && onVideosUpload) onVideosUpload(clips);
    else if (clips[0] && onVideoUpload) onVideoUpload(clips[0]);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="rack-module"
  class:is-collapsed={collapsed}
  style="background:#131416;border-right:1px solid #0d0e0f;opacity:{$bypassed[mod.id] ? 0.55 : 1};filter:{$bypassed[mod.id] ? 'saturate(0.15) brightness(0.6)' : 'none'};position:relative;overflow:hidden"
  ondragenter={(e) => {
    e.preventDefault();
    if (e.dataTransfer?.types.includes('Files')) {
      dragDepth++;
      dragOver = true;
    }
  }}
  ondragover={(e) => e.preventDefault()}
  ondragleave={(e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dragOver = false;
  }}
  ondrop={(e) => {
    e.preventDefault();
    dragDepth = 0;
    dragOver = false;
    applyVideoFiles([...(e.dataTransfer?.files ?? [])]);
  }}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    data-drag-handle
    onpointerdown={onHeaderPointerDown}
    title="Drag to reorder"
    style="display:flex;align-items:center;padding:0 5px;height:20px;background:linear-gradient(180deg,#1e2124,#181a1c 55%,#141618 100%);border-bottom:1px solid #0d0e0f;border-top:1px solid #252729;gap:3px;flex-shrink:0;cursor:grab"
  >
    <span
      style="font-family:var(--font-ui);font-size:9px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#7a8090;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
    >
      {mod.name}
    </span>
    {#if isOnAir}
      <span
        style="font-family:var(--font-ui);font-size:6.5px;font-weight:700;letter-spacing:0.1em;color:#ef4444;background:#ef444418;border:1px solid #ef444455;border-radius:2px;padding:0 3px;box-shadow:0 0 6px #ef444433;flex-shrink:0"
      >
        ON AIR
      </span>
    {/if}
    <div style="flex:1"></div>
    <input
      bind:this={fileInput}
      type="file"
      accept="video/*"
      multiple
      class="hidden"
      onchange={(e) => {
        applyVideoFiles([...((e.target as HTMLInputElement).files ?? [])]);
        (e.target as HTMLInputElement).value = '';
      }}
    />
    <button
      type="button"
      onclick={() => fileInput?.click()}
      title={videoLayer ? videoLayer.name : 'Load clip — select multiple to fill empty slots'}
      style="height:14px;padding-inline:4px;background:linear-gradient(180deg,#191d22,#121519);border:1px solid {videoLayer ? mod.accentColor + '44' : '#1a1d22'};border-radius:2px;cursor:pointer;color:{videoLayer ? mod.accentColor : '#445060'};display:flex;align-items:center;gap:2px;font-family:var(--font-ui);font-size:6.5px;font-weight:700;letter-spacing:0.08em"
    >
      <Film size={7} /> CLIP
    </button>
    {#if videoLayer}
      <button
        type="button"
        onclick={() => onClearVideo?.()}
        style="width:14px;height:14px;background:linear-gradient(180deg,#241919,#1b1212);border:1px solid #342020;border-radius:2px;color:#c46b6b;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0"
      >
        <X size={7} />
      </button>
    {/if}
    <button
      type="button"
      onclick={() => toggleModuleCollapsed(mod.id)}
      title={collapsed ? 'Expand controls' : 'Collapse to preview strip'}
      style="width:12px;height:12px;border:1px solid #1e2226;border-radius:2px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:linear-gradient(180deg,#1c1e22,#141618);padding:0;flex-shrink:0"
    >
      <svg width="7" height="4" viewBox="0 0 7 4" style="transform:{collapsed ? 'rotate(180deg)' : 'none'};transition:transform 0.15s">
        <path d="M0 0 L3.5 4 L7 0" fill="none" stroke={collapsed ? mod.accentColor : '#3a4050'} stroke-width="1.2" />
      </svg>
    </button>
    <HeaderBtn label="B" active={$bypassed[mod.id]} activeColor="#ef4444" onclick={() => toggleBypass(mod.id)} />
  </div>

  <div class="module-preview">
    <WebGpuCanvas id={slotCanvasId} moduleId={mod.id} {color} class="absolute inset-0 w-full h-full" />
    <ScreenOverlay />
    <ScreenBadge
      text={isOnAir ? 'FX PREVIEW · 100% WET' : 'FX PREVIEW · 24 FPS'}
      color={mod.accentColor}
    />
  </div>

  {#if !collapsed && spec}
    <div style="flex:1 1 auto;display:flex;flex-direction:column;gap:4px;padding:6px 7px;min-height:0;overflow-y:auto;background:linear-gradient(180deg,#111214,#0f1012);border-top:1px solid #0d0e0f">
      <div style="display:flex;gap:2px;flex-wrap:wrap">
        {#each spec.buttons as btn (btn.label)}
          <RackBtn
            label={btn.label}
            active={Math.abs((params[spec.primary] ?? 50) - btn.set[spec.primary]) <= 9}
            color={mod.accentColor}
            width={36}
            height={16}
            onclick={() => Object.entries(btn.set).forEach(([k, v]) => updateParam(mod.id, k, v))}
          />
        {/each}
        {#if spec.toggle}
          <RackBtn
            label={spec.toggle.label}
            active={(params[spec.toggle.param] ?? 0) > 50}
            color={mod.accentColor}
            width={36}
            height={16}
            onclick={() => {
              const tp = spec.toggle!.param;
              updateParam(mod.id, tp, (params[tp] ?? 0) > 50 ? 0 : 100);
            }}
          />
        {/if}
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        {#each spec.sliders as sl (sl.param)}
          <div style="display:flex;align-items:center;gap:4px">
            <span
              style="width:44px;flex-shrink:0;font-size:7px;font-weight:700;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em"
            >
              {sl.label}
            </span>
            <div style="flex:1">
              <HSlider
                value={params[sl.param] ?? 50}
                onChange={(v) => updateParam(mod.id, sl.param, Math.round(v))}
                color={mod.accentColor}
              />
            </div>
          </div>
        {/each}
      </div>
    </div>
    <MixSection
      {params}
      color={mod.accentColor}
      moduleId={mod.id}
      presets={modulePresets}
      onUpdate={(p, v) => updateParam(mod.id, p, Math.round(v))}
    />
  {:else if !collapsed}
    <div style="flex:1 1 auto;padding:6px 7px;min-height:0;overflow-y:auto;background:linear-gradient(180deg,#111214,#0f1012);border-top:1px solid #0d0e0f">
      <div style="display:flex;flex-direction:column;gap:3px">
        {#each Object.keys(params).filter((k) => k !== 'mix') as key (key)}
          <div style="display:flex;align-items:center;gap:4px">
            <span style="width:36px;flex-shrink:0;font-size:7px;font-weight:700;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em;text-transform:uppercase">{key.slice(0, 5)}</span>
            <div style="flex:1">
              <HSlider value={params[key] ?? 50} onChange={(v) => updateParam(mod.id, key, Math.round(v))} color={mod.accentColor} />
            </div>
          </div>
        {/each}
      </div>
    </div>
    <MixSection
      {params}
      color={mod.accentColor}
      moduleId={mod.id}
      presets={modulePresets}
      onUpdate={(p, v) => updateParam(mod.id, p, Math.round(v))}
    />
  {/if}

  {#if dragOver}
    <div
      style="position:absolute;inset:3px;z-index:20;pointer-events:none;border:2px dashed {mod.accentColor};border-radius:4px;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;gap:4px"
    >
      <Upload size={14} color={mod.accentColor} />
      <span style="font-family:var(--font-ui);font-size:10px;font-weight:700;letter-spacing:0.15em;color:{mod.accentColor}">
        DROP CLIP
      </span>
    </div>
  {/if}
</div>

<style>
  .hidden {
    display: none;
  }
</style>
