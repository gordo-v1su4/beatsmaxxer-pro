<script lang="ts">
  import { Upload, X } from '@lucide/svelte';
  import type { ModuleDefinition } from '$lib/modules/catalog';
  import type { VideoLayer } from '$lib/engine/contracts';
  import type { MidiLayer } from '$lib/stores/rack';
  import { parseAccentColor } from '$lib/modules/registry';
  import { presetsForModule } from '$lib/modules/presets';
  import WebGpuCanvas from '$lib/components/WebGpuCanvas.svelte';
  import Screw from '$lib/components/rack/Screw.svelte';
  import ModuleGrip from '$lib/components/rack/ModuleGrip.svelte';
  import HeaderBtn from '$lib/components/rack/HeaderBtn.svelte';
  import MediaPatchBay from '$lib/components/rack/MediaPatchBay.svelte';
  import RackBtn from '$lib/components/rack/RackBtn.svelte';
  import HSlider from '$lib/components/rack/HSlider.svelte';
  import MixSection from '$lib/components/rack/MixSection.svelte';
  import FoldGlyph from '$lib/components/rack/FoldGlyph.svelte';
  import ScreenOverlay from '$lib/components/rack/ScreenOverlay.svelte';
  import { screenFxModules } from '$lib/stores/screenFx';
  import ScreenBadge from '$lib/components/rack/ScreenBadge.svelte';
  import { bypassed, updateParam, updateParams, toggleBypass } from '$lib/stores/rack';
  import { moduleCollapsed, midiUiOpen, toggleModuleCollapsed } from '$lib/stores/rackUi';
  import { isVideoFile } from '$lib/media/videoFile';
  import { previewTargetFps } from '$lib/platform/desktopPerformance';
  // The condensed button/slider table used to be declared here, where only the
  // rack could see it. The phone renders the same parameters at four times the
  // size, so it moved somewhere both surfaces import from — the values are
  // unchanged, and a new variant now lands on both at once.
  import { COMPACT_CONTROLS, primaryTolerance } from '$lib/mobile/moduleControlSpecs';
  import MidiTimeline from '$lib/components/MidiTimeline.svelte';
  import { moduleTriggerSource, setModuleTriggerSource } from '$lib/stores/midiTrigger';
  import { moduleMidiContract } from '$lib/modules/midiContracts';
  import { clipStatus as clipStatusStore } from '$lib/stores/clipStatus';

  interface Props {
    mod: ModuleDefinition;
    params: Record<string, number>;
    canvasId?: string;
    videoLayer?: VideoLayer | null;
    midiLayer?: MidiLayer | null;
    isOnAir?: boolean;
    onVideoUpload?: (file: File) => void;
    onVideosUpload?: (files: File[]) => void;
    onClearVideo?: () => void;
    onMidiUpload?: (file: File) => void;
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
    onClearVideo,
    onMidiUpload,
    onClearMidi,
    onHeaderPointerDown
  }: Props = $props();

  let dragOver = $state(false);
  let dragDepth = $state(0);

  const color = $derived(parseAccentColor(mod.accentColor));
  const slotCanvasId = $derived(canvasId ?? mod.id);
  const clipEntry = $derived($clipStatusStore[slotCanvasId]);
  const modulePresets = $derived(presetsForModule(mod.id));
  const collapsed = $derived($moduleCollapsed[mod.id] === true);

  const spec = $derived(COMPACT_CONTROLS[mod.id]);
  const midiContract = $derived(moduleMidiContract(mod.id));
  const midiBehavior = $derived(
    midiContract.timingClass === 'none' ? undefined : midiContract.timingClass
  );

  /** Half the closest gap between this module's own preset values. A fixed
   * tolerance lit up neighbouring buttons once a module had enough presets to
   * space them under 18 apart — INCEPTION's twelve folds sit 9.09 apart. */
  const activeTolerance = $derived(primaryTolerance(spec?.buttons ?? [], spec?.primary ?? ''));

  function applyVideoFiles(files: File[]) {
    const midi = files.find((file) => /\.midi?$/i.test(file.name));
    if (midi && midiBehavior && $midiUiOpen) onMidiUpload?.(midi);
    const clips = files.filter(isVideoFile);
    if (clips.length === 0) return;
    if (clips.length > 1 && onVideosUpload) onVideosUpload(clips);
    else if (clips[0] && onVideoUpload) onVideoUpload(clips[0]);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="rack-module"
  data-bmx-module-id={mod.id}
  class:is-collapsed={collapsed}
  style="background:#131416;border-right:1px solid #0d0e0f;opacity:{$bypassed[mod.id] ? 0.55 : 1};filter:{$bypassed[mod.id] ? 'saturate(0.15) brightness(0.6)' : 'none'};position:relative;overflow:hidden;box-shadow:{isOnAir ? `inset 0 0 0 1px ${mod.accentColor}66, inset 0 0 18px ${mod.accentColor}14` : 'none'}"
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
  <!-- Header matches EffectModule exactly. "Compact" is about how much control
       surface the row carries; the title bar is the same object in both. -->
  <div
    style="display:flex;align-items:center;padding:0 5px;height:26px;background:linear-gradient(180deg,#1e2124,#181a1c 55%,#141618 100%);border-bottom:1px solid #0d0e0f;border-top:1px solid #252729;gap:3px;flex-shrink:0"
  >
    <ModuleGrip {onHeaderPointerDown} />
    <span
      style="font-family:var(--font-ui);font-size:10px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:{mod.accentColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
    >
      {mod.name}
    </span>
    {#if isOnAir}
      <span
        style="font-family:var(--font-ui);font-size:6.5px;font-weight:500;letter-spacing:0.1em;color:#ef4444;background:#ef444418;border:1px solid #ef444455;border-radius:2px;padding:0 3px;box-shadow:0 0 6px #ef444433;flex-shrink:0"
      >
        ON AIR
      </span>
    {/if}
    <div style="flex:1"></div>
    <button
      type="button"
      onclick={() => toggleModuleCollapsed(mod.id)}
      title={collapsed ? 'Expand controls' : 'Collapse to preview strip'}
      aria-label={collapsed ? `Expand ${mod.name} controls` : `Collapse ${mod.name} controls`}
      style="width:14px;height:14px;border:1px solid #1e2226;border-radius:2px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:linear-gradient(180deg,#1c1e22,#141618);padding:0;flex-shrink:0"
    >
      <svg width="7" height="4" viewBox="0 0 7 4" style="transform:{collapsed ? 'rotate(180deg)' : 'none'};transition:transform 0.15s">
        <path d="M0 0 L3.5 4 L7 0" fill="none" stroke={collapsed ? mod.accentColor : '#3a4050'} stroke-width="1.2" />
      </svg>
    </button>
    <HeaderBtn label="B" active={$bypassed[mod.id]} activeColor="#ef4444" onclick={() => toggleBypass(mod.id)} />
    <Screw />
  </div>

  <div class="module-media-stack" class:midi-ui-open={$midiUiOpen && !collapsed}>
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
        midiSupported={midiBehavior !== undefined}
        midiReason={midiContract?.consumer ?? 'No timing contract'}
        onSetMidi={midiBehavior
          ? (file) => (file ? onMidiUpload?.(file) : onClearMidi?.())
          : undefined}
        triggerSource={$moduleTriggerSource[mod.id] ?? 'audio'}
        onTriggerSourceChange={(source) => setModuleTriggerSource(mod.id, source)}
        density={params.density ?? 100}
        onDensityChange={(value) => updateParam(mod.id, 'density', Math.round(value))}
      />
      {#if $midiUiOpen}
        {#if midiLayer && midiBehavior}
          <MidiTimeline
            color={mod.accentColor}
            {midiLayer}
            moduleId={mod.id}
            behavior={midiBehavior}
            source={$moduleTriggerSource[mod.id] ?? 'audio'}
            density={params.density ?? 100}
          />
        {:else}
          <div class="module-midi-lane module-midi-lane-empty" aria-hidden="true"></div>
        {/if}
      {/if}
    {/if}
    <div class="module-preview">
    <WebGpuCanvas id={slotCanvasId} moduleId={mod.id} {color} class="absolute inset-0 w-full h-full" />
    {#if $screenFxModules}<ScreenOverlay variant="module" />{/if}
    <ScreenBadge
      text={isOnAir ? 'FX PREVIEW · 100% WET' : `FX PREVIEW · ${previewTargetFps()} FPS`}
      color={mod.accentColor}
    />
    </div>
  </div>

  {#if !collapsed && spec}
    <div style="flex:0 0 auto;display:flex;flex-direction:column;gap:4px;padding:6px 7px;overflow:visible;background:linear-gradient(180deg,#111214,#0f1012);border-top:1px solid #0d0e0f">
      <div
        style={mod.id === 'mirror'
          ? 'display:grid;grid-template-columns:repeat(6,1fr);gap:2px'
          : 'display:flex;gap:2px;flex-wrap:wrap'}
      >
        {#each spec.buttons as btn (btn.label)}
          {@const isActive =
            Math.abs((params[spec.primary] ?? 50) - btn.set[spec.primary]) <= activeTolerance}
          {#if mod.id === 'mirror'}
            <!-- Twelve folds named MIR L / SLB V / COR A read as codes, not as
                 shapes. The glyph carries the geometry; the label stays under it
                 so the name is still learnable. -->
            <button
              type="button"
              class="fold-btn"
              title={btn.label}
              aria-pressed={isActive}
              style="border-color:{isActive ? mod.accentColor + '66' : '#0e1012'};background:{isActive
                ? `linear-gradient(180deg,${mod.accentColor}22,${mod.accentColor}11)`
                : '#191b1d'};color:{isActive ? mod.accentColor : '#3a4050'}"
              onclick={() => updateParams(mod.id, btn.set)}
            >
              <FoldGlyph kind={btn.label} color={mod.accentColor} dim={!isActive} />
              <span class="fold-btn-label">{btn.label}</span>
            </button>
          {:else}
            <RackBtn
              label={btn.label}
              active={isActive}
              color={mod.accentColor}
              width={36}
              onclick={() => updateParams(mod.id, btn.set)}
            />
          {/if}
        {/each}
        {#if spec.toggle}
          <RackBtn
            label={spec.toggle.label}
            active={(params[spec.toggle.param] ?? 0) > 50}
            color={mod.accentColor}
            width={36}
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
              style="width:44px;flex-shrink:0;font-size:7px;font-weight:500;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em;white-space:nowrap"
            >
              {sl.label}
            </span>
            <div style="flex:1">
              <HSlider
                value={params[sl.param] ?? 50}
                onChange={(v) => updateParam(mod.id, sl.param, Math.round(v))}
                color={mod.accentColor}
                ariaLabel={sl.label}
                controlId="{mod.id}-{sl.param}"
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
      onApplyPreset={(values) => updateParams(mod.id, values)}
    />
  {:else if !collapsed}
    <div style="flex:0 0 auto;padding:6px 7px;overflow:visible;background:linear-gradient(180deg,#111214,#0f1012);border-top:1px solid #0d0e0f">
      <div style="display:flex;flex-direction:column;gap:3px">
        <!-- density has its own control on the MIDI lane; it would otherwise
             appear here a second time as a bare slider the moment it is set. -->
        {#each Object.keys(params).filter((k) => k !== 'mix' && k !== 'density') as key (key)}
          <div style="display:flex;align-items:center;gap:4px">
            <span style="width:36px;flex-shrink:0;font-size:7px;font-weight:500;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em;text-transform:uppercase">{key.slice(0, 5)}</span>
            <div style="flex:1">
              <HSlider
                value={params[key] ?? 50}
                onChange={(v) => updateParam(mod.id, key, Math.round(v))}
                color={mod.accentColor}
                ariaLabel={key}
                controlId="{mod.id}-{key}"
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
      onApplyPreset={(values) => updateParams(mod.id, values)}
    />
  {/if}

  {#if dragOver}
    <div
      style="position:absolute;inset:3px;z-index:20;pointer-events:none;border:2px dashed {mod.accentColor};border-radius:4px;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;gap:4px"
    >
      <Upload size={14} color={mod.accentColor} />
      <span style="font-family:var(--font-ui);font-size:10px;font-weight:500;letter-spacing:0.15em;color:{mod.accentColor}">
        DROP CLIP
      </span>
    </div>
  {/if}
</div>

<style>
  /* Taller than the 16px rack control tier because it carries a diagram as well
     as a label — the one place the extra height buys comprehension. */
  .fold-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    height: 28px;
    padding: 0;
    border-style: solid;
    border-width: 1px;
    border-radius: 2px;
    cursor: pointer;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.4);
    transition: background 0.08s, border-color 0.08s;
  }
  .fold-btn:hover {
    background: #1e2022 !important;
  }
  .fold-btn-label {
    font-family: var(--font-ui);
    font-size: 5.5px;
    font-weight: 500;
    letter-spacing: 0.06em;
    line-height: 1;
  }

  .hidden {
    display: none;
  }
</style>
