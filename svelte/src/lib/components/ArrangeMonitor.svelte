<script lang="ts">
  /**
   * ARRANGE's program monitor and cut pads.
   *
   * ARRANGE replaces the rack, so without this there was no picture at all
   * while the arrangement played, and nowhere to cut from while REC ran: you
   * had to perform in another tab and could not watch the take land. Like
   * Ableton's Arrangement Record, you hit REC here, cut on the pads (or the
   * digit keys) and watch each cut paint into its lane as the song plays.
   *
   * The monitor mirrors PGM's finished frame (WebGpuEngine PGM_MONITOR_ID); it
   * does not render the effect a second time.
   */
  import WebGpuCanvas from '$lib/components/WebGpuCanvas.svelte';
  import { PGM_MONITOR_ID } from '$lib/rendering/webgpu/WebGpuEngine';
  import { getModuleDef } from '$lib/modules/catalog';
  import { MAX_RACK_SLOTS_PER_ROW, bypassed, rackBottom, rackTop, videoLayers } from '$lib/stores/rack';
  import { playbackWorkspace } from '$lib/stores/rackUi';
  import { timingSettings, timingStatus } from '$lib/stores/timing';
  import { defaultClipTiming } from '$lib/runtime/timing/envelope';
  import { timingEffectAccent } from '$lib/components/timing/presentation';
  import { pgmSource, queuedPgmSource } from '$lib/stores/pgm';
  import { moduleForSlotIndex } from '$lib/stores/arrangement';
  import { selectRackSource } from '$lib/runtime/pgm/selection';
  import { arrangementMode, arrangementOverridden } from '$lib/arrangement/transportMode';

  const slots = $derived(
    Array.from({ length: $rackTop.length + $rackBottom.length }, (_, index) => {
      const moduleId = moduleForSlotIndex($rackTop, $rackBottom, index);
      const slotId = index < MAX_RACK_SLOTS_PER_ROW ? `top-${index}` : `bottom-${index - MAX_RACK_SLOTS_PER_ROW}`;
      const def = moduleId ? getModuleDef(moduleId) : undefined;
      // From TIMING, a slot is a deck: S0-S9 and its ramp or stutter.
      if ($playbackWorkspace === 'timing') {
        const effect = ($timingSettings.clips[slotId] ?? defaultClipTiming(slotId)).effect;
        return {
          index,
          moduleId,
          name: `S${index} ${effect === 'ramp' ? 'RAMP' : effect === 'stutter' ? 'STUT' : 'OFF'}`,
          accent: timingEffectAccent(effect),
          ready: !!moduleId && $timingStatus[slotId]?.state === 'ready'
        };
      }
      return {
        index,
        moduleId,
        name: def?.shortName ?? '—',
        accent: def?.accentColor ?? '#64748b',
        ready: !!moduleId && !!$videoLayers[slotId] && !$bypassed[moduleId]
      };
    })
  );

  const live = $derived(getModuleDef($pgmSource));
  const liveSlot = $derived(slots.find((slot) => slot.moduleId === $pgmSource));
  const hint = $derived(
    $arrangementMode === 'rec'
      ? 'REC — cut on the pads or keys 0-9; each cut paints into its lane'
      : $arrangementMode === 'play'
        ? $arrangementOverridden
          ? 'You have the program — BACK TO ARRANGEMENT hands it to the timeline'
          : 'PLAY — the timeline cuts PGM; a pad takes over'
        : 'LIVE — cut by hand; nothing is recorded. Hit REC to write a take.'
  );
</script>

<div class="am" data-mode={$arrangementMode}>
  <div class="am-screen">
    <WebGpuCanvas id={PGM_MONITOR_ID} />
    <span class="am-tag" style="--c:{liveSlot?.accent ?? live?.accentColor ?? '#38bdf8'}">PGM · {liveSlot?.name ?? live?.shortName ?? '—'}</span>
    {#if $arrangementMode === 'rec'}<span class="am-rec">● REC</span>{/if}
  </div>
  <div class="am-side">
    <div class="am-pads" role="group" aria-label="Cut PGM to a rack slot">
      {#each slots as slot (slot.index)}
        <button
          type="button"
          class="am-pad"
          style="--c:{slot.accent}"
          data-live={slot.moduleId != null && slot.moduleId === $pgmSource}
          data-queued={slot.moduleId != null && slot.moduleId === $queuedPgmSource}
          disabled={!slot.ready}
          onclick={() => slot.moduleId && selectRackSource(slot.moduleId)}
          title={slot.ready ? `Cut PGM to ${slot.name} (key ${slot.index})` : `${slot.name}: no clip loaded`}
        >
          <span class="am-key">{slot.index}</span>
          <span class="am-name">{slot.name}</span>
        </button>
      {/each}
    </div>
    <p class="am-hint">{hint}</p>
  </div>
</div>

<style>
  .am {
    display: flex;
    gap: 10px;
    padding: 8px 10px;
    border-bottom: 1px solid #1a1d21;
    background: #0b0c0e;
    flex-shrink: 0;
  }
  .am-screen {
    position: relative;
    height: 150px;
    aspect-ratio: 16 / 9;
    flex-shrink: 0;
    border: 1px solid #1f2329;
    border-radius: 3px;
    overflow: hidden;
    background: #050607;
  }
  .am[data-mode='rec'] .am-screen {
    border-color: #ef444488;
    box-shadow: 0 0 0 1px #ef444433;
  }
  .am-tag {
    position: absolute;
    left: 6px;
    top: 5px;
    padding: 1px 5px;
    border-radius: 2px;
    background: #000a;
    color: var(--c);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
  }
  .am-rec {
    position: absolute;
    right: 6px;
    top: 5px;
    padding: 1px 5px;
    border-radius: 2px;
    background: #2a0e0ecc;
    color: #f87171;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
    animation: am-pulse 1.2s ease-in-out infinite;
  }
  @keyframes am-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .am-side {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }
  .am-pads {
    display: grid;
    grid-template-columns: repeat(5, minmax(64px, 110px));
    gap: 5px;
  }
  .am-pad {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 8px;
    border: 1px solid #22262c;
    border-left: 3px solid var(--c);
    border-radius: 3px;
    background: #111316;
    color: #aab3bd;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    cursor: pointer;
  }
  .am-pad:hover:not(:disabled) {
    background: #171a1e;
    color: #e2e8f0;
  }
  .am-pad[data-live='true'] {
    background: color-mix(in srgb, var(--c) 22%, #111316);
    border-color: var(--c);
    color: #fff;
  }
  .am-pad[data-queued='true'] {
    border-color: var(--c);
    animation: am-pulse 0.6s ease-in-out infinite;
  }
  .am-pad:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .am-key {
    display: inline-grid;
    place-items: center;
    width: 15px;
    height: 15px;
    border-radius: 2px;
    background: #1d2126;
    color: #8b95a1;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 9px;
  }
  .am-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .am-hint {
    margin: 0;
    color: #6b7580;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .am[data-mode='rec'] .am-hint {
    color: #f87171;
  }
</style>
