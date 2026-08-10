import type { VideoSourcePort } from '$lib/media/VideoSourcePort';
import { htmlVideoSource } from '$lib/media/sources/HtmlVideoSource';

let active: VideoSourcePort = htmlVideoSource;

/** Active decode backend for module previews + PGM. */
export function getVideoSourcePort(): VideoSourcePort {
  return active;
}

export async function initVideoSourcePort() {
  active = htmlVideoSource;
  return active;
}

export function setVideoSourcePortForTests(port: VideoSourcePort) {
  active = port;
}
