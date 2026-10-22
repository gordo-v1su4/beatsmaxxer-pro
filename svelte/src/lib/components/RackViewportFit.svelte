<script lang="ts">
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
      viewport.classList.remove('rack-fit');
      for (const property of ['width', 'min-height', 'zoom']) shell.style.removeProperty(property);
    };
    const fit = () => {
      frame = 0;
      if (!desktop.matches) { reset(); return; }
      viewport.classList.add('rack-fit');
      const width = viewport.clientWidth, height = viewport.clientHeight;
      shell.style.zoom = '1';
      shell.style.minHeight = '0';
      shell.style.width = 'max(100%, var(--app-min-width))';
      const naturalWidth = shell.getBoundingClientRect().width;
      shell.style.width = `${naturalWidth}px`;
      const naturalHeight = shell.getBoundingClientRect().height;
      // Fit one surface. Scaling only the cards left the toolbar/library full
      // size and the unscaled PGM list clipped beside the smaller rack.
      const scale = Math.max(0.1, Math.min(1, width / naturalWidth, height / Math.max(1, naturalHeight)));
      shell.style.zoom = String(scale);
      shell.style.minHeight = `${height / scale}px`;
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
