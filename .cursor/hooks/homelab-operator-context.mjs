#!/usr/bin/env node
/**
 * Project sessionStart hook — same chain as proxmox-home user hook.
 * Resolves proxmox-home via PROXMOX_HOME_REPO or sibling ../proxmox-home.
 */
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "..", "..");
const candidates = [
  process.env.PROXMOX_HOME_REPO?.trim(),
  join(projectRoot, "..", "proxmox-home"),
  join(homedir(), "Documents", "Github", "proxmox-home"),
].filter(Boolean);

const repoRoot = candidates.find((p) => existsSync(join(p, "cursor", "homelab-operator-context.md")));
const contextFile = repoRoot
  ? join(repoRoot, "cursor", "homelab-operator-context.md")
  : null;

let body = "";
if (contextFile && existsSync(contextFile)) {
  body = readFileSync(contextFile, "utf8").trim();
} else {
  body = [
    "Homelab lookup: Hermes notebook vault (Obsidian) → proxmox-home → BWS for secrets.",
    "Rotate secrets: update BWS + proxmox-home + Obsidian pointer together.",
    "Clone proxmox-home alongside this repo or set PROXMOX_HOME_REPO.",
  ].join("\n");
}

process.stdout.write(
  `${JSON.stringify({
    additional_context: `<homelab_operator_lookup>\n${body}\n</homelab_operator_lookup>`,
  })}\n`,
);
