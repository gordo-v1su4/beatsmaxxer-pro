/**
 * E2E: Redline MP3 via chunked RustFS staging + Studio manifest through dev/prod proxy.
 * Usage: bun run scripts/test-chunked-studio-pipeline.mjs [baseUrl]
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const CHUNK_SIZE = 3 * 1024 * 1024;
const DIRECT_MAX = 4_000_000;

function loadEnvKey(name) {
  const line = readFileSync(resolve(repoRoot, ".env"), "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${name}=`));
  if (!line) return "";
  return line.slice(name.length + 1).trim();
}

const baseUrl = (process.argv[2] ?? "http://127.0.0.1:5174").replace(/\/+$/, "");
const songPath = resolve(repoRoot, "test_media/redline-media/Redline (Remastered x2).mp3");
const bytes = readFileSync(songPath);
const file = new File([bytes], "Redline (Remastered x2).mp3", { type: "audio/mpeg" });
const pin = loadEnvKey("APP_ACCESS_PIN");

console.log("Base:", baseUrl);
console.log("File:", songPath);
console.log("Size:", bytes.byteLength, `(${(bytes.byteLength / 1_048_576).toFixed(2)} MiB)`);
console.log("Chunked:", bytes.byteLength > DIRECT_MAX);

async function readJson(response) {
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text);
}

async function unlockGate() {
  if (!pin) return "";
  const response = await fetch(`${baseUrl}/__api/gate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  const setCookie = response.headers.get("set-cookie");
  if (!response.ok) throw new Error(`Gate unlock failed: HTTP ${response.status}`);
  return setCookie?.split(";")[0] ?? "";
}

async function uploadChunks(cookie) {
  const uploadId = randomUUID();
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const manifestChunks = [];
  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const partName = `${String(index).padStart(5, "0")}.part`;
    const form = new FormData();
    form.set("file", file.slice(start, end), partName);
    const url = new URL(`${baseUrl}/__api/storage/upload`);
    url.searchParams.set("uploadId", uploadId);
    url.searchParams.set("chunkIndex", String(index));
    url.searchParams.set("filename", file.name);
    const response = await fetch(url, {
      method: "POST",
      headers: cookie ? { Cookie: cookie } : {},
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    const payload = await readJson(response);
    manifestChunks.push({
      index,
      object_key: payload.object_key,
      size: payload.size,
    });
    console.log(`Chunk ${index + 1}/${totalChunks} staged (${payload.size} bytes)`);
  }
  return {
    schema_version: "studio-chunk-manifest-v1",
    upload_id: uploadId,
    filename: file.name,
    content_type: "audio/mpeg",
    total_bytes: file.size,
    chunks: manifestChunks,
  };
}

const cookie = await unlockGate();
const headers = {
  "Idempotency-Key": randomUUID(),
  ...(cookie ? { Cookie: cookie } : {}),
};

let submitBody;
if (file.size > DIRECT_MAX) {
  const manifest = await uploadChunks(cookie);
  headers["Content-Type"] = "application/json";
  submitBody = JSON.stringify(manifest);
} else {
  const form = new FormData();
  form.set("file", file, file.name);
  submitBody = form;
}

const submit = await readJson(
  await fetch(`${baseUrl}/__api/analyze/studio/jobs`, {
    method: "POST",
    headers,
    body: submitBody,
    signal: AbortSignal.timeout(120_000),
  }),
);
console.log("Submitted:", submit.id, submit.status, submit.stage);

let job = submit;
const deadline = Date.now() + 30 * 60_000;
while (job.status !== "completed" && job.status !== "failed") {
  if (Date.now() > deadline) throw new Error(`Poll timeout for job ${submit.id}`);
  await new Promise((r) => setTimeout(r, 3000));
  job = await readJson(
    await fetch(`${baseUrl}/__api/analyze/studio/jobs/${encodeURIComponent(submit.id)}`, {
      headers: cookie ? { Cookie: cookie } : {},
      signal: AbortSignal.timeout(60_000),
    }),
  );
  console.log("Poll:", job.status, job.stage);
}

if (job.status === "failed") {
  console.error(job.error);
  process.exit(1);
}

const sections = job.result?.structure?.sections ?? [];
console.log("BPM:", job.result?.bpm);
console.log("Sections:", sections.length);
console.log(
  sections.slice(0, 8).map((s) => `${s.label} ${s.start?.toFixed(1)}-${s.end?.toFixed(1)}s`).join(" | "),
);
console.log("OK");
