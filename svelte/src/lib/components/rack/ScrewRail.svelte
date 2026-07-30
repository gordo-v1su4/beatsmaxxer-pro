<script lang="ts">
  interface Props {
    side?: 'left' | 'right';
  }
  let { side = 'left' }: Props = $props();
  const bg = $derived(
    side === 'left'
      ? 'linear-gradient(90deg, #0d0e0f 0%, #161819 60%, #0f1012 100%)'
      : 'linear-gradient(270deg, #0d0e0f 0%, #161819 60%, #0f1012 100%)'
  );
  const borderSide = $derived(side === 'left' ? 'border-right:1px solid #0d0e0f' : 'border-left:1px solid #0d0e0f');
</script>

<div
  style="width:8px;flex-shrink:0;background:{bg};{borderSide};display:flex;flex-direction:column;justify-content:space-between;padding-top:12px;padding-bottom:12px"
>
  {#each Array.from({ length: 18 }) as _, i (i)}
    <div
      style="width:6px;height:6px;border-radius:50%;background:radial-gradient(circle at 35% 35%, #2a2d32, #111);border:1px solid #0a0b0c;margin-left:1px"
    ></div>
  {/each}
</div>
