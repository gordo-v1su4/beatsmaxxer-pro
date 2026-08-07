import {
  ACCESS_COOKIE_NAME,
  accessGateConfigFromEnv,
  clearAttempts,
  isAccessGateEnabled,
  isAttemptLimited,
  isCorrectPin,
  isValidSessionToken,
  mintSessionToken,
  parseCookie,
  registerFailedAttempt,
  sessionCookie,
  type AccessGateConfig,
} from "./policy.js";

export interface AccessGateRequest {
  method?: string;
  cookieHeader?: string;
  forwardedFor?: string;
  forwardedProto?: string;
  body?: unknown;
}

export interface AccessGateResponse {
  status: number;
  body: string;
  setCookie?: string;
}

const json = (status: number, payload: unknown, setCookie?: string): AccessGateResponse => ({
  status,
  body: JSON.stringify(payload),
  ...(setCookie ? { setCookie } : {}),
});

function clientKey(request: AccessGateRequest) {
  return request.forwardedFor?.split(",")[0]?.trim() || "unknown";
}

export function handleAccessGate(
  request: AccessGateRequest,
  config: AccessGateConfig = accessGateConfigFromEnv(process.env),
): AccessGateResponse {
  const enabled = isAccessGateEnabled(config);
  const token = parseCookie(request.cookieHeader, ACCESS_COOKIE_NAME);
  const unlocked = !enabled || isValidSessionToken(token, config);

  // The client asks on load whether it needs to show the lock screen, so the
  // answer lives on the server rather than in the bundle. Changing the PIN takes
  // effect on the next request; no rebuild.
  if (request.method === "GET") return json(200, { required: enabled, unlocked });
  if (request.method !== "POST") return json(405, { code: "method_not_allowed" });
  if (!enabled) return json(200, { required: false, unlocked: true });

  const key = clientKey(request);
  if (isAttemptLimited(key)) return json(429, { code: "too_many_attempts" });

  const submitted = (request.body as { pin?: unknown } | undefined)?.pin;
  if (!isCorrectPin(submitted, config)) {
    registerFailedAttempt(key);
    return json(401, { code: "invalid_pin" });
  }

  clearAttempts(key);
  const secure = (request.forwardedProto?.split(",")[0]?.trim() ?? "https") !== "http";
  return json(
    200,
    { required: true, unlocked: true },
    sessionCookie(mintSessionToken(config), secure),
  );
}
