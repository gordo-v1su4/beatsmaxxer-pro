<script lang="ts">
  import { Upload } from '@lucide/svelte';
  import type { ModuleDefinition } from '$lib/modules/catalog';
  import type { VideoLayer } from '$lib/engine/contracts';
  import type { MidiLayer } from '$lib/stores/rack';
  import { parseAccentColor } from '$lib/modules/registry';
  import { presetsForModule } from '$lib/modules/presets';
  import WebGpuCanvas from '$lib/components/WebGpuCanvas.svelte';
  import ModuleControls from '$lib/components/ModuleControls.svelte';
  import Screw from '$lib/components/rack/Screw.svelte';
  import HeaderBtn from '$lib/components/rack/HeaderBtn.svelte';
  import MediaPatchBay from '$lib/components/rack/MediaPatchBay.svelte';
  import ScreenOverlay from '$lib/components/rack/ScreenOverlay.svelte';
  import ScreenBadge from '$lib/components/rack/ScreenBadge.svelte';
  import MixSection from '$lib/components/rack/MixSection.svelte';
  import MidiTimeline from '$lib/components/MidiTimeline.svelte';
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import {
    bypassed,
    muted,
    updateParam,
    toggleBypass,
    toggleMute
  } from '$lib/stores/rack';
  import { moduleCollapsed, toggleModuleCollapsed } from '$lib/stores/rackUi';
  import { clipStatus as clipStatusStore } from '$lib/stores/clipStatus';
  import { isVideoFile } from '$lib/media/videoFile';

  interface Props {
    mod: ModuleDefinition;
    params: Record<string, number>;
    canvasId?: string;
    videoLayer?: VideoLayer | null;
    midiLayer?: MidiLayer | null;
    isOnAir?: boolean;
    onVideoUpload?: (file: File) => void;
    onVideosUpload?: (files: File[]) => void;
    onMidiUpload?: (file: File) => void;
    onClearVideo?: () => void;
    onClearMidi?: () => void;
    onHeaderPointerDown?: (e: PointerEvent) => void;
  }

  let {
    mod,
    params,
    canvasId,
    videoLayer = null,
    midiLayer = null,
    isOnAir = false,
    onVideoUpload,
    onVideosUpload,
    onMidiUpload,
    onClearVideo,
    onClearMidi,
    onHeaderPointerDown
  }: Props = $props();

  let dragOver = $state(false);
  let dragDepth = $state(0);

  const color = $derived(parseAccentColor(mod.accentColor));
  const slotCanvasId = $derived(canvasId ?? mod.id);
  const modulePresets = $derived(presetsForModule(mod.id));
  const td = $derived($transportDisplay);
  const collapsed = $derived($moduleCollapsed[mod.id] === true);
  const clipEntry = $derived($clipStatusStore[mod.id]);

  function applyVideoFiles(files: File[]) {
    const clips = files.filter(isVideoFile);
    if (clips.length === 0) return;
    if (clips.length > 1 && onVideosUpload) onVideosUpload(clips);
    else if (clips[0] && onVideoUpload) onVideoUpload(clips[0]);
    const midi = files.find((f) => /\.midi?$/i.test(f.name));
    if (midi && onMidiUpload) onMidiUpload(midi);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="rack-module"
  class:is-collapsed={collapsed}
  style="background:#131416;border-right:1px solid #0d0e0f;opacity:{$muted[mod.id] ? 0.35 : $bypassed[mod.id] ? 0.55 : 1};filter:{$bypassed[mod.id] ? 'saturate(0.15) brightness(0.6)' : 'none'};position:relative;overflow:hidden"
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
    style="display:flex;align-items:center;padding:0 5px;height:26px;background:linear-gradient(180deg,#1e2124,#181a1c 55%,#141618 100%);border-bottom:1px solid #0d0e0f;border-top:1px solid #252729;gap:3px;flex-shrink:0;cursor:grab"
  >
    <Screw />
    <div style="display:flex;flex-direction:column;gap:1.5px;margin-left:1px">
      {#each [0, 1, 2] as i (i)}
        <div style="display:flex;gap:1.5px">
          <div style="width:2px;height:2px;background:#2a2e34;border-radius:50%"></div>
          <div style="width:2px;height:2px;background:#2a2e34;border-radius:50%"></div>
        </div>
      {/each}
    </div>
    <span
      style="font-family:var(--font-ui);font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#7a8090;flex:1;margin-left:3px"
    >
      {mod.name}
    </span>
    {#if isOnAir}
      <span
        style="font-family:var(--font-ui);font-size:7px;font-weight:700;letter-spacing:0.1em;color:#ef4444;background:#ef444418;border:1px solid #ef444455;border-radius:2px;padding:0 3px;box-shadow:0 0 6px #ef444433;flex-shrink:0"
      >
        ON AIR
      </span>
    {/if}
    <button
      type="button"
      onclick={() => toggleModuleCollapsed(mod.id)}
      title={collapsed ? 'Expand controls' : 'Collapse to preview strip'}
      style="width:12px;height:12px;border:1px solid #1e2226;border-radius:2px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:linear-gradient(180deg,#1c1e22,#141618);padding:0"
    >
      <svg width="7" height="4" viewBox="0 0 7 4" style="transform:{collapsed ? 'rotate(180deg)' : 'none'};transition:transform 0.15s">
        <path d="M0 0 L3.5 4 L7 0" fill="none" stroke={collapsed ? mod.accentColor : '#3a4050'} stroke-width="1.2" />
      </svg>
    </button>
    <HeaderBtn label="B" active={$bypassed[mod.id]} activeColor="#ef4444" onclick={() => toggleBypass(mod.id)} />
    <HeaderBtn label="M" active={$muted[mod.id]} activeColor="#eab308" onclick={() => toggleMute(mod.id)} />
    <Screw />
  </div>

  <div
    style="position:relative;display:flex;flex-direction:column;flex-shrink:0;background:#000;border-bottom:{collapsed ? 'none' : '2px solid #0d0e0f'}"
  >
    {#if !collapsed}
      <MediaPatchBay
        color={mod.accentColor}
        moduleId={mod.id}
        {videoLayer}
        clipStatus={clipEntry?.status ?? 'idle'}
        clipError={clipEntry?.error}
        onSetVideo={(file) => {
          if (file && onVideoUpload) onVideoUpload(file);
          else onClearVideo?.();
        }}
        onSetVideos={onVideosUpload}
        {midiLayer}
        onSetMidi={(file) => (file ? onMidiUpload?.(file) : onClearMidi?.())}
      />
      {#if midiLayer}
        <MidiTimeline color={mod.accentColor} {midiLayer} />
      {/if}
    {/if}
    <div class="module-preview">
      <WebGpuCanvas id={slotCanvasId} moduleId={mod.id} {color} class="absolute inset-0 w-full h-full" />
      <ScreenOverlay />
      <ScreenBadge
        text={isOnAir ? 'FX PREVIEW · 100% WET' : 'FX PREVIEW · 24 FPS'}
        color={mod.accentColor}
      />
      {#if isOnAir && td.beatPhase < 0.08 && td.playing}
        <div
          style="position:absolute;inset:0;z-index:4;pointer-events:none;border:1px solid {mod.accentColor}44;box-shadow:inset 0 0 12px {mod.accentColor}22"
        ></div>
      {/if}
    </div>
  </div>

  {#if !collapsed}
    <div style="flex:1 1 auto;display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;min-height:0">
      <ModuleControls
        moduleId={mod.id}
        {params}
        color={mod.accentColor}
        onUpdate={(p, v) => updateParam(mod.id, p, Math.round(v))}
      />
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
      style="position:absolute;inset:3px;z-index:20;pointer-events:none;border:2px dashed {mod.accentColor};border-radius:4px;background:rgba(0,0,0,0.55);backdrop-filter:blur(1px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px"
    >
      <Upload size={18} color={mod.accentColor} />
      <span style="font-family:var(--font-ui);font-size:11px;font-weight:700;letter-spacing:0.15em;color:{mod.accentColor}">
        DROP CLIP / MIDI
      </span>
    </div>
  {/if}
</div>
