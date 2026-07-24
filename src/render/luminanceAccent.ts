export type Rgb = readonly [number, number, number];

export const LUMINANCE_ACCENT_DURATION_MS = 240;
export const LUMINANCE_ACCENT_PEAK_LIFT = 0.16;
export const LUMINANCE_ACCENT_CHANNEL_CEILING = 0.999;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function luminanceAccentEnvelope(elapsedMs: number) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  if (elapsedMs >= LUMINANCE_ACCENT_DURATION_MS) return 0;

  const remaining = 1 - elapsedMs / LUMINANCE_ACCENT_DURATION_MS;
  return remaining * remaining * remaining;
}

export function applyLuminanceAccent(
  rgb: Rgb,
  envelope: number,
): [number, number, number] {
  const input: [number, number, number] = [
    clamp01(rgb[0]),
    clamp01(rgb[1]),
    clamp01(rgb[2]),
  ];
  const amount = clamp01(envelope);
  if (amount === 0) return input;

  const targetScale = 1 + amount * LUMINANCE_ACCENT_PEAK_LIFT;
  const maxChannel = Math.max(...input);
  const safeScale =
    maxChannel > 0
      ? Math.min(
          targetScale,
          LUMINANCE_ACCENT_CHANNEL_CEILING / maxChannel,
        )
      : 1;

  return [
    input[0] * safeScale,
    input[1] * safeScale,
    input[2] * safeScale,
  ];
}

export function relativeLuminance(rgb: Rgb) {
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

export function rgbToHsv(rgb: Rgb) {
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  const delta = max - min;
  let hue = 0;

  if (delta > 0) {
    if (max === rgb[0]) {
      hue = 60 * (((rgb[1] - rgb[2]) / delta) % 6);
    } else if (max === rgb[1]) {
      hue = 60 * ((rgb[2] - rgb[0]) / delta + 2);
    } else {
      hue = 60 * ((rgb[0] - rgb[1]) / delta + 4);
    }
  }

  if (hue < 0) hue += 360;
  return {
    hue,
    saturation: max === 0 ? 0 : delta / max,
    value: max,
  };
}
