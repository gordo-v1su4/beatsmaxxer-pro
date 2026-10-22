import { describe, expect, test, vi } from 'vitest';
import { FxUniformWriter, withFxImmediates } from '$lib/rendering/webgpu/FxUniforms';
import { moduleFxWgslForMode } from '$lib/rendering/webgpu/shaders/moduleFx.wgsl';

describe('FX immediate parameter transport', () => {
  test('keeps live audio/timeline updates out of the uniform queue without losing integer bits', () => {
    const writeBuffer = vi.fn();
    const device = { queue: { writeBuffer } } as unknown as GPUDevice;
    const buffer = {} as GPUBuffer;
    const writer = new FxUniformWriter();
    const data = new Float32Array(40);
    const bits = new Uint32Array(data.buffer);
    writer.write(device, buffer, data, true);
    data[0] = 1.5;
    data[36] = .8;
    bits[24] = 0xfedcba98;
    bits[28] = 0x7fffffff; // NaN as an f32: numerical conversion would lose bits.
    expect(writer.write(device, buffer, data, true)).toBe(false);
    expect(writeBuffer).toHaveBeenCalledTimes(1);
    expect(writer.immediateData[6]).toBe(0xfedcba98);
    expect(writer.immediateData[10]).toBe(0x7fffffff);
    expect(new Float32Array(writer.immediateData.buffer)[0]).toBe(1.5);
    expect(new Float32Array(writer.immediateData.buffer)[15]).toBeCloseTo(.8);
    data[8] = .75; // An operator knob must still upload immediately.
    expect(writer.write(device, buffer, data, true)).toBe(true);
    expect(writeBuffer).toHaveBeenCalledTimes(2);
  });

  test('retains unconditional full uploads without immediates and isolates bindings', () => {
    const writeBuffer = vi.fn();
    const device = { queue: { writeBuffer } } as unknown as GPUDevice;
    const data = new Float32Array(40);
    const writer = new FxUniformWriter();
    writer.write(device, {} as GPUBuffer, data, false);
    writer.write(device, {} as GPUBuffer, data, false);
    const other = new FxUniformWriter();
    other.write(device, {} as GPUBuffer, data, true);
    expect(writeBuffer).toHaveBeenCalledTimes(3);
  });

  test('redirects live reads while preserving the uniform ABI and static control reads', () => {
    const source = withFxImmediates(moduleFxWgslForMode(11, 'video'));
    expect(source).toContain('requires immediate_address_space;');
    expect(source).toContain('fixedStepIndex: u32');
    expect(source).toContain('fxLive.beatPhase');
    expect(source).not.toMatch(/\bu\.(beat|beatPhase|highAmp|audioFrameId)\b/);
    expect(source).toContain('u.p0');
    expect(source).toContain('var<uniform> u: Uniforms;');
  });
});
