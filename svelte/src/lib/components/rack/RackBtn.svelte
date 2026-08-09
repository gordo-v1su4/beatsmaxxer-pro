<script lang="ts">
  interface Props {
    label: string;
    active?: boolean;
    color?: string;
    onclick?: () => void;
    width?: number;
    height?: number;
    title?: string;
  }
  let {
    label,
    active = false,
    color = '#666',
    onclick,
    width = 28,
    // 16 is the rack-wide control height. The top row used to default to 18 and
    // the bottom row passed 16 explicitly, which read as the top modules being
    // subtly chunkier — and cost 2px on every button row of the tallest cards.
    height = 16,
    title
  }: Props = $props();
  let hov = $state(false);
</script>

<button
  type="button"
  {title}
  {onclick}
  onmouseenter={() => (hov = true)}
  onmouseleave={() => (hov = false)}
  style="width:{width}px;height:{height}px;background:{active
    ? `linear-gradient(180deg,${color}22,${color}11)`
    : hov
      ? '#1e2022'
      : '#181a1c'};border-style:solid;border-width:1px;border-color:{active
    ? `${color}33`
    : '#232527'} {active ? `${color}55` : hov ? '#252729' : '#191b1d'} {active
    ? `${color}55`
    : hov
      ? '#252729'
      : '#191b1d'} {active ? `${color}55` : hov ? '#252729' : '#191b1d'};border-radius:2px;cursor:pointer;color:{active
    ? color
    : hov
      ? '#5a6070'
      : '#333840'};font-family:var(--font-ui);font-weight:500;font-size:9px;letter-spacing:0.04em;display:flex;align-items:center;justify-content:center;box-shadow:{active
    ? `inset 0 2px 4px rgba(0,0,0,0.6),0 0 6px ${color}22`
    : 'inset 0 1px 2px rgba(0,0,0,0.4)'};transition:all 0.08s;flex-shrink:0"
>{label}</button>
