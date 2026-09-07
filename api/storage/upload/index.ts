import type { IncomingMessage, ServerResponse } from "node:http";
import { handleStorageUpload, storageHandlerConfig } from "../handler.js";

export const config = storageHandlerConfig;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handleStorageUpload(req, res);
}
