const server = Bun.spawn(["bun", "run", "dev", "--host", "127.0.0.1"], {
  stdout: "pipe",
  stderr: "pipe",
  env: {
    ...process.env,
    ESSENTIA_API_KEY: "",
  },
});

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      const stderr = await new Response(server.stderr).text();
      throw new Error(stderr.trim() || `Vite exited with ${server.exitCode}`);
    }
    try {
      const response = await fetch("http://127.0.0.1:5174/?qa=baseline");
      const html = await response.text();
      if (response.ok && html.includes('id="root"')) return;
    } catch {
      // The server may still be starting.
    }
    await Bun.sleep(100);
  }
  throw new Error("Timed out waiting for Vite browser smoke server");
}

async function waitForDataset(
  url: string,
  key: "beatSurferMultiClip" | "beatSurferQaTelemetry",
  deadlineMs = 10_000,
) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const response = await fetch(url);
    const html = await response.text();
    const match = html.match(
      new RegExp(`data-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}="([^"]+)"`),
    );
    if (match?.[1]) {
      try {
        return JSON.parse(match[1]) as Record<string, unknown>;
      } catch {
        // HTML shell may not have hydrated yet.
      }
    }
    await Bun.sleep(200);
  }
  return null;
}

try {
  await waitForServer();

  const baseline = await fetch("http://127.0.0.1:5174/?qa=baseline");
  if (!baseline.ok) {
    throw new Error(`Baseline QA route failed: ${baseline.status}`);
  }

  const sampleUrl =
    "http://127.0.0.1:5174/?qa=sample-media&qaAutoplay=0&qaPgm=timesampler";
  const sampleMedia = await fetch(sampleUrl);
  if (!sampleMedia.ok) {
    throw new Error(`Sample media QA route failed: ${sampleMedia.status}`);
  }
  const html = await sampleMedia.text();
  if (!html.includes('id="root"')) {
    throw new Error("Sample media page did not include app root");
  }

  const multiClip = await waitForDataset(sampleUrl, "beatSurferMultiClip");
  if (multiClip?.error) {
    throw new Error(`Multi-clip runtime error: ${String(multiClip.error)}`);
  }

  console.log(
    "Browser smoke passed: Vite served baseline and sample-media QA routes.",
    multiClip?.renderer
      ? `Renderer path: ${(multiClip.renderer as { fallback?: { path?: string } }).fallback?.path ?? "unknown"}`
      : "Renderer telemetry pending hydration",
  );
} finally {
  server.kill();
  await server.exited;
}
