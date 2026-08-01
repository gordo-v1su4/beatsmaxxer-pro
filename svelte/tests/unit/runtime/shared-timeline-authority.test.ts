import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const source = (path: string) => readFileSync(resolve('src/lib', path), 'utf8');

describe('shared timeline authority', () => {
  test('keeps requestAnimationFrame ownership in AppLoop', () => {
    expect(source('runtime/AppLoop.ts')).toContain('requestAnimationFrame');
    for (const file of [
      'audio/AudioEngine.ts',
      'media/VideoPool.ts',
      'rendering/webgpu/WebGpuEngine.ts',
      'stores/transportDisplay.ts'
    ]) {
      expect(source(file), file).not.toMatch(/\brequestAnimationFrame\s*\(/);
    }
  });

  test('clears the renderer timeline subscription on stop and before restart', () => {
    const appLoop = source('runtime/AppLoop.ts');
    const restartCleanup = appLoop.indexOf('unsubscribeTimeline?.();');
    const subscribe = appLoop.indexOf('unsubscribeTimeline = audioTimeline.subscribe');
    const stop = appLoop.indexOf('export function stopAppLoop()');
    const stopCleanup = appLoop.indexOf('unsubscribeTimeline?.();', stop);

    expect(restartCleanup).toBeGreaterThan(-1);
    expect(restartCleanup).toBeLessThan(subscribe);
    expect(stopCleanup).toBeGreaterThan(stop);
    expect(appLoop).not.toContain('setFrameCallback');
    expect(source('rendering/webgpu/WebGpuEngine.ts')).not.toContain('setFrameCallback');
  });

  test('keeps AudioContext currentTime semantic reads inside AudioTimeline', () => {
    expect(source('transport/AudioTimeline.ts')).toContain('.currentTime');
    expect(source('audio/AudioEngine.ts')).not.toMatch(/ctx(?:\?|)\.currentTime/);
    expect(source('rendering/webgpu/WebGpuEngine.ts')).not.toContain('performance.now');
  });

  test('routes uploaded playback anchoring and tempo resets through AudioTimeline', () => {
    const audioEngine = source('audio/AudioEngine.ts');
    expect(audioEngine).toContain('audioTimeline.play(this.mediaElement.currentTime)');
    expect(audioEngine).not.toMatch(/this\._tempo\s*=\s*1;/);
    expect(audioEngine).toContain('this.applyTempoRate(1)');
  });
});
