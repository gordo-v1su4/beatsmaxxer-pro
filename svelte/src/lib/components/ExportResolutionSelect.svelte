<script lang="ts">
  interface OutputSize { width: number; height: number }
  interface Props { output: OutputSize; onSelect: (output: OutputSize) => void }
  let { output, onSelect }: Props = $props();
  const sizes = [
    { width:854, height:480, label:'480p · 854 × 480' },
    { width:1280, height:720, label:'720p · 1280 × 720' },
    { width:1920, height:1080, label:'1080p · 1920 × 1080' },
  ];
  function change(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    const size = sizes.find(size => `${size.width}x${size.height}` === value);
    if (size) onSelect({ width:size.width, height:size.height });
  }
</script>

<label class="export-resolution">
  <span>OUTPUT SIZE</span>
  <select aria-label="Export output size" value={`${output.width}x${output.height}`} onchange={change}>
    {#each sizes as size (size.height)}<option value={`${size.width}x${size.height}`}>{size.label}</option>{/each}
  </select>
</label>

<style>
  .export-resolution { display:flex; align-items:center; gap:6px; color:var(--ink-dim); font:500 10px var(--font-ui); }
  select { min-height:28px; max-width:190px; padding:4px 6px; border:1px solid var(--edge-lit); border-radius:2px; color:var(--ink); background:var(--surface-raised); font:500 11px var(--font-ui); cursor:pointer; }
  select:focus-visible { outline:2px solid var(--focus-ring); outline-offset:2px; }
  option { background:var(--surface-panel); }
  @media (pointer:coarse) { select { min-height:44px; } }
</style>
