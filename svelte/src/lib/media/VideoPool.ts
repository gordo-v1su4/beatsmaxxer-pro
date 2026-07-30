/** Shared HTMLVideoElement pool — natural loop playback, hot-swap without stutter. */
class VideoPool {
  private videos = new Map<string, HTMLVideoElement>();
  private urls = new Map<string, string>();
  private pending = new Map<string, Promise<HTMLVideoElement>>();
  private moduleRates = new Map<string, number>();
  private freeRun = new Set<string>();

  private globalRate = 1;

  setGlobalRate(rate: number) {
    this.globalRate = Math.max(0.25, Math.min(4, rate));
  }

  getGlobalRate() {
    return this.globalRate;
  }

  markFreeRun(moduleId: string) {
    this.freeRun.add(moduleId);
  }

  unmarkFreeRun(moduleId: string) {
    this.freeRun.delete(moduleId);
  }

  async attach(moduleId: string, url: string): Promise<HTMLVideoElement> {
    const existing = this.videos.get(moduleId);
    if (existing && this.urls.get(moduleId) === url) {
      return existing;
    }

    const inflight = this.pending.get(moduleId);
    if (inflight) return inflight;

    const loadPromise = this.loadVideo(moduleId, url);
    this.pending.set(moduleId, loadPromise);

    try {
      const video = await loadPromise;
      const old = this.videos.get(moduleId);
      this.videos.set(moduleId, video);
      this.urls.set(moduleId, url);
      if (old && old !== video) {
        requestAnimationFrame(() => this.destroyElement(old));
      }
      return video;
    } finally {
      this.pending.delete(moduleId);
    }
  }

  private async loadVideo(_moduleId: string, url: string): Promise<HTMLVideoElement> {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.preload = 'auto';
    if (!url.startsWith('blob:')) {
      video.crossOrigin = 'anonymous';
    }
    video.style.cssText =
      'position:fixed;left:-9999px;top:0;width:640px;height:360px;opacity:0;pointer-events:none';

    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onErr = () => {
        cleanup();
        reject(new Error(`Video load failed: ${url}`));
      };
      const cleanup = () => {
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('error', onErr);
      };
      video.addEventListener('loadeddata', onReady, { once: true });
      video.addEventListener('canplay', onReady, { once: true });
      video.addEventListener('error', onErr, { once: true });
      document.body.appendChild(video);
      video.load();
    });

    try {
      await video.play();
    } catch {
      /* autoplay gate — still decodes once user hits play */
    }
    return video;
  }

  private destroyElement(video: HTMLVideoElement) {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
  }

  get(moduleId: string): HTMLVideoElement | undefined {
    return this.videos.get(moduleId);
  }

  getDuration(moduleId: string): number {
    const v = this.videos.get(moduleId);
    return v && Number.isFinite(v.duration) ? v.duration : 0;
  }

  hasReadyFrame(moduleId: string): boolean {
    const v = this.videos.get(moduleId);
    return !!v && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && v.videoWidth > 0;
  }

  async prewarm(moduleId: string): Promise<void> {
    const v = this.videos.get(moduleId);
    if (!v) return;
    if (v.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise<void>((resolve) => {
        if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) resolve();
        else v.addEventListener('loadeddata', () => resolve(), { once: true });
      });
    }
    try {
      await v.play();
    } catch {
      /* ignore */
    }
  }

  tick(playing: boolean) {
    for (const [moduleId, video] of this.videos) {
      if (this.freeRun.has(moduleId)) {
        if (video.paused) void video.play().catch(() => {});
        const rate = (this.moduleRates.get(moduleId) ?? 1) * this.globalRate;
        if (Math.abs(video.playbackRate - rate) > 0.01) {
          video.playbackRate = Math.max(0.25, Math.min(4, rate));
        }
        continue;
      }
      if (playing && video.paused) void video.play().catch(() => {});
      else if (!playing && !video.paused) video.pause();
    }
  }

  setModuleRate(moduleId: string, rate: number) {
    this.freeRun.delete(moduleId);
    const clamped = Math.max(0.25, Math.min(4, rate));
    this.moduleRates.set(moduleId, clamped);
    const v = this.videos.get(moduleId);
    if (v) v.playbackRate = clamped;
  }

  seekModule(moduleId: string, seconds: number) {
    this.freeRun.delete(moduleId);
    const v = this.videos.get(moduleId);
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    const target = ((seconds % v.duration) + v.duration) % v.duration;
    if (Math.abs(v.currentTime - target) > 0.02) {
      v.currentTime = target;
    }
  }

  detach(moduleId: string) {
    this.pending.delete(moduleId);
    this.moduleRates.delete(moduleId);
    this.freeRun.delete(moduleId);
    const v = this.videos.get(moduleId);
    if (v) this.destroyElement(v);
    this.videos.delete(moduleId);
    this.urls.delete(moduleId);
  }

  dispose() {
    for (const id of [...this.videos.keys()]) this.detach(id);
  }
}

export const videoPool = new VideoPool();
