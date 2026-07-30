<script lang="ts">
  interface Props {
    value: number;
    color: string;
  }
  let { value, color }: Props = $props();
</script>

<div style="display:flex;flex-direction:column;gap:1px;height:36px;justify-content:flex-end">
  {#each Array.from({ length: 12 }) as _, i (i)}
    {@const thr = ((11 - i) / 12) * 100}
    {@const lit = value > thr}
    {@const bc = i < 1 ? '#ef4444' : i < 3 ? '#eab308' : color}
    <div
      style="height:2px;width:5px;background:{lit ? bc : '#1a1c1e'};border-radius:0.5px;box-shadow:{lit
        ? `0 0 3px ${bc}88`
        : 'none'}"
    ></div>
  {/each}
</div>
