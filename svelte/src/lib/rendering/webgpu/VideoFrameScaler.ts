/** Downscale decoded frames directly into an atlas with WebGPU. */
export interface VideoFrameScaler {
  copy(frame: VideoFrame, target: GPUTexture, origin: [number, number, number], width: number, height: number): void;
}

const scalers = new WeakMap<GPUDevice, Promise<VideoFrameScaler>>();
const shader = /* wgsl */`
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@group(0) @binding(0) var frameSampler: sampler;
@group(0) @binding(1) var frameTexture: texture_external;
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
  let positions = array(vec2f(-1, 1), vec2f(-1, -3), vec2f(3, 1));
  let uvs = array(vec2f(0, 0), vec2f(0, 2), vec2f(2, 0));
  return Vertex(vec4f(positions[i], 0, 1), uvs[i]);
}
@fragment fn fragment(v: Vertex) -> @location(0) vec4f {
  return textureSampleBaseClampToEdge(frameTexture, frameSampler, v.uv);
}`;

export function getVideoFrameScaler(device: GPUDevice): Promise<VideoFrameScaler> {
  const existing = scalers.get(device);
  if (existing) return existing;
  const pending = createScaler(device);
  scalers.set(device, pending);
  void pending.catch(() => { if (scalers.get(device) === pending) scalers.delete(device); });
  return pending;
}

async function createScaler(device: GPUDevice): Promise<VideoFrameScaler> {
  const layout = device.createBindGroupLayout({ entries:[
    {binding:0,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}},
    {binding:1,visibility:GPUShaderStage.FRAGMENT,externalTexture:{}}
  ] });
  const module = device.createShaderModule({code:shader});
  const pipeline = await device.createRenderPipelineAsync({
    layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),
    vertex:{module,entryPoint:'vertex'},
    fragment:{module,entryPoint:'fragment',targets:[{format:'rgba8unorm'}]},
    primitive:{topology:'triangle-list'}
  });
  const sampler = device.createSampler({minFilter:'linear',magFilter:'linear'});
  const views = new WeakMap<GPUTexture, GPUTextureView>();
  return {
    copy(frame,target,origin,width,height) {
      let view = views.get(target);
      if (!view) { view = target.createView(); views.set(target,view); }
      const external = device.importExternalTexture({source:frame});
      const group = device.createBindGroup({layout,entries:[
        {binding:0,resource:sampler},{binding:1,resource:external}
      ]});
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({colorAttachments:[{view,loadOp:'load',storeOp:'store'}]});
      pass.setPipeline(pipeline); pass.setBindGroup(0,group);
      pass.setViewport(origin[0],origin[1],width,height,0,1);
      pass.setScissorRect(origin[0],origin[1],width,height);
      pass.draw(3); pass.end();
      device.queue.submit([encoder.finish()]);
    }
  };
}
