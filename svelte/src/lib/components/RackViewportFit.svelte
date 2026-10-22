<script lang="ts">
  let { active }: { active: boolean } = $props();

  $effect(() => {
    if (!active) return;
    const viewport = document.querySelector<HTMLElement>('.app-viewport');
    const shell = viewport?.querySelector<HTMLElement>('.app-shell');
    if (!viewport || !shell) return;
    const desktop = matchMedia('(min-width: 961px)');
    let frame = 0;
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
    const heightTargets = '.rack-row, .main-viewer, .sections, .topbar-shell, .timing-panel, .timing-footer';
    const targetSelector = `.perform-rows, ${heightTargets}`;
    // These are imperative observer caches, not state consumed by the template.
    const observed = new Set<Element>();
    const previousSizes = new Map<Element, number>();
    const resize = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === viewport) schedule();
        else {
          const size = entry.target.matches('.perform-rows') ? entry.contentRect.width : entry.contentRect.height;
          if (Math.abs(size - (previousSizes.get(entry.target) ?? -1)) > 0.5) {
            previousSizes.set(entry.target, size); schedule();
          }
        }
      }
    });
    resize.observe(viewport);
    const refreshTargets = () => {
      const targets = new Set(shell.querySelectorAll(targetSelector));
      for (const target of observed) if (!targets.has(target)) {
        resize.unobserve(target); observed.delete(target); previousSizes.delete(target);
      }
      for (const target of targets) if (!observed.has(target)) {
        observed.add(target); resize.observe(target);
      }
    };
    refreshTargets();
    const content = new MutationObserver(records => {
      // ON AIR badges, beat counters and filenames change during playback but
      // do not change the workspace's dimensions. Measuring them reset zoom
      // and forced two full layouts on every PGM cut. Only discover newly
      // mounted layout blocks here; ResizeObserver owns actual size changes.
      const changedTargets = records.some(record => [...record.addedNodes, ...record.removedNodes]
        .some(node => node instanceof Element && (node.matches(targetSelector) || node.querySelector(targetSelector))));
      if (changedTargets) { refreshTargets(); schedule(); }
    });
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
