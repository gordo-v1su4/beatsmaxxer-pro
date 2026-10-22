import { hostedDemoFetch } from '$lib/platform/hostedApi';
import { parsePublishedDemoManifest, type DemoManifest } from './demoManifest';

let pending: Promise<DemoManifest> | null = null;
const retryDelays = [300, 900];

async function requestCatalog(): Promise<Response> {
  for (let attempt=0; ; attempt++) {
    let response:Response;
    try {
      response = await hostedDemoFetch('/demo-media/manifest.json');
    } catch (error) {
      if (attempt === retryDelays.length) throw error instanceof Error ? error : new Error(String(error));
      await new Promise(resolve => setTimeout(resolve,retryDelays[attempt]));
      continue;
    }
    if (response.ok) return response;
    const error = new Error(`Demo catalog request failed (HTTP ${response.status}).`);
    if (attempt === retryDelays.length || !(response.status === 408 || response.status === 429 || response.status >= 500)) throw error;
    await new Promise(resolve => setTimeout(resolve,retryDelays[attempt]));
  }
}

/** Share the availability check between the menu and workflow loader. */
export function loadDemoCatalog(): Promise<DemoManifest> {
  if (pending) return pending;
  pending = (async () => {
    const response = await requestCatalog();
    return parsePublishedDemoManifest(await response.json());
  })().finally(() => { pending = null; });
  return pending;
}
