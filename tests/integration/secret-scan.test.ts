import { describe, expect, test } from "bun:test";
import { scanText } from "../../scripts/secret-scan";

describe("secret scan", () => {
  test("detects credential-shaped input without returning its value", () => {
    const sentinel = `ghp_${"a".repeat(32)}`;
    const result = scanText(`token=${sentinel}`);

    expect(result).toBe(true);
    expect(String(result)).not.toContain(sentinel);
  });

  test("allows ordinary configuration names", () => {
    expect(scanText("ESSENTIA_API_KEY=<redacted>")).toBe(false);
  });
});
