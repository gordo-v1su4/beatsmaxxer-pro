import { MODULE_FX_WGSL } from './moduleFx.wgsl';

export const MODULE_SHADER_WGSL: Record<string, string> = {
  transition: MODULE_FX_WGSL,
  speedramp: MODULE_FX_WGSL,
  tapdelay: MODULE_FX_WGSL,
  timesampler: MODULE_FX_WGSL,
  punch: MODULE_FX_WGSL,
  shake: MODULE_FX_WGSL,
  orbit: MODULE_FX_WGSL,
  focus: MODULE_FX_WGSL,
  anamorphic: MODULE_FX_WGSL,
  grain: MODULE_FX_WGSL,
  leak: MODULE_FX_WGSL,
  dutch: MODULE_FX_WGSL,
  halation: MODULE_FX_WGSL,
  bulge: MODULE_FX_WGSL,
  vhs: MODULE_FX_WGSL,
  prism: MODULE_FX_WGSL,
  streak: MODULE_FX_WGSL,
  mirror: MODULE_FX_WGSL,
  lens: MODULE_FX_WGSL
};

export function getModuleShader(moduleId: string): string {
  return MODULE_SHADER_WGSL[moduleId] ?? MODULE_FX_WGSL;
}
