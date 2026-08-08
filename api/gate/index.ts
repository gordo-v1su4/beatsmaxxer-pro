import type { IncomingMessage, ServerResponse } from "node:http";
// Extension is required: the repo is "type": "module" and Vercel compiles this
// function with node16 resolution. TypeScript maps ./handler.js to ./handler.ts.
import { handleAccessGate } from "./handler.js";
import { accessGateConfigFromEnv } from "./policy.js";

const MAX_BODY_BYTES = 4_096;

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) return undefined;
    chunks.push(chunk);
  }
  if (total === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const body = req.method === "POST" ? await readJsonBody(req) : undefined;
  const result = handleAccessGate(
    {
      method: req.method,
      cookieHeader: firstHeader(req.headers.cookie),
      forwardedFor: firstHeader(req.headers["x-forwarded-for"]),
      forwardedProto: firstHeader(req.headers["x-forwarded-proto"]),
      body,
    },
    accessGateConfigFromEnv(process.env),
  );

  res.statusCode = result.status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (result.setCookie) res.setHeader("Set-Cookie", result.setCookie);
  res.end(result.body);
}
