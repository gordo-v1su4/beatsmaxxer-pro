<script lang="ts">
  interface Props {
    label: string;
    active?: boolean;
    activeColor?: string;
    onclick?: () => void;
  }
  let { label, active = false, activeColor = '#ef4444', onclick }: Props = $props();
  let hov = $state(false);
</script>

<button
  type="button"
  class="header-btn"
  {onclick}
  onmouseenter={() => (hov = true)}
  onmouseleave={() => (hov = false)}
  style="width:18px;height:14px;background:{active
    ? `linear-gradient(180deg,${activeColor}33,${activeColor}22)`
    : hov
      ? '#1e2022'
      : '#191b1d'};border-style:solid;border-width:1px;border-color:{active
    ? `${activeColor}33`
    : '#232527'} {active ? `${activeColor}55` : '#0e1012'} {active
    ? `${activeColor}55`
    : '#0e1012'} {active ? `${activeColor}55` : '#0e1012'};border-radius:2px;cursor:pointer;color:{active
    ? activeColor
    : hov
      ? '#7a8090'
      : '#3a4050'};font-family:var(--font-ui);font-weight:500;font-size:8px;letter-spacing:0.05em;display:flex;align-items:center;justify-content:center;box-shadow:{active
    ? `inset 0 1px 3px rgba(0,0,0,0.6),0 0 5px ${activeColor}33`
    : 'var(--control-shadow)'};transition:background var(--dur-control) var(--ease-out),border-color var(--dur-control) var(--ease-out),color var(--dur-control) var(--ease-out),box-shadow var(--dur-control) var(--ease-out),transform var(--dur-press) var(--ease-out)"
>{label}</button>

<style>
  .header-btn:active {
    transform: translateY(0.5px);
    box-shadow: var(--control-shadow-pressed) !important;
  }
  @media (prefers-reduced-motion: reduce) {
    .header-btn { transition-duration: 0ms !important; }
  }
</style>
