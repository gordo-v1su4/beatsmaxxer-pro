<script lang="ts">
  import type { ModuleDefinition } from '$lib/modules/catalog';
  import { selectRackSource } from '$lib/runtime/pgm/selection';
  import {
    pgmSource,
    queuedPgmSource,
    intervalBeats,
    feel,
    autoRandom,
    formatQuantizeLabel,
    PGM_INTERVALS,
    type PgmFeel
  } from '$lib/stores/pgm';
  import { pgmRailOpen, viewMode } from '$lib/stores/rackUi';
  import { currentRackSlotForModule, rackBottom, rackTop, videoLayers, bypassed } from '$lib/stores/rack';
  import { timingStatus, timingSettings, selectedTimingSlot } from '$lib/stores/timing';
  import { timingEffectAccent } from './timing/presentation';
  import RampReadiness from './timing/RampReadiness.svelte';
  import { defaultClipTiming } from '$lib/runtime/timing/envelope';
  import { pgmDigit, pgmSlotNumber } from '$lib/runtime/pgm/keyboard';
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import { ChevronLeft, ChevronRight } from '@lucide/svelte';

  interface Props {
    modules: ModuleDefinition[];
  }

  let { modules }: Props = $props();

  const active = $derived(modules.find((m) => m.id === $pgmSource) ?? modules[0]);
  const queuedModule = $derived(modules.find((m) => m.id === $queuedPgmSource));
  const quantizeLabel = $derived(formatQuantizeLabel($intervalBeats, $feel));
  function moduleColor(mod: ModuleDefinition | undefined) {
    if (!mod) return '#556070';
    const slot = currentRackSlotForModule(mod.id, $rackTop, $rackBottom);
    return $viewMode === 'timing' && slot ? timingEffectAccent(($timingSettings.clips[slot] ?? defaultClipTiming(slot)).effect) : mod.accentColor;
  }
  const activeColor = $derived(moduleColor(active));
  const queuedColor = $derived(moduleColor(queuedModule));
  function sourceLabel(mod: ModuleDefinition | undefined) {
    if (!mod) return '—';
    const slot = currentRackSlotForModule(mod.id, $rackTop, $rackBottom);
    return $viewMode === 'timing' && slot ? `S${pgmSlotNumber(slot)}` : mod.shortName;
  }

  const handleSelect = selectRackSource;
  function available(id:string) {
    const slot=currentRackSlotForModule(id,$rackTop,$rackBottom);
    return !!slot && !!$videoLayers[slot] && ($viewMode==='timing' ? $timingStatus[slot]?.state==='ready' : !$bypassed[id]);
  }
  function keySelect(e:KeyboardEvent) {
    if ($viewMode==='arrange') return;
    const editable=e.composedPath().some(n=>n instanceof HTMLElement && (n.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(n.tagName) || n.getAttribute('role')==='textbox'));
    const digit=pgmDigit(e,editable);if(digit===null)return;
    const id=digit<5?$rackTop[digit]:$rackBottom[digit-5];
    if(!id||!available(id))return;e.preventDefault();handleSelect(id);
  }
</script>

<svelte:window onkeydown={keySelect}/>

