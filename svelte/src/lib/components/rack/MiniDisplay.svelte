<script lang="ts">
  interface Props {
    value: string;
    width?: number;
  }
  let { value, width = 60 }: Props = $props();
</script>

<div
  style="width:{width}px;height:18px;background:#0a0b0c;border-style:solid;border-width:1px;border-color:#111 #1a1c1e #1a1c1e #1a1c1e;border-radius:2px;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 2px 4px rgba(0,0,0,0.7)"
>
  <span
    style="font-family:var(--font-mono);font-size:9px;color:#6a7a8a;letter-spacing:0.06em"
    >{value}</span
  >
</div>
