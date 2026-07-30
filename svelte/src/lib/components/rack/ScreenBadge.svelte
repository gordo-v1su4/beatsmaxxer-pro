<script lang="ts">
  interface Props {
    text: string;
    color: string;
  }
  let { text, color }: Props = $props();
</script>

<div
  style="position:absolute;top:4px;left:5px;z-index:10;background:rgba(0,0,0,0.75);border:1px solid {color}44;border-radius:2px;height:13px;padding-inline:4px;display:flex;align-items:center"
>
  <span
    style="font-family:var(--font-mono);font-size:7px;line-height:1;color:{color};letter-spacing:0.08em;opacity:0.85"
    >{text}</span
  >
</div>
