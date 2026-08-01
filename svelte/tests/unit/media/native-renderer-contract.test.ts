import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const scopedContractFiles = [
  'src/lib/media/PlaybackCoordinator.ts',
  'src/lib/media/types.ts',
  'src/lib/media/capabilities.ts',
  'src/lib/runtime/decks/hotDeck.ts'
];

function readContractSources(): string {
  return scopedContractFiles
    .map((path) => readFileSync(join(process.cwd(), path), 'utf8'))
    .join('\n');
}

describe('native renderer contracts', () => {
  test('do not advertise dormant WebGL backends or renderer fallback selection', () => {
    const sources = readContractSources();

    expect(sources).not.toMatch(/webgl/i);
    expect(sources).not.toContain('selectPlaybackFallback');
    expect(sources).not.toContain('MediaFallback');
    expect(sources).not.toContain('RendererBackend');
    expect(sources).not.toContain('rendererBackend');
  });

  test('keeps the live renderer contract on WebGPU external-video textures', () => {
    const shader = readFileSync(
      join(process.cwd(), 'src/lib/rendering/webgpu/shaders/moduleFx.wgsl.ts'),
      'utf8'
    );
    const engine = readFileSync(
      join(process.cwd(), 'src/lib/rendering/webgpu/WebGpuEngine.ts'),
      'utf8'
    );

    expect(shader).toContain('texture_external');
    expect(engine).toContain('importExternalTexture');
  });
});
