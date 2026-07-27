import type { RegisteredClip } from "./ClipRegistry";
import { probeDirectPlayback } from "./capabilities";
import { createMp4DemuxBoundary } from "./demux";
import {
  createBrowserPlaybackEnvironment,
  probeBrowserSampleFrame,
} from "./browserDecode";

export async function probeClipDirectPlayback(clip: RegisteredClip) {
  const demux = createMp4DemuxBoundary();
  const response = await fetch(clip.url);
  if (!response.ok) {
    throw new Error(`clip-fetch-failed:${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  const asset = await demux.demux(clip.id, bytes);
  const environment = createBrowserPlaybackEnvironment();
  environment.sampleFrameProbe = probeBrowserSampleFrame;
  return probeDirectPlayback(
    asset.metadata,
    asset.decoderConfig,
    environment,
  );
}
