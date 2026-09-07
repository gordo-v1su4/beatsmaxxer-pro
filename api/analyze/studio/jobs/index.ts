import type { IncomingMessage, ServerResponse } from "node:http";
import { analysisHandlerConfig, handleAnalysisProxy } from "../../handler.js";

export const config = analysisHandlerConfig;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handleAnalysisProxy(req, res, "studio/jobs");
}