<style>
  .pgm-slot{display:flex;align-items:center;gap:6px;width:100%;height:34px;padding-inline:7px;background:linear-gradient(180deg,#1e2124,#181a1c 55%,#141618);border:1px solid #1e2226;border-radius:2px;cursor:pointer;box-shadow:none;flex-shrink:0;transition:background var(--dur-control) var(--ease-out)}
  .pgm-slot.is-active{background:linear-gradient(180deg,color-mix(in srgb,var(--slot-accent) 16%,#1e2124),color-mix(in srgb,var(--slot-accent) 8%,#141618))}
  .pgm-collapsed{flex-direction:column;gap:10px!important;padding-bottom:12px!important}
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
  class="pgm-rail"
  data-bmx-pgm-rail
  style="flex-shrink:0;display:flex;flex-direction:column;background:linear-gradient(180deg,#111214,#0d0e10);border-right:1px solid #0d0e0f;overflow:hidden;transition:width 0.2s ease;width:{$pgmRailOpen
    ? 'var(--pgm-rail-width)'
    : 'var(--pgm-rail-collapsed)'}"
>
  <button
    type="button"
    onclick={() => pgmRailOpen.update((v) => !v)}
    aria-label={$pgmRailOpen?'PGM SOURCE':'Open PGM rail'}
    class:pgm-collapsed={!$pgmRailOpen}
    title="PGM source — arm channels for beat-quantized cuts"
    style="display:flex;align-items:center;justify-content:{$pgmRailOpen ? 'space-between' : 'center'};gap:4px;border:none;border-bottom:1px solid #0d0e0f;background:linear-gradient(180deg,#141618,#0f1012);padding:{$pgmRailOpen
      ? '6px 8px'
      : '8px 2px'};cursor:pointer;color:#4a5260;font-family:var(--font-ui);font-size:8px;font-weight:500;letter-spacing:0.14em"
  >
    {#if $pgmRailOpen}
      <span style="color:#556070">PGM SOURCE</span>
      <ChevronLeft size={12} />
    {:else}
      <ChevronRight size={12} />
      <span style="writing-mode:vertical-rl;font-size:8px;font-weight:500;letter-spacing:.2em">PGM</span>
    {/if}
  </button>

  {#if $pgmRailOpen}
    <div style="flex:1;display:flex;flex-direction:column;gap:4px;padding:8px;overflow:hidden;min-height:0">
      <div class="flex items-center justify-end">
        <button
          type="button"
          class="rounded border px-1.5 py-0.5 text-[8px] font-medium tracking-wider transition-colors
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
              class="min-w-[26px] rounded border px-1 py-0.5 text-[7.5px] font-medium tracking-wide transition-colors
                {$intervalBeats === option.beats
                ? 'border-current/30 text-current'
                : 'border-[#1e2226] bg-gradient-to-b from-[#17191c] to-[#121416] text-[#556070]'}"
              style={$intervalBeats === option.beats
                ? `color:${activeColor}; border-color:${activeColor}55; background:linear-gradient(180deg,${activeColor}22,${activeColor}12)`
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
              class="flex-1 rounded border py-0.5 text-[7.5px] font-medium tracking-wide transition-colors
                {$feel === opt.value
                ? 'border-current/30 text-current'
                : 'border-[#1e2226] bg-gradient-to-b from-[#17191c] to-[#121416] text-[#556070]'}"
              style={$feel === opt.value
                ? `color:${activeColor}; border-color:${activeColor}55; background:linear-gradient(180deg,${activeColor}22,${activeColor}12)`
                : undefined}
              onclick={() => feel.set(opt.value)}
            >
              {opt.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="mt-0.5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {#each modules as mod, i (mod.id)}
          {@const slot = currentRackSlotForModule(mod.id,$rackTop,$rackBottom) ?? 'top-0'}
          {@const isActive = $viewMode === 'timing' ? $selectedTimingSlot === slot : $pgmSource === mod.id}
          {@const isQueued = $queuedPgmSource === mod.id}
          <button
            type="button"
            aria-label="PGM source {pgmSlotNumber(slot)}: {$viewMode==='timing' ? `S${pgmSlotNumber(slot)}` : mod.name}"
            title={$viewMode==='timing' ? `S${pgmSlotNumber(slot)} · ${$videoLayers[slot]?.name ?? 'Empty clip'} · Key ${pgmSlotNumber(slot)}` : mod.name}
            disabled={!available(mod.id)}
            class="pgm-slot"
            class:is-active={isActive}
            class:queue-blink={isQueued}
            style:--slot-accent={moduleColor(mod)}
            onclick={() => handleSelect(mod.id)}
          >
            <span
              class="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm font-mono text-[9px] font-medium"
              style="background:{isActive ? moduleColor(mod) : isQueued ? moduleColor(mod) + '55' : '#1e2226'};
                color:{isActive || isQueued ? '#0a0b0c' : '#4a5260'}"
            >
              {pgmSlotNumber(slot)}
            </span>
            <span
              class="truncate text-[10px] font-medium uppercase tracking-wider"
              style="color:{isActive || isQueued ? moduleColor(mod) : '#4a5260'}"
            >
              {$viewMode==='timing' ? `S${pgmSlotNumber(slot)}` : mod.name}
            </span>
            {#if $viewMode==='timing'}<RampReadiness status={$timingStatus[slot]}/>{/if}
          </button>
        {/each}
      </div>

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
              ? activeColor
              : '#1e2226'};
              box-shadow:{$transportDisplay.playing && $transportDisplay.beatPhase < 0.15
              ? `0 0 6px ${activeColor}`
              : undefined}"
          ></span>
        </div>
        <span
          class="font-mono text-[8px]"
          style="color:{queuedModule ? queuedColor : '#4a5260'}"
        >
          {#if queuedModule}
            NEXT {quantizeLabel} → {sourceLabel(queuedModule)}
          {:else}
            BAR {Math.max(1, Math.floor($transportDisplay.beat / 4) + 1)} · PGM {sourceLabel(active)}
          {/if}
        </span>
        <div class="flex h-[18px] items-end gap-0.5 opacity-60">
          {#each $transportDisplay.fftBands as band, i (i)}
            <div
              class="min-h-[2px] flex-1 rounded-t-sm"
              style="height:{Math.max(8, band * 100)}%; background:linear-gradient(180deg, {activeColor}, {activeColor}44)"
            ></div>
          {/each}
          <span class="ml-0.5 font-mono text-[6.5px] text-[#3a4050]">FFT</span>
        </div>
      </div>
    </div>
  {/if}
</aside>
