<script lang="ts">
  import { dragState } from '$lib/stores/drag';
  import { getModuleDef } from '$lib/modules/catalog';

  const mod = $derived(
    $dragState.payload ? getModuleDef($dragState.payload.moduleId) : undefined
  );
</script>

{#if $dragState.active && $dragState.input === 'pointer' && mod}
  <div
    class="pointer-events-none fixed z-[9999] rounded-lg border border-zinc-600 bg-[#12141a]/95 px-3 py-2 shadow-2xl backdrop-blur-sm"
    style="
      left: {$dragState.x}px;
      top: {$dragState.y}px;
      transform: translate(-50%, -120%) rotate(-2deg) scale(1.05);
      border-top: 2px solid {mod.accentColor};
      box-shadow: 0 12px 40px #000a, 0 0 0 1px {mod.accentColor}44;
    "
  >
    <span class="text-[11px] font-bold tracking-wide" style="color:{mod.accentColor}">
      {mod.shortName}
    </span>
    <span class="ml-2 text-[9px] text-zinc-500">{mod.name}</span>
  </div>
{/if}

{#if $dragState.active && $dragState.input === 'keyboard' && mod}
  <div class="sr-only" role="status" aria-live="polite">
    {mod.name} grabbed. Tab to a rack slot, then press Enter or Space to drop. Press Escape to cancel.
  </div>
{/if}
