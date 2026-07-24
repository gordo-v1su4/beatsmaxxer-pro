import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const forbiddenTrackedNames = /(^|\/)\.env(?:\.|$)|\.(?:pem|p12|pfx|key)$/i;
const suspiciousContent = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[opsu]_[A-Za-z0-9]{30,}\b/,
  /\bsk-[A-Za-z0-9_-]{24,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
];

export function scanText(text: string) {
  return suspiciousContent.some((pattern) => pattern.test(text));
}

async function listFiles(command: string[]) {
  const process = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
  const output = await new Response(process.stdout).text();
  const error = await new Response(process.stderr).text();
  const exitCode = await process.exited;
  if (exitCode !== 0) throw new Error(error.trim() || `${command.join(" ")} failed`);
  return output.split("\0").filter(Boolean);
}

async function walkFiles(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? walkFiles(path) : [path];
    }),
  );
  return nested.flat();
}

async function localSecretValues() {
  if (!existsSync(".env")) return [];
  const text = await readFile(".env", "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.match(/^[A-Z][A-Z0-9_]*=(.*)$/)?.[1]?.trim() ?? "")
    .map((value) => value.replace(/^(['"])(.*)\1$/, "$2"))
    .filter((value) => value.length >= 12 && !/^(?:change-me|example|placeholder)$/i.test(value));
}

async function main() {
  const stagedOnly = Bun.argv.includes("--staged");
  const tracked = await listFiles(
    stagedOnly
      ? ["git", "diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"]
      : ["git", "ls-files", "-z"],
  );
  const failures = new Map<string, string>();

  for (const path of tracked) {
    if (forbiddenTrackedNames.test(path) && path !== ".env.example") {
      failures.set(path, "tracked secret-file name");
      continue;
    }
    if (!existsSync(path) || path === "bun.lock") continue;
    const text = await readFile(path, "utf8").catch(() => "");
    if (scanText(text)) failures.set(path, "possible credential pattern");
  }

  const configuredSecrets = await localSecretValues();
  if (configuredSecrets.length > 0) {
    for (const path of await walkFiles("dist")) {
      const text = await readFile(path, "utf8").catch(() => "");
      if (configuredSecrets.some((secret) => text.includes(secret))) {
        failures.set(relative(".", path), "configured secret embedded in build");
      }
    }
  }

  if (failures.size > 0) {
    for (const [path, category] of failures) console.error(`${path}: ${category}`);
    process.exit(1);
  }

  console.log(
    `Secret scan passed (${tracked.length} ${stagedOnly ? "staged" : "tracked"} files; values redacted).`,
  );
}

if (import.meta.main) await main();
