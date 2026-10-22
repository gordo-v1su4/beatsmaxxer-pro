import { FX_IMMEDIATE_BYTES } from './FxUniforms';

export interface FxCapabilities {
  immediates: boolean;
  sharedTextures: boolean;
}

/** Probe the actual binding operation: this change has no named optional feature.
 * A browser version check would get embedded webviews and other vendors wrong. */
export async function probeSharedTextureBinding(device: GPUDevice): Promise<boolean> {
  device.pushErrorScope('validation');
  let texture: GPUTexture | undefined;
  let accepted = true;
  try {
    texture = device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING });
    const layout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, externalTexture: {} }
    ] });
    device.createBindGroup({ layout, entries: [{ binding: 0, resource: texture.createView() }] });
  } catch {
    accepted = false;
  } finally {
    texture?.destroy();
  }
  return (await device.popErrorScope()) === null && accepted;
}

export async function detectFxCapabilities(device: GPUDevice): Promise<FxCapabilities> {
  const query = new URLSearchParams(globalThis.location?.search ?? '');
  // QA-only switches let one browser compare baseline, each change and both.
  const qa = query.get('qa') === '1';
  const immediates = !(qa && query.get('fxImmediates') === '0') &&
    !!navigator.gpu?.wgslLanguageFeatures?.has('immediate_address_space') &&
    device.limits.maxImmediateSize >= FX_IMMEDIATE_BYTES &&
    typeof globalThis.GPURenderPassEncoder?.prototype.setImmediates === 'function';
  const sharedTextures = !(qa && query.get('fxSharedTextures') === '0') &&
    await probeSharedTextureBinding(device);
  return { immediates, sharedTextures };
}
