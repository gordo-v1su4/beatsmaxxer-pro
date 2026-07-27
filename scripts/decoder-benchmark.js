/**
 * Eight-clip decoder pressure benchmark.
 *
 * Paste-able into a DevTools console (or CDP Runtime.evaluate with awaitPromise)
 * on a dev build with the QA telemetry bridge active. Measures a fixed window so
 * before/after runs are comparable: per-clip dropped frames, total drop
 * percentage, render-loop FPS, and JS heap.
 */
(function benchmark(windowMs = 20000) {
  const qa = window.__BEAT_SURFER_QA_TELEMETRY__;
  if (!qa?.videoDecodeStats) {
    return Promise.resolve({ error: "QA telemetry bridge not installed" });
  }

  const heap = () =>
    performance.memory
      ? Math.round(performance.memory.usedJSHeapSize / 1048576)
      : null;

  const index = (stats) =>
    Object.fromEntries(stats.map((entry) => [entry.ownerId, entry]));

  const before = index(qa.videoDecodeStats());
  const heapBefore = heap();

  let frames = 0;
  let worst = 0;
  let last = performance.now();
  const start = last;

  return new Promise((resolve) => {
    function tick(now) {
      const delta = now - last;
      if (frames > 0 && delta > worst) worst = delta;
      last = now;
      frames++;
      if (now - start < windowMs) {
        requestAnimationFrame(tick);
        return;
      }

      const elapsed = (now - start) / 1000;
      const after = index(qa.videoDecodeStats());
      const perClip = [];
      let totalFrames = 0;
      let totalDropped = 0;

      for (const [ownerId, entry] of Object.entries(after)) {
        const prior = before[ownerId];
        const decoded = entry.totalFrames - (prior?.totalFrames ?? 0);
        const dropped = entry.droppedFrames - (prior?.droppedFrames ?? 0);
        if (decoded <= 0 && dropped <= 0) continue;
        totalFrames += decoded;
        totalDropped += dropped;
        perClip.push({
          ownerId,
          decoded,
          dropped,
          dropPct: decoded > 0 ? +((dropped / decoded) * 100).toFixed(1) : null,
          readyState: entry.readyState,
          paused: entry.paused,
        });
      }

      perClip.sort((a, b) => (b.dropPct ?? 0) - (a.dropPct ?? 0));

      resolve({
        windowSeconds: +elapsed.toFixed(1),
        decoders: perClip.length,
        perClip,
        totalDecoded: totalFrames,
        totalDropped,
        totalDropPct:
          totalFrames > 0 ? +((totalDropped / totalFrames) * 100).toFixed(1) : null,
        fps: +(frames / elapsed).toFixed(1),
        worstFrameMs: +worst.toFixed(1),
        heapMbBefore: heapBefore,
        heapMbAfter: heap(),
      });
    }
    requestAnimationFrame(tick);
  });
})();
