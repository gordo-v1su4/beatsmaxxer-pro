import { hostedDemoFetch } from '$lib/platform/hostedApi';
import { parsePublishedDemoManifest, type DemoManifest } from './demoManifest';

let pending: Promise<DemoManifest> | null = null;
const retryDelays = [300, 900];

async function requestCatalog(): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await hostedDemoFetch('/demo-media/manifest.json');
      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        await response.body?.cancel().catch(() => {});
        throw Object.assign(new Error(`Demo catalog request failed (HTTP ${response.status}).`), { retryable });
      }
      // A successful header response can still fail while downloading its body.
      return await response.text();
    } catch (error) {
      const permanent = typeof error === 'object' && error !== null && 'retryable' in error && error.retryable === false;
      if (permanent || attempt === retryDelays.length) throw error;
      await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
    }
  }
}

/** Share the availability check between the menu and workflow loader. */
export function loadDemoCatalog(): Promise<DemoManifest> {
  if (pending) return pending;
  pending = (async () => {
    const body = await requestCatalog().catch(cause => {
      throw new Error('Demo files are unavailable. Check your connection or desktop media settings, then retry.', { cause });
    });
    let document: unknown;
    try { document = JSON.parse(body); }
    catch (cause) { throw new Error('Demo files could not be read. Try again shortly.', { cause }); }
    // Complete but malformed/stale manifests are permanent and never retried.
    return parsePublishedDemoManifest(document);
  })().finally(() => { pending = null; });
  return pending;
}
