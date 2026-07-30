const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|ogv)$/i;

/** macOS file picker often leaves `type` empty for MP4/MOV — match extension too. */
export function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  return VIDEO_EXT.test(file.name);
}
