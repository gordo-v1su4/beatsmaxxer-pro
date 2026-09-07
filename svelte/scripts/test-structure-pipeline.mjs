/**
 * Agent integration check: Studio jobs via dev proxy (full MP3).
 * Usage: bun run scripts/test-structure-pipeline.mjs
 *
 * Requires dev server on :5174 and ESSENTIA_API_BASE_URL in .env.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

function loadEnvKey(name) {
  const line = readFileSync(resolve(repoRoot, ".env"), "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${name}=`));
  if (!line) throw new Error(`Missing ${name} in .env`);
  return line.slice(name.length + 1).trim();
}

const songPath = resolve(
  repoRoot,
  "test_media/redline-media/Redline (Remastered x2).mp3",
);
const bytes = readFileSync(songPath);
const file = new File([bytes], "Redline (Remastered x2).mp3", { type: "audio/mpeg" });

console.log("File:", songPath, bytes.byteLength, "bytes");

async function readJob(response) {
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

const submit = await readJob(
  await fetch("http://localhost:5174/__api/analyze/studio/jobs", {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body: (() => {
      const form = new FormData();
      form.set("file", file, file.name);
      return form;
    })(),
  }),
);

console.log("Submitted:", submit.id, submit.status, submit.stage);

let job = submit;
while (job.status !== "completed" && job.status !== "failed") {
  await new Promise((r) => setTimeout(r, 3000));
  job = await readJob(
    await fetch(`http://localhost:5174/__api/analyze/studio/jobs/${encodeURIComponent(submit.id)}`),
  );
  console.log("Poll:", job.status, job.stage);
}

if (job.status === "failed") {
  console.error(job.error);
  process.exit(1);
}

const sections = job.result?.structure?.sections ?? [];
console.log("Sections:", sections.length);
console.log(
  sections.slice(0, 5).map((s) => `${s.label} ${s.start?.toFixed(1)}-${s.end?.toFixed(1)}s`).join(" | "),
);
console.log("OK");
