/**
 * Client half of the access gate. The server is the authority — it owns the PIN
 * and the session cookie — so this only asks whether the lock screen should be
 * shown and forwards an attempt. Nothing here can unlock anything on its own.
 */
const CACHE_KEY = 'bmx.access.state';

export type AccessState = 'checking' | 'open' | 'locked';

export interface AccessStatus {
  required: boolean;
  unlocked: boolean;
}

export function gateEndpoint(origin = window.location.origin) {
  return new URL('/__api/gate', origin);
}

/**
 * Last known state, so a returning operator does not watch the lock screen flash
 * while the status request is in flight. Only ever an optimisation — the server
 * answer replaces it, and anything unrecognised means show the gate.
 */
export function cachedState(): AccessState {
  if (typeof localStorage === 'undefined') return 'checking';
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    return stored === 'open' || stored === 'locked' ? stored : 'checking';
  } catch {
    return 'checking';
  }
}

export function cacheState(state: AccessState) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (state === 'checking') localStorage.removeItem(CACHE_KEY);
    else localStorage.setItem(CACHE_KEY, state);
  } catch {
    /* storage unavailable — the status request still decides */
  }
}

export function stateFromStatus(status: AccessStatus): AccessState {
  return !status.required || status.unlocked ? 'open' : 'locked';
}

export async function fetchAccessState(fetchImpl = globalThis.fetch): Promise<AccessState> {
  try {
    const response = await fetchImpl(gateEndpoint().toString(), {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store'
    });
    if (!response.ok) return 'open';
    return stateFromStatus((await response.json()) as AccessStatus);
  } catch {
    // A gate that cannot be reached must not brick the app: local playback has
    // never needed the server, and the analyze route rejects on its own.
    return 'open';
  }
}

export type SubmitResult = 'accepted' | 'rejected' | 'throttled' | 'error';

export async function submitPin(pin: string, fetchImpl = globalThis.fetch): Promise<SubmitResult> {
  try {
    const response = await fetchImpl(gateEndpoint().toString(), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    if (response.ok) return 'accepted';
    if (response.status === 429) return 'throttled';
    if (response.status === 401) return 'rejected';
    return 'error';
  } catch {
    return 'error';
  }
}
