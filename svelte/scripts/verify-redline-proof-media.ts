import {
  REDLINE_AUDIO_SOURCE_PATH,
  REDLINE_MIDI_SOURCE_PATHS,
  REDLINE_VIDEO_SOURCE_PATHS
} from '../src/lib/qa/redlineProofMedia.ts';

const required = [REDLINE_AUDIO_SOURCE_PATH, ...REDLINE_VIDEO_SOURCE_PATHS, ...REDLINE_MIDI_SOURCE_PATHS];
const missing: string[] = [];
for (const path of required) {
  if (!(await Bun.file(path).exists())) missing.push(path);
}
if (missing.length > 0) {
  throw new Error(`Authoritative Redline proof media is missing:\n${missing.join('\n')}`);
}
console.log(`[proof-media] authoritative manifest resolved ${REDLINE_VIDEO_SOURCE_PATHS.length} videos, 1 master, and ${REDLINE_MIDI_SOURCE_PATHS.length} MIDI stems`);
