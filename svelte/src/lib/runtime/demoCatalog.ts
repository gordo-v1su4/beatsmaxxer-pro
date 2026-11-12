import { hostedDemoFetch, isPermanentDemoFailure, isRetryableDemoStatus } from '$lib/platform/hostedApi';
import { parsePublishedDemoManifest, type DemoManifest } from './demoManifest';

let pending: Promise<DemoManifest> | null = null;
const retryDelays = [300, 900];
// Keep the manifest route/budget aligned with hosted_api.rs's demo constants.
const manifestPath = '/demo-media/manifest.json';
const attemptTimeoutMs = 8_000;

async function downloadCatalog(): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Demo catalog download timed out.')), attemptTimeoutMs);
  try {
    const response = await hostedDemoFetch(manifestPath, controller.signal);
    if (!response.ok) {
      const retryable = isRetryableDemoStatus(response.status);
      void response.body?.cancel().catch(() => {});
      throw Object.assign(new Error(`Demo catalog request failed (HTTP ${response.status}).`), { retryable });
    }
    return await response.text();
  } finally { clearTimeout(timer); }
}

async function requestCatalog(): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      // A successful header response can still fail while downloading its body.
      return await downloadCatalog();
    } catch (error) {
      const permanent = isPermanentDemoFailure(error);
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
    let parsed: unknown;
    try { parsed = JSON.parse(body); }
    catch (cause) { throw new Error('Demo files could not be read. Try again shortly.', { cause }); }
    // Complete but malformed/stale manifests are permanent and never retried.
    try { return parsePublishedDemoManifest(parsed); }
    catch (cause) {
      throw Object.assign(new Error('Demo files do not match this version of the app. Please try again later.', { cause }), { retryable: false });
    }
  })().finally(() => { pending = null; });
  return pending;
}
