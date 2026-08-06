<script lang="ts">
  interface Props {
    text: string;
    color: string;
  }
  let { text, color }: Props = $props();
</script>

<div
  style="writing-mode:vertical-rl;transform:rotate(180deg);font-family:var(--font-ui);font-size:7px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:{color};opacity:0.65;flex-shrink:0;line-height:1"
>
  {text}
</div>
