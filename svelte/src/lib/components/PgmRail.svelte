<script lang="ts">
  import type { ModuleDefinition } from '$lib/modules/catalog';
  import { webGpuEngine } from '$lib/rendering/webgpu/WebGpuEngine';
  import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
  import {
    pgmSource,
    queuedPgmSource,
    intervalBeats,
    feel,
    autoRandom,
    selectPgmSource,
    clearPgmQueue,
    cutImmediate,
    formatQuantizeLabel,
    PGM_INTERVALS,
    type PgmFeel
  } from '$lib/stores/pgm';
  import { transportDisplay } from '$lib/stores/transportDisplay';

  interface Props {
    modules: ModuleDefinition[];
  }

  let { modules }: Props = $props();

  const active = $derived(modules.find((m) => m.id === $pgmSource) ?? modules[0]);
  const queuedModule = $derived(modules.find((m) => m.id === $queuedPgmSource));
  const quantizeLabel = $derived(formatQuantizeLabel($intervalBeats, $feel));

  function handleSelect(id: string) {
    if (id === $pgmSource) {
      clearPgmQueue();
      return;
    }
    if (!$transportDisplay.playing) {
      clearPgmQueue();
      cutImmediate(id);
      webGpuEngine.setPgmLiveModule(id);
      return;
    }
    if ($queuedPgmSource === id) {
      clearPgmQueue();
    } else {
      selectPgmSource(id);
      mediaRuntime.clipRegistry.get(id);
    }
  }
</script>

<style>
  @keyframes pgmQueueBlink {
    0%,
    100% {
      filter: brightness(1);
    }
    50% {
      filter: brightness(1.9);
    }
  }
  .queue-blink {
    animation: pgmQueueBlink 0.55s ease-in-out infinite;
  }
  .rand-blink {
    animation: pgmQueueBlink 1.1s ease-in-out infinite;
  }
</style>

<aside
  style="width:190px;flex-shrink:0;background:linear-gradient(180deg,#111214,#0d0e10);border-right:1px solid #0d0e0f;display:flex;flex-direction:column;gap:4px;padding:8px;overflow:hidden"
