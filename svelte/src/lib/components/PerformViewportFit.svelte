<script lang="ts">
  import { RACK_SLOTS_PER_ROW } from '$lib/modules/rackSlots';
  let { active }: { active: boolean } = $props();

  $effect(() => {
    if (!active) return;
    const viewport = document.querySelector<HTMLElement>('.app-viewport');
    const shell = viewport?.querySelector<HTMLElement>('.app-shell');
    if (!viewport || !shell) return;
    const desktop = matchMedia('(min-width: 961px)');
    let frame = 0;
    const rows = [...shell.querySelectorAll<HTMLElement>('.rack-row')];
    const reset = () => {
      viewport.classList.remove('perform-fit');
      for (const property of ['width', 'min-height']) shell.style.removeProperty(property);
      for (const row of rows) for (const property of ['zoom', 'width']) row.style.removeProperty(property);
    };
    const fit = () => {
      frame = 0;
      if (!desktop.matches) { reset(); return; }
      viewport.classList.add('perform-fit');
      const width = viewport.clientWidth, height = viewport.clientHeight;
      shell.style.width = `${width}px`;
      shell.style.minHeight = `${height}px`;
      const rack = shell.querySelector<HTMLElement>('.perform-rows');
      if (!rack) return;
      const rackWidth = rack.getBoundingClientRect().width;
      const naturalWidth = Math.max(rackWidth, RACK_SLOTS_PER_ROW * 272 + RACK_SLOTS_PER_ROW - 1);
      for (const row of rows) { row.style.zoom = '1'; row.style.width = `${naturalWidth}px`; }
      const rowHeight = rows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
      const fixedHeight = shell.getBoundingClientRect().height - rowHeight;
      // Scale complete cards together, including MIDI, controls and presets.
      // The image continues to fill its card at 16:9, with no side gutters.
      const scale = Math.min(1, rackWidth / naturalWidth, Math.max(0, height - fixedHeight - 1) / Math.max(1, rowHeight));
      for (const row of rows) {
        row.style.zoom = String(Math.max(0.1, scale));
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(fit); };
    let previousRackWidth = -1;
    const previousRowHeights = new Map<Element, number>();
    const previousFixedHeights = new Map<Element, number>();
    const fixedBlocks = [...shell.querySelectorAll<HTMLElement>('.main-viewer, .sections, .topbar-shell, .timing-footer')];
    const resize = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === viewport) schedule();
        else if (rows.includes(entry.target as HTMLElement)) {
          if (Math.abs(entry.contentRect.height - (previousRowHeights.get(entry.target) ?? -1)) > 0.5) {
            previousRowHeights.set(entry.target, entry.contentRect.height);
            schedule();
          }
        } else if (fixedBlocks.includes(entry.target as HTMLElement)) {
          if (Math.abs(entry.contentRect.height - (previousFixedHeights.get(entry.target) ?? -1)) > 0.5) {
            previousFixedHeights.set(entry.target, entry.contentRect.height);
            schedule();
          }
        } else if (Math.abs(entry.contentRect.width - previousRackWidth) > 0.5) {
          previousRackWidth = entry.contentRect.width;
          schedule();
        }
      }
    });
    resize.observe(viewport);
    const rack = shell.querySelector<HTMLElement>('.perform-rows');
    if (rack) resize.observe(rack);
    for (const row of rows) resize.observe(row);
    for (const block of fixedBlocks) resize.observe(block);
    const content = new MutationObserver(schedule);
    content.observe(shell, { childList: true, subtree: true });
    desktop.addEventListener('change', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect(); content.disconnect();
      desktop.removeEventListener('change', schedule);
      reset();
    };
  });
</script>
