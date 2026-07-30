<script lang="ts">
  import type { CapabilityState } from '$lib/rendering/webgpu/capability';

  interface Props {
    state: CapabilityState;
  }

  let { state }: Props = $props();
</script>

{#if state.renderer === 'webgpu_unavailable'}
  <div
    style="position:fixed;bottom:12px;right:12px;z-index:9999;max-width:320px;padding:8px 12px;background:#1a1212;border:1px solid #ef444455;border-radius:4px;font-family:var(--font-ui);font-size:10px;color:#fca5a5;box-shadow:0 4px 20px rgba(0,0,0,0.5)"
  >
    <strong>WebGPU unavailable</strong> — previews may be blank.
    {#if state.reason}
      <span style="display:block;margin-top:4px;color:#888;font-size:9px">{state.reason}</span>
    {/if}
  </div>
{/if}
