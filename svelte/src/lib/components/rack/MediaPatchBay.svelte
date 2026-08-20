<script lang="ts">
  import { Film, Upload, X } from '@lucide/svelte';
  import type { VideoLayer } from '$lib/engine/contracts';
  import type { MidiLayer } from '$lib/stores/rack';
  import type { ClipLoadStatus } from '$lib/stores/clipStatus';
  import { midiUiOpen } from '$lib/stores/rackUi';
  import HSlider from '$lib/components/rack/HSlider.svelte';
  import type { ModuleTriggerSource } from '$lib/stores/midiTrigger';

  interface Props {
    color: string;
    moduleId: string;
    videoLayer: VideoLayer | null;
    clipStatus?: ClipLoadStatus;
    clipError?: string;
    onSetVideo: (file: File | null) => void;
    onSetVideos?: (files: File[]) => void;
    midiLayer?: MidiLayer | null;
    onSetMidi?: (file: File | null) => void;
    midiSupported?: boolean;
    midiReason?: string;
    triggerSource?: ModuleTriggerSource;
    onTriggerSourceChange?: (source: ModuleTriggerSource) => void;
    density?: number;
    onDensityChange?: (value: number) => void;
  }
  let {
    color,
    moduleId,
    videoLayer,
    clipStatus = 'idle',
    clipError,
    onSetVideo,
    onSetVideos,
    midiLayer = null,
    onSetMidi,
    midiSupported = false,
    midiReason = 'This effect has no MIDI event consumer.',
    triggerSource = 'audio',
    onTriggerSourceChange,
    density = 100,
    onDensityChange
  }: Props = $props();

  const statusLabel = $derived.by(() => {
    if (clipStatus === 'loading') return 'LOAD…';
    if (clipStatus === 'ready') return 'RDY';
    if (clipStatus === 'error') return 'ERR';
    return videoLayer ? '…' : '';
  });

  const statusColor = $derived.by(() => {
    if (clipStatus === 'loading') return '#f59e0b';
    if (clipStatus === 'ready') return '#22c55e';
    if (clipStatus === 'error') return '#ef4444';
    return '#4a5260';
  });

  const midiActive = $derived(triggerSource === 'midi');
  /** Second patch row + reserved lane height apply to every slot when MIDI UI is open. */
  const reserveMidiChrome = $derived($midiUiOpen);

  let videoInput: HTMLInputElement;
  let midiInput = $state<HTMLInputElement>();

  function patchBtn(active: boolean) {
    return `height:16px;min-width:26px;padding-inline:5px;background:linear-gradient(180deg,#191d22,#121519);border-style:solid;border-width:1px;border-color:#252a30 ${active ? color + '44' : '#1a1d22'} ${active ? color + '44' : '#1a1d22'} ${active ? color + '44' : '#1a1d22'};border-radius:2px;color:${active ? color : '#445060'};display:flex;align-items:center;justify-content:center;gap:3px;cursor:pointer;font-family:var(--font-ui);font-size:7px;font-weight:500;letter-spacing:0.08em;box-shadow:${active ? `0 0 8px ${color}22` : 'inset 0 1px 2px rgba(0,0,0,0.4)'};flex-shrink:0`;
  }

  function iconBtn() {
    return 'width:16px;height:16px;background:linear-gradient(180deg,#241919,#1b1212);border:1px solid #342020;border-radius:2px;color:#c46b6b;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0';
  }

  function onVideoChange(e: Event) {
    const files = [...((e.target as HTMLInputElement).files ?? [])];
    if (files.length === 0) return;
    if (files.length > 1 && onSetVideos) onSetVideos(files);
    else onSetVideo(files[0] ?? null);
    (e.target as HTMLInputElement).value = '';
  }

  function onMidiChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) onSetMidi?.(file);
    (e.target as HTMLInputElement).value = '';
  }
</script>

