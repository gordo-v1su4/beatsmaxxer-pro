<script lang="ts">
  interface Props {
    name: string;
    expanded: boolean;
    controlsId: string;
    onToggle: () => void;
  }
  let { name, expanded, controlsId, onToggle }: Props = $props();
</script>

<button type="button" class="control-detail-toggle" aria-expanded={expanded} aria-controls={controlsId}
  aria-label={`${expanded ? 'Close' : 'Edit'} ${name} controls`} onclick={onToggle}>
  <span>{expanded ? 'Done editing' : 'Edit controls'}</span><span aria-hidden="true">{expanded ? '−' : '+'}</span>
</button>

<style>
  .control-detail-toggle { display:flex; align-items:center; justify-content:space-between; width:100%; min-height:26px; padding:4px 8px; flex-shrink:0; border:0; border-top:1px solid var(--edge-soft); border-radius:0; background:var(--surface-panel); color:var(--ink-dim); font:500 11px var(--font-ui); text-align:left; cursor:pointer; }
  .control-detail-toggle:hover { background:var(--surface-hover); color:var(--ink); }
  .control-detail-toggle[aria-expanded="true"] { color:var(--option-selected-ink); }
  .control-detail-toggle:focus-visible { outline:2px solid var(--focus-ring); outline-offset:-2px; }
  @media (pointer:coarse) { .control-detail-toggle { min-height:44px; } }
</style>
