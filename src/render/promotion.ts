import type { ModuleType } from "../App";

export type RendererLane = "promoted" | "legacy";

export const RENDERER_LANE_BY_EFFECT = {
  transition: "legacy",
  speedramp: "legacy",
  tapdelay: "legacy",
  timesampler: "promoted",
  punch: "legacy",
  shake: "legacy",
  orbit: "legacy",
  focus: "legacy",
} as const satisfies Record<ModuleType, RendererLane>;

export const WEBGPU_PROMOTED_EFFECTS = ["timesampler"] as const satisfies
  readonly ModuleType[];

export const LEGACY_EFFECTS = (
  Object.keys(RENDERER_LANE_BY_EFFECT) as ModuleType[]
).filter(
  (effect) => RENDERER_LANE_BY_EFFECT[effect] === "legacy",
);

export function rendererLaneForEffect(effect: ModuleType): RendererLane {
  return RENDERER_LANE_BY_EFFECT[effect];
}

export function previewPolicy(isOnAir: boolean) {
  return isOnAir ? "live" : "poster-only";
}
