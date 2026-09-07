/** Matches api/analyze/policy.ts ANALYSIS_MAX_REQUEST_BYTES. */
export const STUDIO_UPLOAD_MAX_BYTES = 12_000_000;

export function isStudioMp3File(file: File): boolean {
  const name = file.name.trim().toLowerCase();
  if (name.endsWith(".mp3")) return true;
  const type = file.type.trim().toLowerCase();
  return type === "audio/mpeg" || type === "audio/mp3";
}

/**
 * Hosted Studio analysis expects the original MP3 — no re-encode or downsample.
 * WAV and other formats are rejected until the proxy supports them.
 */
export function prepareStudioUpload(file: File): File {
  if (!isStudioMp3File(file)) {
    throw new Error("Hosted analysis supports MP3 uploads only for now.");
  }
  if (file.size > STUDIO_UPLOAD_MAX_BYTES) {
    const limitMiB = Math.round(STUDIO_UPLOAD_MAX_BYTES / 1_048_576);
    throw new Error(`MP3 exceeds the ${limitMiB} MiB hosted analysis limit.`);
  }
  if (file.size <= 0) {
    throw new Error("MP3 file is empty.");
  }
  return file;
}
