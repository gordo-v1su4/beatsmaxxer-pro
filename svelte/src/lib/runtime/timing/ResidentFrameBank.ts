import { ALL_FORMATS, BlobSource, Input, UrlSource, VideoSampleSink } from 'mediabunny';

export class ResidentCapacityError extends Error {
  constructor(public readonly requiredBytes: number, availableBytes: number) {
    super(`Clip needs ${(requiredBytes / 2 ** 30).toFixed(2)} GiB; ${(availableBytes / 2 ** 30).toFixed(2)} GiB available in the Timing budget. Use a smaller source or raise the budget. No automatic downscale or decoder fallback.`);
    this.name = 'ResidentCapacityError';
  }
}

/** Shared across all Timing slots; never silently evict a playing clip. */
export class ResidentMemoryBudget {
  private allocated = 0;
  constructor(public readonly limit: number) {
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('Invalid GPU memory limit');
  }
  get used() { return this.allocated; }
  get available() { return this.limit - this.allocated; }
  check(bytes: number) {
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid frame-bank size');
    if (bytes > this.available) {
      throw new ResidentCapacityError(bytes, this.available);
    }
  }
  claim(bytes: number) { this.check(bytes); this.allocated += bytes; }
  release(bytes: number) { this.allocated = Math.max(0, this.allocated - bytes); }
}

export interface ResidentFrame {
  texture: GPUTexture;
  view: GPUTextureView;
  pts: number;
  duration: number;
}

/** Timestamp selection, not frame-index / assumed-CFR arithmetic. */
export function residentFrameIndex(frames: ReadonlyArray<{ pts: number }>, seconds: number): number {
  if (!frames.length || !Number.isFinite(seconds)) return -1;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (frames[mid].pts <= seconds + 1e-9) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface BankProgress { frames: number; total: number; bytes: number }

export function residentDimensions(width:number,height:number,maxHeight=0){
  const scale=maxHeight>0?Math.min(1,maxHeight/height):1;
  if(scale===1)return {width,height};
  return {width:Math.max(2,Math.floor(width*scale/2)*2),height:Math.max(2,Math.floor(height*scale/2)*2)};
}

/**
 * Production form of the benchmark's resident texture bank. Decoding and GPU
 * uploads finish before ready is true. Supports imported blobs and URLs, and
 * retains all timestamps in pre-interpolated media (including 96fps inputs).
 */
export class ResidentFrameBank {
  private frames: ResidentFrame[] = [];
  private input: Input | null = null;
  private stopped = false;
  private loading = false;
  private ready = false;
  private bytes = 0;
  private decodedFrames = 0;
  private uploadedFrames = 0;
  private loadMs = 0;
  duration = 0;
  width = 0;
  height = 0;
  fps = 0;

  constructor(private device: GPUDevice, private budget: ResidentMemoryBudget) {}

  get stats() {
    return { ready: this.ready, frames: this.frames.length, bytes: this.bytes,
      width: this.width, height: this.height, fps: this.fps, duration: this.duration,
      decoderDisposed: this.input === null, decodedFrames: this.decodedFrames, uploadedFrames: this.uploadedFrames, loadMs: this.loadMs };
  }

  async load(source: Blob | string, progress: (p: BankProgress) => void = () => {}, maxHeight=0) {
    if (this.loading || this.ready || this.stopped) throw new Error('Frame bank cannot be loaded twice');
    this.loading = true;
    const started = performance.now();
    const input = new Input({ formats: ALL_FORMATS, source: typeof source === 'string' ? new UrlSource(source) : new BlobSource(source) });
    this.input = input;
    this.device.pushErrorScope('out-of-memory');
    let errorScopeOpen = true;
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error('The selected media has no video track');
      const [width, height, duration, packets] = await Promise.all([
        track.getDisplayWidth(), track.getDisplayHeight(), track.computeDuration(), track.computePacketStats()
      ]);
      if (this.stopped) throw new Error('Frame-bank loading cancelled');
      if (!Number.isFinite(duration) || duration <= 0 || packets.packetCount <= 0) throw new Error('Video has no finite frames');
      if (Math.max(width, height) > this.device.limits.maxTextureDimension2D) throw new Error('Video dimensions exceed the GPU texture limit');
      const size=residentDimensions(width,height,maxHeight);
      this.budget.check(size.width * size.height * 4 * packets.packetCount);
      this.width = size.width; this.height = size.height; this.fps = packets.averagePacketRate;
      const canvas=size.width!==width||size.height!==height?new OffscreenCanvas(size.width,size.height):null;
      const context=canvas?.getContext('2d');
      if(canvas&&!context)throw new Error('This browser cannot prepare the selected frame resolution');
      progress({ frames: 0, total: packets.packetCount, bytes: 0 });
      const sink = new VideoSampleSink(track);
      for await (const sample of sink.samples()) {
        this.decodedFrames++;
        try {
          if (this.stopped) throw new Error('Frame-bank loading cancelled');
          const frame = sample.toVideoFrame();
          try {
            const bytes = size.width * size.height * 4;
            this.budget.claim(bytes);
            this.bytes += bytes;
            const texture = this.device.createTexture({
              size: [size.width, size.height], format: 'rgba8unorm',
              usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
            });
            // Own the allocation before any later operation can throw.
            const resident = { texture, view: null as unknown as GPUTextureView, pts: sample.timestamp,
              duration: sample.duration > 0 ? sample.duration : 1 / Math.max(1, this.fps) };
            this.frames.push(resident);
            resident.view = texture.createView();
            if(canvas&&context)context.drawImage(frame,0,0,size.width,size.height);
            this.device.queue.copyExternalImageToTexture({ source: canvas??frame }, { texture }, [size.width, size.height]);
            this.uploadedFrames++;
          } finally { frame.close(); }
          if (this.frames.length % 16 === 0) {
            await this.device.queue.onSubmittedWorkDone();
            progress({ frames: this.frames.length, total: packets.packetCount, bytes: this.bytes });
          }
        } finally { sample.close(); }
      }
      await this.device.queue.onSubmittedWorkDone();
      errorScopeOpen = false;
      const gpuError = await this.device.popErrorScope();
      if (gpuError) throw new Error(`GPU could not hold this clip: ${gpuError.message}`);
      if (this.stopped) throw new Error('Frame-bank loading cancelled');
      if (!this.frames.length) throw new Error('No decodable video frames');
      this.frames.sort((a, b) => a.pts - b.pts);
      const last = this.frames[this.frames.length - 1];
      this.duration = Math.max(duration, last.pts + last.duration) - this.frames[0].pts;
      this.ready = true;
      progress({ frames: this.frames.length, total: this.frames.length, bytes: this.bytes });
    } catch (error) {
      this.releaseFrames();
      throw error;
    } finally {
      if (errorScopeOpen) await this.device.popErrorScope().catch(() => null);
      input.dispose();
      this.input = null;
      this.loading = false;
      this.loadMs = performance.now()-started;
    }
  }

  frameAt(seconds: number): ResidentFrame | null {
    if (!this.ready || this.stopped || !Number.isFinite(seconds)) return null;
    const remainder = seconds % this.duration;
    const wrapped = (remainder < 0 ? remainder + this.duration : remainder) + this.frames[0].pts;
    return this.frames[residentFrameIndex(this.frames, wrapped)] ?? null;
  }

  private releaseFrames() {
    this.ready = false;
    for (const frame of this.frames) frame.texture.destroy();
    this.frames = [];
    this.budget.release(this.bytes);
    this.bytes = 0;
  }

  dispose() {
    this.stopped = true;
    this.input?.dispose();
    this.releaseFrames();
  }
}
