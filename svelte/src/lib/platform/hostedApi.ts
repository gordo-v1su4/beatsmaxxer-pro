import { isTauriRuntime } from './runtime';
import { tauriInvoke } from './tauriInvoke';

/** Metadata preserved across native IPC; legacy binaries may omit it. */
export interface DemoFailure { retryable: boolean; status?: number }
export function isPermanentDemoFailure(error: unknown): error is DemoFailure {
  return typeof error === 'object' && error !== null && 'retryable' in error && error.retryable === false;
}
/** Keep this status policy aligned with DemoRequestError::http in hosted_api.rs. */
export function isRetryableDemoStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function raceWithAbort<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => { signal?.removeEventListener('abort', abort); reject(signal?.reason); };
    signal?.addEventListener('abort', abort, { once: true });
    pending.then(value => {
      signal?.removeEventListener('abort', abort); resolve(value);
    }, error => {
      signal?.removeEventListener('abort', abort); reject(error);
    });
    // Native invocation may synchronously abort before the listener is attached.
    if (signal?.aborted) abort();
  });
}

/** Public, content-addressed demo assets also live on the hosted application. */
export async function hostedDemoFetch(path: string, signal?: AbortSignal): Promise<Response> {
  signal?.throwIfAborted();
  if (!isTauriRuntime()) return signal ? globalThis.fetch(path, { signal }) : globalThis.fetch(path);
  try {
    const pending = tauriInvoke<ArrayBuffer>('hosted_demo_request', { path });
    const bytes = await raceWithAbort(pending, signal);
    signal?.throwIfAborted();
    return new Response(bytes);
  } catch (cause) {
    signal?.throwIfAborted();
    // New native binaries classify errors; old binaries only reject with text.
    const detail = typeof cause === 'object' && cause !== null ? cause as Record<string, unknown> : {};
    let message = 'Desktop demo files are unavailable.';
    if (typeof cause === 'string') message = cause;
    else if (typeof detail.message === 'string') message = detail.message;
    throw Object.assign(new Error(message, { cause }), {
      ...(typeof detail.retryable === 'boolean' ? { retryable: detail.retryable } : {}),
      ...(typeof detail.status === 'number' ? { status: detail.status } : {})
    });
  }
}

/** Browser requests stay same-origin; bundled desktop assets use the native session. */
export async function hostedApiFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  if (!isTauriRuntime()) return globalThis.fetch(input, init);
  const url = new URL(input, window.location.href);
  const request = new Request(url, init);
  request.signal.throwIfAborted();
  const body = request.body ? Array.from(new Uint8Array(await request.arrayBuffer())) : [];
  request.signal.throwIfAborted();
  const pending = tauriInvoke<{ status: number; body: string }>('hosted_api_request', {
    path: url.pathname + url.search,
    method: request.method,
    contentType: request.headers.get('content-type'),
    body
  });
  // Rust bounds the underlying connection; cancellation immediately releases the UI.
  const result = await raceWithAbort(pending, request.signal);
  request.signal.throwIfAborted();
  return new Response(result.body, { status: result.status, headers: { 'Content-Type': 'application/json' } });
}
