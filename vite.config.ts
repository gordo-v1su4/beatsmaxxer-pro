import path from "path";
import fs from "fs/promises";
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
  const qaMediaDir = env.QA_MEDIA_DIR || "/Users/robertspaniolo/Downloads/new-test-media-for-pss";

  return {
    plugins: [
      react(),
      tailwindcss(),
      viteSingleFile(),
      {
        name: "qa-rhythm-bridge",
        configureServer(server) {
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

async function readRequestBody(req: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) chunks.push(chunk);
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function postEssentiaBytes(
  apiBaseUrl: string,
  apiKey: string,
  engine: string,
  endpointName: "fast" | "rhythm",
  contentType: string,
  body: Uint8Array,
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
