import { updateMediaTelemetry } from "../qa/telemetry";

export interface RegisteredClip {
  id: string;
  name: string;
  url: string;
  file?: File;
  objectUrlOwned: boolean;
}

export class ClipRegistry {
  private readonly clips = new Map<string, RegisteredClip>();

  registerUrl(id: string, name: string, url: string) {
    return this.replace({
      id,
      name,
      url,
      objectUrlOwned: false,
    });
  }

  registerFile(id: string, file: File) {
    return this.replace({
      id,
      name: file.name,
      url: URL.createObjectURL(file),
      file,
      objectUrlOwned: true,
    });
  }

  get(id: string) {
    return this.clips.get(id) ?? null;
  }

  list() {
    return [...this.clips.values()];
  }

  remove(id: string) {
    const clip = this.clips.get(id);
    if (!clip) return false;
    this.clips.delete(id);
    this.release(clip);
    this.report();
    return true;
  }

  dispose() {
    for (const clip of this.clips.values()) this.release(clip);
    this.clips.clear();
    this.report();
  }

  private replace(clip: RegisteredClip) {
    if (!clip.id) throw new Error("clip-id-required");
    if (!clip.url) throw new Error("clip-url-required");
    const previous = this.clips.get(clip.id);
    if (previous) this.release(previous);
    this.clips.set(clip.id, clip);
    this.report();
    return clip;
  }

  private release(clip: RegisteredClip) {
    if (clip.objectUrlOwned) URL.revokeObjectURL(clip.url);
  }

  private report() {
    updateMediaTelemetry({
      resources: {
        objectUrls: [...this.clips.values()].filter(
          (clip) => clip.objectUrlOwned,
        ).length,
      },
    });
  }
}
