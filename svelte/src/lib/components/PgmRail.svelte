<script lang="ts">
  import { RACK_SLOTS_PER_ROW } from '$lib/modules/rackSlots';
  import type { ModuleDefinition } from '$lib/modules/catalog';
  import { canSelectRackSource, selectRackSource } from '$lib/runtime/pgm/selection';
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
  import { pgmRailOpen, playbackWorkspace, viewMode } from '$lib/stores/rackUi';
  import { currentRackSlotForModule, rackBottom, rackTop, videoLayers, bypassed } from '$lib/stores/rack';
  import { timingStatus, timingSettings, effectiveClipTiming, timingPgmFollowsTriggers } from '$lib/stores/timing';
  import { timingEffectAccent } from './timing/presentation';
  import RampReadiness from './timing/RampReadiness.svelte';
  import { pgmDigit, pgmSlotNumber } from '$lib/runtime/pgm/keyboard';
  import { ChevronLeft, ChevronRight } from '@lucide/svelte';

  interface Props {
    modules: ModuleDefinition[];
  }

  let { modules }: Props = $props();

  const active = $derived(modules.find((m) => m.id === $pgmSource) ?? modules[0]);
  const quantizeLabel = $derived(formatQuantizeLabel($intervalBeats, $feel));
  const playableTimingSlots = $derived(modules.flatMap(module => {
    const slot = currentRackSlotForModule(module.id, $rackTop, $rackBottom);
    return slot && $videoLayers[slot] && $timingStatus[slot]?.state === 'ready' ? [slot] : [];
  }));
  const triggerDriven = $derived($playbackWorkspace==='timing' && timingPgmFollowsTriggers($timingSettings,playableTimingSlots));
  function moduleColor(mod: ModuleDefinition | undefined) {
    if (!mod) return '#556070';
    const slot = currentRackSlotForModule(mod.id, $rackTop, $rackBottom);
    return $viewMode === 'timing' && slot ? timingEffectAccent(effectiveClipTiming($timingSettings,slot).effect) : mod.accentColor;
  }
  const activeColor = $derived(moduleColor(active));

  const handleSelect = selectRackSource;
  function available(id:string) {
    const slot=currentRackSlotForModule(id,$rackTop,$rackBottom);
    return canSelectRackSource({
      slot,
      hasVideo: !!(slot && $videoLayers[slot]),
      timing: $playbackWorkspace === 'timing',
      bypassed: !!$bypassed[id],
    });
  }
  function keySelect(e:KeyboardEvent) {
    // Digits cut PGM in ARRANGE too, so a REC take can be played from the keyboard.
    const editable=e.composedPath().some(n=>n instanceof HTMLElement && (n.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(n.tagName) || n.getAttribute('role')==='textbox'));
    const digit=pgmDigit(e,editable);if(digit===null)return;
    const id=digit<RACK_SLOTS_PER_ROW?$rackTop[digit]:$rackBottom[digit-RACK_SLOTS_PER_ROW];
    if(!id||!available(id))return;e.preventDefault();handleSelect(id);
  }
</script>

<svelte:window onkeydown={keySelect}/>

<style>
  .pgm-slot{display:flex;align-items:center;gap:6px;width:100%;min-height:22px;max-height:34px;flex:1 0 22px;padding-inline:7px;background:linear-gradient(180deg,#1e2124,#181a1c 55%,#141618);border:1px solid #1e2226;border-radius:2px;cursor:pointer;box-shadow:none;transition:background var(--dur-control) var(--ease-out)}
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
    disabled={$viewMode === 'perform'}
    aria-label={$pgmRailOpen?'PGM SOURCE':'Open PGM rail'}
    class:pgm-collapsed={!$pgmRailOpen}
    title="PGM source — arm channels for beat-quantized cuts"
    style="display:flex;align-items:center;justify-content:{$pgmRailOpen ? 'space-between' : 'center'};gap:4px;border:none;border-bottom:1px solid #0d0e0f;background:linear-gradient(180deg,#141618,#0f1012);padding:{$pgmRailOpen
      ? '6px 8px'
      : '8px 2px'};cursor:pointer;color:#4a5260;font-family:var(--font-ui);font-size:8px;font-weight:500;letter-spacing:0.14em"
  >
    {#if $pgmRailOpen}
      <span style="color:#556070">PGM SOURCE</span>
      {#if $viewMode !== 'perform'}<ChevronLeft size={12} />{/if}
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
            {$autoRandom && !triggerDriven
            ? 'rand-blink border-red-500/50 bg-red-500/20 text-red-400 shadow-[0_0_8px_#ef444433]'
            : 'border-[#1e2226] bg-gradient-to-b from-[#1a1c1f] to-[#131517] text-[#4a5260]'}"
          disabled={triggerDriven}
          title={triggerDriven?'PGM follows the Timing trigger source below. Choose PGM SOURCE there to use these controls.':`Auto-switch to a random channel on the next ${quantizeLabel} boundary`}
          onclick={() => autoRandom.update((v) => !v)}
        >
          RAND
        </button>
      </div>

      <span class="font-mono text-[7px] tracking-wide text-[#33383f]">
        {triggerDriven?'PGM FOLLOWS TIMING TRIGGERS':`CUTS ON NEXT ${quantizeLabel}`}
      </span>

      <div class="mt-0.5 flex flex-col gap-1">
        <div class="flex flex-wrap gap-0.5">
          {#each PGM_INTERVALS as option (option.label)}
            <button
              type="button"
              disabled={triggerDriven}
              class="min-w-[26px] rounded border px-1 py-0.5 text-[7.5px] font-medium tracking-wide transition-colors
                {$intervalBeats === option.beats && !triggerDriven
                ? 'border-current/30 text-current'
                : 'border-[#1e2226] bg-gradient-to-b from-[#17191c] to-[#121416] text-[#556070]'}"
              style={$intervalBeats === option.beats && !triggerDriven
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
              disabled={triggerDriven}
              class="flex-1 rounded border py-0.5 text-[7.5px] font-medium tracking-wide transition-colors
                {$feel === opt.value && !triggerDriven
                ? 'border-current/30 text-current'
                : 'border-[#1e2226] bg-gradient-to-b from-[#17191c] to-[#121416] text-[#556070]'}"
              style={$feel === opt.value && !triggerDriven
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
          {@const isActive = $pgmSource === mod.id}
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

    </div>
  {/if}
</aside>
