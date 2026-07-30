import { TEST_PATTERN_WGSL } from '../shaders';

/** Per-module WGSL fragment variants — test pattern tinted by module accent + param-driven motion. */
export const MODULE_SHADER_WGSL: Record<string, string> = {
  transition: TEST_PATTERN_WGSL,
  speedramp: TEST_PATTERN_WGSL,
  tapdelay: TEST_PATTERN_WGSL,
  timesampler: TEST_PATTERN_WGSL,
  punch: TEST_PATTERN_WGSL,
  shake: TEST_PATTERN_WGSL,
  orbit: TEST_PATTERN_WGSL,
  focus: TEST_PATTERN_WGSL
};

export function getModuleShader(moduleId: string): string {
  return MODULE_SHADER_WGSL[moduleId] ?? TEST_PATTERN_WGSL;
}
