<script lang="ts">
  import type { TimingSlotStatus } from '$lib/stores/timing';
  let { status }: { status?: TimingSlotStatus } = $props();
  const verified = $derived(status?.state === 'ready' && status.interpolationFactor === 4);
</script>
{#if status?.state === 'ready'}
  <span class="readiness" class:verified title={verified
    ? `Verified 4× RIFE clip attached · ${status.fps?.toFixed(0)} FPS stored · ${(Number(status.fps)/4).toFixed(0)} unique FPS at ¼ speed`
    : `No verified 4× interpolated clip attached · ${status.fps?.toFixed(0)} FPS source. Speedramp still works; slow playback may repeat frames.`}>
    {verified ? '4× RIFE' : 'BASE'}
  </span>
{/if}
<style>
  .readiness{font:6px var(--font-mono);letter-spacing:.06em;white-space:nowrap;flex-shrink:0;color:#556070;border:1px solid #252a30;border-radius:2px;padding:1px 3px}.verified{color:#99f6e4;border-color:#99f6e444;background:#99f6e40b}
</style>
