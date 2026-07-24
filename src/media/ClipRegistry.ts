import { updateMediaTelemetry } from "../qa/telemetry";

export interface RegisteredClip {
  id: string;
  name: string;
  url: string;
  file?: File;
  objectUrlOwned: boolean;
  revision: number;
}

export class ClipRegistry {
  private readonly clips = new Map<string, RegisteredClip>();
  private readonly references = new Map<RegisteredClip, number>();
  private readonly retired = new Set<RegisteredClip>();
  private revision = 0;

  constructor(
    private readonly onTelemetry = (objectUrls: number) =>
      updateMediaTelemetry({
        resources: { objectUrls },
      }),
  ) {}

  registerUrl(id: string, name: string, url: string) {
    this.validate(id, name, url);
    return this.replace({
      id,
      name,
      url,
      objectUrlOwned: false,
      revision: ++this.revision,
    });
  }

  registerFile(id: string, file: File) {
    if (!id.trim()) throw new Error("clip-id-required");
    if (!(file instanceof File)) throw new Error("clip-file-required");
    if (!file.name.trim()) throw new Error("clip-name-required");
    const url = URL.createObjectURL(file);
    try {
      return this.replace({
        id,
        name: file.name,
        url,
        file,
        objectUrlOwned: true,
        revision: ++this.revision,
      });
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  get(id: string) {
    return this.clips.get(id) ?? null;
  }

  list() {
    return [...this.clips.values()];
  }

  retain(clip: RegisteredClip) {
    if (
      this.clips.get(clip.id) !== clip &&
      !this.retired.has(clip)
    ) {
      throw new Error("clip-source-not-registered");
    }
    this.references.set(
      clip,
      (this.references.get(clip) ?? 0) + 1,
    );
  }

  releaseReference(clip: RegisteredClip) {
    const current = this.references.get(clip) ?? 0;
    if (current <= 1) this.references.delete(clip);
    else this.references.set(clip, current - 1);
    if (
      this.retired.has(clip) &&
      !this.references.has(clip)
    ) {
      this.retired.delete(clip);
      this.release(clip);
      this.report();
    }
  }

  remove(id: string) {
    const clip = this.clips.get(id);
    if (!clip) return false;
    this.clips.delete(id);
    this.retire(clip);
    this.report();
    return true;
  }

  dispose() {
    for (const clip of this.clips.values()) this.retire(clip);
    this.clips.clear();
    this.report();
  }

  private replace(clip: RegisteredClip) {
    this.validate(clip.id, clip.name, clip.url);
    const previous = this.clips.get(clip.id);
    const nextOwned = new Set([
      ...[...this.clips.values()].filter(
        (current) => current !== previous,
      ),
      ...this.retired.values(),
      clip,
    ]);
    if (
      previous &&
      (this.references.get(previous) ?? 0) > 0
    ) {
      nextOwned.add(previous);
    }
    this.onTelemetry(
      [...nextOwned].filter((current) => current.objectUrlOwned)
        .length,
    );
    this.clips.set(clip.id, clip);
    if (previous) this.retire(previous);
    return clip;
  }

  private validate(id: string, name: string, url: string) {
    if (!id.trim()) throw new Error("clip-id-required");
    if (!name.trim()) throw new Error("clip-name-required");
    if (!url.trim()) throw new Error("clip-url-required");
  }

  private retire(clip: RegisteredClip) {
    if ((this.references.get(clip) ?? 0) > 0) {
      this.retired.add(clip);
      return;
    }
    this.release(clip);
  }

  private release(clip: RegisteredClip) {
    if (clip.objectUrlOwned) URL.revokeObjectURL(clip.url);
  }

  private report() {
    const owned = new Set([
      ...this.clips.values(),
      ...this.retired.values(),
    ]);
    this.onTelemetry(
      [...owned].filter((clip) => clip.objectUrlOwned).length,
    );
  }
}
