import type { ModuleType } from "../App";

export type RendererLane = "promoted" | "legacy";

export const RENDERER_LANE_BY_EFFECT = {
  transition: "promoted",
  speedramp: "promoted",
  tapdelay: "promoted",
  timesampler: "promoted",
  punch: "promoted",
  shake: "promoted",
  orbit: "promoted",
  focus: "promoted",
} as const satisfies Record<ModuleType, RendererLane>;

export const WEBGPU_PROMOTED_EFFECTS = [
  "transition",
  "speedramp",
  "tapdelay",
  "timesampler",
  "punch",
  "shake",
  "orbit",
  "focus",
] as const satisfies readonly ModuleType[];

export const LEGACY_EFFECTS = (
  Object.entries(RENDERER_LANE_BY_EFFECT) as Array<
    [ModuleType, RendererLane]
  >
)
  .filter(([, lane]) => lane === "legacy")
  .map(([effect]) => effect);

export function rendererLaneForEffect(effect: ModuleType): RendererLane {
  return RENDERER_LANE_BY_EFFECT[effect];
}

export function previewPolicy(isOnAir: boolean) {
  return isOnAir ? "live" : "poster-only";
}
