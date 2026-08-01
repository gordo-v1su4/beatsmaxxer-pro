import { isTauriRuntime } from '$lib/platform/runtime';
import type { VideoSourcePort } from '$lib/media/VideoSourcePort';
import { htmlVideoSource } from '$lib/media/sources/HtmlVideoSource';
import { tauriNativeSource } from '$lib/media/sources/TauriNativeSource';

let active: VideoSourcePort = htmlVideoSource;

/** Active decode backend for module previews + PGM. */
export function getVideoSourcePort(): VideoSourcePort {
  return active;
}

export async function initVideoSourcePort() {
  if (isTauriRuntime()) {
    await tauriNativeSource.listen();
    active = tauriNativeSource;
  } else {
    active = htmlVideoSource;
  }
  return active;
}

export function setVideoSourcePortForTests(port: VideoSourcePort) {
  active = port;
}
