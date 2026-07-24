import path from "path";
import fs from "fs/promises";
import { createReadStream } from "fs";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const essentiaApiBaseUrl =
    env.ESSENTIA_API_BASE_URL ||
    env.ESSENTIA_API_URL ||
    env.VITE_ESSENTIA_API_BASE_URL ||
    env.VITE_ESSENTIA_API_URL ||
    "https://essentia.v1su4.dev";
  const essentiaApiKey = env.ESSENTIA_API_KEY || "";
  const essentiaAnalysisEngine = env.ESSENTIA_ANALYSIS_ENGINE || env.VITE_ESSENTIA_ANALYSIS_ENGINE || "aubio";
  const qaMediaDir =
    env.QA_MEDIA_DIR ||
    path.resolve(__dirname, "../../../Downloads/new-test-media-for-pss");

  return {
    plugins: [
      react(),
      tailwindcss(),
      viteSingleFile(),
      {
        name: "qa-rhythm-bridge",
        configureServer(server) {
          server.middlewares.use("/__qa/media", async (req, res) => {
            try {
              const relativePath = decodeURIComponent(
                new URL(req.url || "/", "http://127.0.0.1").pathname,
              ).replace(/^\/+/, "");
              const mediaRoot = path.resolve(qaMediaDir);
              const filePath = path.resolve(mediaRoot, relativePath);
              if (
                !relativePath ||
                (!filePath.startsWith(`${mediaRoot}${path.sep}`) &&
                  filePath !== mediaRoot)
              ) {
                res.statusCode = 400;
                res.end("Invalid QA media path");
                return;
              }
              const stat = await fs.stat(filePath);
              if (!stat.isFile()) {
                res.statusCode = 404;
                res.end();
                return;
              }
              const mimeType = mediaMimeType(filePath);
              res.setHeader("Content-Type", mimeType);
              res.setHeader("Accept-Ranges", "bytes");
              res.setHeader("Cache-Control", "no-store");
              const range = req.headers.range;
              if (range) {
                const match = /^bytes=(\d*)-(\d*)$/.exec(range);
                if (!match) {
                  res.statusCode = 416;
                  res.setHeader("Content-Range", `bytes */${stat.size}`);
                  res.end();
                  return;
                }
                const start = match[1] ? Number(match[1]) : 0;
                const end = Math.min(
                  match[2] ? Number(match[2]) : stat.size - 1,
                  stat.size - 1,
                );
                if (start > end || start >= stat.size) {
                  res.statusCode = 416;
                  res.setHeader("Content-Range", `bytes */${stat.size}`);
                  res.end();
                  return;
                }
                res.statusCode = 206;
                res.setHeader(
                  "Content-Range",
                  `bytes ${start}-${end}/${stat.size}`,
                );
                res.setHeader("Content-Length", end - start + 1);
                if (req.method === "HEAD") {
                  res.end();
                  return;
                }
                createReadStream(filePath, { start, end }).pipe(res);
                return;
              }
              res.statusCode = 200;
              res.setHeader("Content-Length", stat.size);
              if (req.method === "HEAD") {
                res.end();
                return;
              }
              createReadStream(filePath).pipe(res);
            } catch (error) {
              const code =
                typeof error === "object" &&
                error !== null &&
                "code" in error
                  ? error.code
                  : null;
              res.statusCode = code === "ENOENT" ? 404 : 500;
              res.end(
                code === "ENOENT"
                  ? "QA media fixture not found"
                  : "QA media fixture failed",
              );
            }
          });

          server.middlewares.use("/__api/analyze", async (req, res) => {
            try {
              const requestUrl = new URL(req.url || "/", "http://127.0.0.1:5174");
              const endpointName = requestUrl.pathname.replace(/^\/+/, "");
              if (req.method !== "POST" || (endpointName !== "fast" && endpointName !== "rhythm")) {
                res.statusCode = 404;
                res.end();
                return;
              }

              const contentType = req.headers["content-type"];
              if (!contentType) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ detail: "Missing content type" }));
                return;
              }

              const body = await readRequestBody(req);
              const upstream = await postEssentiaBytes(
                essentiaApiBaseUrl,
                essentiaApiKey,
                essentiaAnalysisEngine,
                endpointName,
                contentType,
                body,
              );
              const text = await upstream.text();
              res.statusCode = upstream.status;
              res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
              res.end(text);
            } catch (error) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  detail: error instanceof Error ? error.message : "Analysis proxy failed",
                }),
              );
            }
          });

          server.middlewares.use("/__qa/rhythm", async (req, res) => {
            try {
              const requestUrl = new URL(req.url || "/__qa/rhythm", "http://127.0.0.1:5175");
              const fileParam = requestUrl.searchParams.get("file");
              if (!fileParam) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ detail: "Missing file query parameter" }));
                return;
              }

              const filePath = path.resolve(qaMediaDir, fileParam);
              const bytes = await fs.readFile(filePath);
              const ext = path.extname(filePath).toLowerCase();
              const mimeType =
                ext === ".wav" ? "audio/wav"
                : ext === ".mp3" ? "audio/mpeg"
                : ext === ".m4a" ? "audio/mp4"
                : "application/octet-stream";

              const formData = new FormData();
              formData.set("file", new File([bytes], path.basename(filePath), { type: mimeType }));
              const upstream = await postEssentiaAnalysis(
                essentiaApiBaseUrl,
                essentiaApiKey,
                essentiaAnalysisEngine,
                formData
              );
              const text = await upstream.text();
              res.statusCode = upstream.status;
              res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
              res.end(text);
            } catch (error) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  detail: error instanceof Error ? error.message : "QA rhythm bridge failed",
                })
              );
            }
          });
        },
      },
    ],
    define: {
      __APP_ESSENTIA_API_BASE_URL__: JSON.stringify(essentiaApiBaseUrl),
      __APP_ESSENTIA_ANALYSIS_ENGINE__: JSON.stringify(essentiaAnalysisEngine),
    },
    server: {
      port: 5174,
      strictPort: true,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  };
});

function mediaMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".webm") return "video/webm";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".m4a") return "audio/mp4";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "application/octet-stream";
}

async function readRequestBody(req: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) chunks.push(chunk);
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const buffer = new ArrayBuffer(size);
  const body = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

function postEssentiaBytes(
  apiBaseUrl: string,
  apiKey: string,
  engine: string,
  endpointName: "fast" | "rhythm",
  contentType: string,
  body: ArrayBuffer,
) {
  const endpoint = new URL(`${apiBaseUrl.replace(/\/+$/, "")}/analyze/${endpointName}`);
  if (engine) endpoint.searchParams.set("engine", engine);

  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      ...(apiKey ? { "X-API-Key": apiKey } : {}),
    },
    body,
  });
}

async function postEssentiaAnalysis(
  apiBaseUrl: string,
  apiKey: string,
  engine: string,
  formData: FormData
) {
  const fastResponse = await postEssentiaEndpoint(apiBaseUrl, apiKey, engine, "fast", formData);
  if (
    fastResponse.ok ||
    ![404, 405, 422, 500].includes(fastResponse.status)
  ) {
    return fastResponse;
  }

  return postEssentiaEndpoint(apiBaseUrl, apiKey, engine, "rhythm", formData);
}

function postEssentiaEndpoint(
  apiBaseUrl: string,
  apiKey: string,
  engine: string,
  endpointName: "fast" | "rhythm",
  formData: FormData
) {
  const endpoint = new URL(`${apiBaseUrl.replace(/\/+$/, "")}/analyze/${endpointName}`);
  if (engine) endpoint.searchParams.set("engine", engine);

  return fetch(endpoint, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
    },
    body: formData,
  });
}
