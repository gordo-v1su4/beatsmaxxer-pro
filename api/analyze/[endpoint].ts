import type { IncomingMessage, ServerResponse } from "node:http";

export const config = {
  api: {
    bodyParser: false,
  },
};

type RouteRequest = IncomingMessage & {
  query: { endpoint?: string | string[] };
};

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function resolveEssentiaApiBaseUrl() {
  return (
    process.env.ESSENTIA_API_BASE_URL ||
    process.env.ESSENTIA_API_URL ||
    process.env.VITE_ESSENTIA_API_BASE_URL ||
    process.env.VITE_ESSENTIA_API_URL ||
    "https://essentia.v1su4.dev"
  )
    .trim()
    .replace(/\/+$/, "");
}

function resolveEssentiaApiKey() {
  return (process.env.ESSENTIA_API_KEY || process.env.VITE_ESSENTIA_API_KEY || "").trim();
}

export default async function handler(req: RouteRequest, res: ServerResponse) {
  try {
    const endpointName = Array.isArray(req.query.endpoint)
      ? req.query.endpoint[0]
      : req.query.endpoint;

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
    const upstream = await fetch(`${resolveEssentiaApiBaseUrl()}/analyze/${endpointName}`, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        ...(resolveEssentiaApiKey() ? { "X-API-Key": resolveEssentiaApiKey() } : {}),
      },
      body: new Uint8Array(body),
    });

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
}
