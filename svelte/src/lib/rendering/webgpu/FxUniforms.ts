/** The existing 40-word uniform ABI stays intact for older browsers and splash. */
export const FX_UNIFORM_BYTES = 160;

// Exactly 64 bytes, the portable immediate range. Preserve integer bit patterns
// from writeTimelineUniformData: converting the u32 words to numbers corrupts them.
export const FX_IMMEDIATE_FIELDS = [
  ['beat', 0, 'f32'], ['beatPhase', 1, 'f32'],
  ['amplitude', 4, 'f32'], ['bassAmp', 5, 'f32'],
  ['positionSeconds', 22, 'f32'], ['fixedStepSeconds', 23, 'f32'],
  ['fixedStepIndex', 24, 'u32'], ['fixedStepPhase', 25, 'f32'],
  ['playbackRate', 26, 'f32'], ['generation', 27, 'u32'],
  ['deterministicSeed', 28, 'u32'], ['audioFrameId', 29, 'u32'],
  ['triggerAge', 30, 'f32'], ['onsetAmp', 34, 'f32'],
  ['bassNorm', 35, 'f32'], ['highAmp', 36, 'f32']
] as const;
export const FX_IMMEDIATE_BYTES = FX_IMMEDIATE_FIELDS.length * 4;
const immediateWords = new Set<number>(FX_IMMEDIATE_FIELDS.map(([, word]) => word));

export function withFxImmediates(source: string): string {
  for (const [name] of FX_IMMEDIATE_FIELDS) {
    source = source.replaceAll(new RegExp(`\\bu\\.${name}\\b`, 'g'), `fxLive.${name}`);
  }
  return `requires immediate_address_space;\nstruct FxLiveUniforms {\n${FX_IMMEDIATE_FIELDS
    .map(([name, , type]) => `  ${name}: ${type},`).join('\n')}\n}\nvar<immediate> fxLive: FxLiveUniforms;\n${source}`;
}

/** One instance per binding, so two draws never share mutable uniform storage. */
export class FxUniformWriter {
  private previous: Uint32Array | null = null;
  readonly immediateData = new Uint32Array(FX_IMMEDIATE_FIELDS.length);

  write(device: GPUDevice, buffer: GPUBuffer, data: Float32Array, immediates: boolean): boolean {
    if (!immediates) {
      device.queue.writeBuffer(buffer, 0, data);
      return true;
    }
    const words = new Uint32Array(data.buffer, data.byteOffset, data.length);
    FX_IMMEDIATE_FIELDS.forEach(([, word], index) => { this.immediateData[index] = words[word]; });
    const changed = !this.previous || words.some((word, index) =>
      !immediateWords.has(index) && word !== this.previous![index]);
    if (changed) {
      device.queue.writeBuffer(buffer, 0, data);
      this.previous = words.slice();
    }
    return changed;
  }
}
