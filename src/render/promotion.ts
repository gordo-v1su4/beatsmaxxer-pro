export const WEBGPU_PROMOTED_EFFECTS = [
  "source",
  "timesampler",
] as const;

export const LEGACY_EFFECTS = [
  "transition",
  "videoecho",
  "generative",
  "arpeggiator",
  "tapdelay",
  "speedramp",
  "color",
] as const;

export function rendererLaneForEffect(effect: string) {
  return effect === "timesampler" || effect === "source"
    ? "promoted"
    : "legacy";
}

export function previewPolicy(isOnAir: boolean) {
  return isOnAir ? "live" : "poster-only";
}