>
  <div class="flex items-center justify-between">
    <span class="text-[9px] font-bold tracking-[0.18em] text-[#3a4050]">PGM SOURCE</span>
    <button
      type="button"
      class="rounded border px-1.5 py-0.5 text-[8px] font-bold tracking-wider transition-colors
        {$autoRandom
        ? 'rand-blink border-red-500/50 bg-red-500/20 text-red-400 shadow-[0_0_8px_#ef444433]'
        : 'border-[#1e2226] bg-gradient-to-b from-[#1a1c1f] to-[#131517] text-[#4a5260]'}"
      title="Auto-switch to a random channel on the next {quantizeLabel} boundary"
      onclick={() => autoRandom.update((v) => !v)}
    >
      RAND
    </button>
  </div>

  <span class="font-mono text-[7px] tracking-wide text-[#33383f]">
    CUTS ON NEXT {quantizeLabel}
  </span>

  <div class="mt-0.5 flex flex-col gap-1">
    <div class="flex flex-wrap gap-0.5">
      {#each PGM_INTERVALS as option (option.label)}
        <button
          type="button"
          class="min-w-[26px] rounded border px-1 py-0.5 text-[7.5px] font-bold tracking-wide transition-colors
            {$intervalBeats === option.beats
            ? 'border-current/30 text-current'
            : 'border-[#1e2226] bg-gradient-to-b from-[#17191c] to-[#121416] text-[#556070]'}"
          style={$intervalBeats === option.beats
            ? `color:${active?.accentColor}; border-color:${active?.accentColor}55; background:linear-gradient(180deg,${active?.accentColor}22,${active?.accentColor}12)`
            : undefined}
          onclick={() => intervalBeats.set(option.beats)}
        >
          {option.label}
        </button>
      {/each}
    </div>
    <div class="flex gap-0.5">
      {#each [{ label: 'STR8', value: 0 as PgmFeel }, { label: 'SWNG', value: 1 as PgmFeel }, { label: 'DOT', value: 2 as PgmFeel }] as opt (opt.label)}
        <button
          type="button"
          class="flex-1 rounded border py-0.5 text-[7.5px] font-bold tracking-wide transition-colors
            {$feel === opt.value
            ? 'border-current/30 text-current'
            : 'border-[#1e2226] bg-gradient-to-b from-[#17191c] to-[#121416] text-[#556070]'}"
          style={$feel === opt.value
            ? `color:${active?.accentColor}; border-color:${active?.accentColor}55; background:linear-gradient(180deg,${active?.accentColor}22,${active?.accentColor}12)`
            : undefined}
          onclick={() => feel.set(opt.value)}
        >
          {opt.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="mt-0.5 flex flex-col gap-1">
    {#each modules as mod, i (mod.id)}
      {@const isActive = $pgmSource === mod.id}
      {@const isQueued = $queuedPgmSource === mod.id}
      <button
        type="button"
        class="{isQueued ? 'queue-blink' : ''}"
        style="display:flex;align-items:center;gap:6px;width:100%;height:34px;padding-inline:7px;background:{isActive
          ? `linear-gradient(180deg,${mod.accentColor}2e,${mod.accentColor}14)`
          : 'linear-gradient(180deg,#1a1c1f,#131517)'};border:1px solid {isActive
          ? mod.accentColor + '77'
          : isQueued
            ? mod.accentColor + '99'
            : '#1e2226'};border-radius:2px;cursor:pointer;box-shadow:{isActive
          ? `inset 0 2px 5px rgba(0,0,0,0.5), 0 0 10px ${mod.accentColor}33`
          : 'inset 0 1px 2px rgba(0,0,0,0.4)'};transition:all 0.08s;flex-shrink:0"
        onclick={() => handleSelect(mod.id)}
      >
        <span
          class="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm font-mono text-[9px] font-bold"
          style="background:{isActive ? mod.accentColor : isQueued ? mod.accentColor + '55' : '#1e2226'};
            color:{isActive || isQueued ? '#0a0b0c' : '#4a5260'};
            box-shadow:{isActive ? `0 0 8px ${mod.accentColor}66` : undefined}"
        >
          {i + 1}
        </span>
        <span
          class="truncate text-[10px] font-bold uppercase tracking-wider"
          style="color:{isActive || isQueued ? mod.accentColor : '#4a5260'}"
        >
          {mod.name}
        </span>
        {#if isActive}
          <span
            class="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444aa]"
          ></span>
        {/if}
      </button>
    {/each}
  </div>

  <div class="flex-1"></div>

  <div
    class="flex flex-col gap-1 rounded border border-[#171a1d] bg-[#0a0b0c] p-1.5 shadow-[inset_0_2px_5px_rgba(0,0,0,0.7)]"
  >
    <div class="flex items-center justify-between">
      <span class="font-mono text-[8px] text-[#6a7a8a]">
        {Math.round($transportDisplay.bpm)} BPM{$transportDisplay.bpmLocked ? '·M' : ''}
      </span>
      <span
        class="h-[7px] w-[7px] rounded-full transition-colors duration-75"
        style="background:{$transportDisplay.playing && $transportDisplay.beatPhase < 0.15
          ? active?.accentColor
          : '#1e2226'};
          box-shadow:{$transportDisplay.playing && $transportDisplay.beatPhase < 0.15
          ? `0 0 6px ${active?.accentColor}`
          : undefined}"
      ></span>
    </div>
    <span
      class="font-mono text-[8px]"
      style="color:{queuedModule ? queuedModule.accentColor : '#4a5260'}"
    >
      {#if queuedModule}
        NEXT {quantizeLabel} → {queuedModule.shortName}
      {:else}
        BAR {Math.max(1, Math.floor($transportDisplay.beat / 4) + 1)} · PGM {active?.shortName}
      {/if}
    </span>
    <div class="flex h-[18px] items-end gap-0.5 opacity-60">
      {#each $transportDisplay.fftBands as band, i (i)}
        <div
          class="min-h-[2px] flex-1 rounded-t-sm"
          style="height:{Math.max(8, band * 100)}%; background:linear-gradient(180deg, {active?.accentColor}, {active?.accentColor}44)"
        ></div>
      {/each}
      <span class="ml-0.5 font-mono text-[6.5px] text-[#3a4050]">FFT</span>
    </div>
  </div>
</aside>
