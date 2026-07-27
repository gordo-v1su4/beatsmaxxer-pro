import { Mp4DemuxBoundary } from "./mp4";
import { MediabunnyMp4Adapter } from "./mediabunny";

export function createMp4DemuxBoundary() {
  return new Mp4DemuxBoundary(new MediabunnyMp4Adapter());
}

export { MediabunnyMp4Adapter } from "./mediabunny";
export * from "./mp4";
