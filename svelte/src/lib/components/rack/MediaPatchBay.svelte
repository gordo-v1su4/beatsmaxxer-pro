<script lang="ts">
  import { Film, Upload, X } from '@lucide/svelte';
  import type { VideoLayer } from '$lib/engine/contracts';
  import type { MidiLayer } from '$lib/stores/rack';

  interface Props {
    color: string;
    videoLayer: VideoLayer | null;
    onSetVideo: (file: File | null) => void;
    onSetVideos?: (files: File[]) => void;
    midiLayer?: MidiLayer | null;
    onSetMidi?: (file: File | null) => void;
  }
  let { color, videoLayer, onSetVideo, onSetVideos, midiLayer = null, onSetMidi }: Props = $props();

  let videoInput: HTMLInputElement;
  let midiInput: HTMLInputElement;

  function uploadStyle(active: boolean) {
    return `height:18px;padding-inline:5px;background:linear-gradient(180deg,#191d22,#121519);border-style:solid;border-width:1px;border-color:#252a30 ${active ? color + '44' : '#1a1d22'} ${active ? color + '44' : '#1a1d22'} ${active ? color + '44' : '#1a1d22'};border-radius:2px;color:${active ? color : '#445060'};display:flex;align-items:center;gap:3px;cursor:pointer;font-family:var(--font-ui);font-size:7px;font-weight:700;letter-spacing:0.08em;box-shadow:${active ? `0 0 8px ${color}22` : 'inset 0 1px 2px rgba(0,0,0,0.4)'}`;
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

<div
  style="display:flex;align-items:center;gap:3px;padding:3px 5px;background:linear-gradient(180deg,#111315,#0d0f11);border-bottom:1px solid #0d0e0f;flex-shrink:0"
>
  <input bind:this={videoInput} type="file" accept="video/*" multiple class="hidden" onchange={onVideoChange} />
  <button type="button" style={uploadStyle(!!videoLayer)} onclick={() => videoInput?.click()}>
    <Upload size={8} /> CLIP
  </button>

  <div
    style="flex:1;min-width:0;height:18px;background:#0a0b0c;border-style:solid;border-width:1px;border-color:#101214 #171a1d #171a1d #171a1d;border-radius:2px;display:flex;align-items:center;gap:4px;padding-inline:5px;box-shadow:inset 0 2px 5px rgba(0,0,0,0.75)"
  >
    <Film size={8} color={videoLayer ? color : '#3a4050'} />
    <span
      style="font-family:var(--font-mono);font-size:7px;letter-spacing:0.03em;color:{videoLayer
        ? '#c0d7ff'
        : '#4a5260'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
    >
      {videoLayer?.name ?? 'Test pattern'}
    </span>
  </div>
  {#if videoLayer}
    <button
      type="button"
      onclick={() => onSetVideo(null)}
      style="width:18px;height:18px;background:linear-gradient(180deg,#241919,#1b1212);border:1px solid #342020;border-radius:2px;color:#c46b6b;cursor:pointer;display:flex;align-items:center;justify-content:center"
    >
      <X size={8} />
    </button>
  {/if}

  <div style="width:1px;height:14px;background:#1a1d22;flex-shrink:0"></div>

  <input bind:this={midiInput} type="file" accept=".mid,.midi" class="hidden" onchange={onMidiChange} />
  <button type="button" style={uploadStyle(!!midiLayer)} onclick={() => midiInput?.click()}>
    MIDI
  </button>
  {#if midiLayer}
    <span
      style="font-family:var(--font-mono);font-size:7px;color:{color};max-width:48px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
      title={midiLayer.name}
    >
      {midiLayer.name}
    </span>
    <button
      type="button"
      onclick={() => onSetMidi?.(null)}
      style="width:18px;height:18px;background:linear-gradient(180deg,#241919,#1b1212);border:1px solid #342020;border-radius:2px;color:#c46b6b;cursor:pointer;display:flex;align-items:center;justify-content:center"
    >
      <X size={8} />
    </button>
  {/if}
</div>

<style>
  .hidden {
    display: none;
  }
</style>