<div class="media-patch-bay" class:has-trigger-row={reserveMidiChrome}>
  <div class="media-patch-row">
    <input bind:this={videoInput} type="file" accept="video/*" multiple class="hidden" onchange={onVideoChange} />
    <button type="button" style={patchBtn(!!videoLayer)} onclick={() => videoInput?.click()}>
      <Upload size={8} /> CLIP
    </button>

    <div class="media-patch-readout">
      <Film size={8} color={videoLayer ? color : '#3a4050'} />
      <span
        class="media-patch-name"
        title={clipError ?? videoLayer?.name ?? moduleId}
        style="color:{videoLayer ? '#c0d7ff' : '#4a5260'}"
      >
        {videoLayer?.name ?? 'Test pattern'}
      </span>
      {#if statusLabel}
        <span class="media-patch-status" style="color:{statusColor}" title={clipError ?? statusLabel}>
          {statusLabel}
        </span>
      {/if}
    </div>
    {#if videoLayer}
      <button type="button" style={iconBtn()} onclick={() => onSetVideo(null)} aria-label="Clear clip">
        <X size={8} />
      </button>
    {/if}

    {#if $midiUiOpen}
      <div class="media-patch-divider"></div>
    {/if}

    {#if $midiUiOpen && midiSupported}
      <input bind:this={midiInput} type="file" accept=".mid,.midi" class="hidden" onchange={onMidiChange} />
      <button type="button" style={patchBtn(!!midiLayer)} onclick={() => midiInput?.click()} title={midiReason}>
        MIDI
      </button>
      {#if midiLayer}
        <span class="media-patch-midi-name" style="color:{color}" title={midiLayer.name}>
          {midiLayer.name}
        </span>
        <button type="button" style={iconBtn()} onclick={() => onSetMidi?.(null)} aria-label="Clear MIDI">
          <X size={8} />
        </button>
      {/if}
    {:else if $midiUiOpen}
      <span class="media-patch-muted" title={midiReason}>NO MIDI</span>
    {/if}
  </div>

  {#if reserveMidiChrome}
    {#if midiSupported}
      <div class="media-patch-row media-patch-row-trigger">
        <span class="media-patch-muted">HIT</span>
        <button
          type="button"
          style={patchBtn(!midiActive)}
          onclick={() => onTriggerSourceChange?.('audio')}
          title="Fire from audio onsets / rhythm analysis"
          disabled={!midiLayer}
        >AUD</button>
        <button
          type="button"
          style={patchBtn(midiActive && !!midiLayer)}
          onclick={() => onTriggerSourceChange?.('midi')}
          title="Fire from this MIDI part"
          disabled={!midiLayer}
        >MIDI</button>
        <span class="media-patch-muted" style="opacity:{midiLayer && midiActive ? 1 : 0.35}">DENS</span>
        <div class="media-patch-dens" style="opacity:{midiLayer && midiActive ? 1 : 0.35}">
          <HSlider
            value={density}
            onChange={(v) => onDensityChange?.(v)}
            {color}
            ariaLabel="MIDI note density"
            controlId="{moduleId}-density"
          />
        </div>
        <span class="media-patch-dens-val" style="opacity:{midiLayer && midiActive ? 1 : 0.35}">
          {Math.round(density)}%
        </span>
      </div>
    {:else}
      <div class="media-patch-row media-patch-row-trigger media-patch-row-spacer" aria-hidden="true"></div>
    {/if}
  {/if}
</div>

<style>
  .media-patch-bay {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    background: linear-gradient(180deg, #111315, #0d0f11);
    border-bottom: 1px solid #0d0e0f;
  }

  .media-patch-bay.has-trigger-row {
    height: 44px;
    min-height: 44px;
    max-height: 44px;
  }

  .media-patch-row {
    display: flex;
    align-items: center;
    gap: 3px;
    height: 22px;
    min-height: 22px;
    padding: 0 5px;
    overflow: hidden;
  }

  .media-patch-row-trigger {
    border-top: 1px solid #0d0e0f;
    background: #0b0c0e;
  }

  .media-patch-row-spacer {
    pointer-events: none;
  }

  .media-patch-readout {
    flex: 1;
    min-width: 0;
    height: 16px;
    background: #0a0b0c;
    border: 1px solid #101214 #171a1d #171a1d #171a1d;
    border-radius: 2px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding-inline: 5px;
    box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.75);
  }

  .media-patch-name {
    flex: 1;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: 7px;
    letter-spacing: 0.03em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .media-patch-status {
    font-family: var(--font-ui);
    font-size: 6px;
    font-weight: 500;
    letter-spacing: 0.08em;
    flex-shrink: 0;
  }

  .media-patch-divider {
    width: 1px;
    height: 14px;
    background: #1a1d22;
    flex-shrink: 0;
  }

  .media-patch-muted {
    font: 6px var(--font-ui);
    letter-spacing: 0.08em;
    color: #3f4850;
    flex-shrink: 0;
  }

  .media-patch-midi-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 7px;
    flex-shrink: 1;
  }

  .media-patch-dens {
    flex: 1;
    min-width: 36px;
    height: 16px;
    display: flex;
    align-items: center;
  }

  .media-patch-dens-val {
    font-family: var(--font-mono);
    font-size: 7px;
    color: #6b7280;
    width: 24px;
    text-align: right;
    flex-shrink: 0;
  }

  .hidden {
    display: none;
  }
</style>
