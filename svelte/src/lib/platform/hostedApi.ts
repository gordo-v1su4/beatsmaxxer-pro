import { isTauriRuntime } from './runtime';
import { tauriInvoke } from './tauriInvoke';

/** Public, content-addressed demo assets also live on the hosted application. */
export async function hostedDemoFetch(path: string): Promise<Response> {
  if (!isTauriRuntime()) return globalThis.fetch(path);
  const bytes = await tauriInvoke<ArrayBuffer>('hosted_demo_request', { path });
  return new Response(bytes);
}

/** Browser requests stay same-origin; bundled desktop assets use the native session. */
export async function hostedApiFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  if (!isTauriRuntime()) return globalThis.fetch(input, init);
  const url = new URL(input, window.location.href);
  const request = new Request(url, init);
  request.signal.throwIfAborted();
  const body = request.body ? Array.from(new Uint8Array(await request.arrayBuffer())) : [];
  const pending = tauriInvoke<{ status: number; body: string }>('hosted_api_request', {
    path: url.pathname + url.search,
    method: request.method,
    contentType: request.headers.get('content-type'),
    body
  });
  // Rust bounds the underlying connection; cancellation immediately releases the UI.
  const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const abort = () => reject(request.signal.reason);
    request.signal.addEventListener('abort', abort, { once: true });
    pending.then(value => {
      request.signal.removeEventListener('abort', abort); resolve(value);
    }, error => {
      request.signal.removeEventListener('abort', abort); reject(error);
    });
  });
  request.signal.throwIfAborted();
  return new Response(result.body, { status: result.status, headers: { 'Content-Type': 'application/json' } });
}
