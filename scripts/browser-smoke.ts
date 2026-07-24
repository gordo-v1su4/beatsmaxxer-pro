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

try {
  await waitForServer();
  console.log("Browser smoke passed: Vite served the QA entry point.");
} finally {
  server.kill();
  await server.exited;
}
