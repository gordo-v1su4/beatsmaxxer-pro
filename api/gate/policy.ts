import { createHmac, timingSafeEqual } from "node:crypto";

export const ACCESS_COOKIE_NAME = "bsp_access";
export const ACCESS_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Failed attempts allowed per instance before it stops answering for a while. */
export const ACCESS_MAX_ATTEMPTS = 10;
export const ACCESS_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

export interface AccessGateConfig {
  /** Empty means no gate: the app is open and every request is already allowed. */
  pin: string;
}

export function accessGateConfigFromEnv(env: Record<string, string | undefined>): AccessGateConfig {
  return { pin: (env.APP_ACCESS_PIN ?? "").trim() };
}

/**
 * A gate with no PIN configured is no gate. Failing open on missing config is
 * deliberate: locking the operator out of their own deployment is worse than the
 * exposure they already have, and a half-configured gate that rejects everyone
 * looks identical to an outage.
 */
export function isAccessGateEnabled(config: AccessGateConfig) {
  return config.pin.length > 0;
}

/** Signing key is derived from the PIN, so rotating the PIN ends every session. */
function signingKey(pin: string) {
  return createHmac("sha256", "bsp.access.v1").update(pin).digest();
}

function sign(expiresAtMs: number, pin: string) {
  return createHmac("sha256", signingKey(pin)).update(String(expiresAtMs)).digest("hex");
}

export function mintSessionToken(config: AccessGateConfig, now = Date.now()) {
  const expiresAtMs = now + ACCESS_SESSION_TTL_MS;
  return `${expiresAtMs}.${sign(expiresAtMs, config.pin)}`;
}

export function isValidSessionToken(
  token: string | undefined,
  config: AccessGateConfig,
  now = Date.now(),
) {
  if (!token) return false;
  const separator = token.indexOf(".");
  if (separator < 1) return false;
  const expiresAtMs = Number(token.slice(0, separator));
  if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= now) return false;
  return constantTimeEquals(token.slice(separator + 1), sign(expiresAtMs, config.pin));
}

export function isCorrectPin(candidate: unknown, config: AccessGateConfig) {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  return constantTimeEquals(candidate, config.pin);
}

/** Compares by digest so unequal lengths do not short-circuit and leak size. */
function constantTimeEquals(a: string, b: string) {
  const left = createHmac("sha256", "bsp.compare").update(a).digest();
  const right = createHmac("sha256", "bsp.compare").update(b).digest();
  return timingSafeEqual(left, right);
}

export function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}

export function sessionCookie(token: string, secure: boolean) {
  const attributes = [
    `${ACCESS_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.floor(ACCESS_SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

/**
 * Per-instance failed-attempt counter. Serverless scales out, so this bounds one
 * instance rather than the deployment — it raises the cost of guessing without
 * pretending to be a durable rate limiter. The published WAF rule is what bounds
 * the deployment; see svelte/docs/ESSENTIA.md.
 */
const attempts = new Map<string, { count: number; firstAtMs: number }>();

export function registerFailedAttempt(clientKey: string, now = Date.now()) {
  const existing = attempts.get(clientKey);
  if (!existing || now - existing.firstAtMs > ACCESS_ATTEMPT_WINDOW_MS) {
    attempts.set(clientKey, { count: 1, firstAtMs: now });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

export function isAttemptLimited(clientKey: string, now = Date.now()) {
  const existing = attempts.get(clientKey);
  if (!existing) return false;
  if (now - existing.firstAtMs > ACCESS_ATTEMPT_WINDOW_MS) {
    attempts.delete(clientKey);
    return false;
  }
  return existing.count >= ACCESS_MAX_ATTEMPTS;
}

export function clearAttempts(clientKey: string) {
  attempts.delete(clientKey);
}

/** Test seam: the attempt map is module state and leaks between cases otherwise. */
export function resetAttemptsForTest() {
  attempts.clear();
}
