import { describe, expect, test } from 'vitest';
import {
  DESKTOP_PREVIEW_TARGET_FPS,
  previewTargetFps,
  WEB_PREVIEW_TARGET_FPS
} from '$lib/platform/desktopPerformance';

describe('desktop preview performance budget', () => {
  test('uses the display-rate preview target in Tauri', () => {
    expect(previewTargetFps('tauri')).toBe(DESKTOP_PREVIEW_TARGET_FPS);
    expect(DESKTOP_PREVIEW_TARGET_FPS).toBe(60);
  });

  test('preserves the web preview budget', () => {
    expect(previewTargetFps('web')).toBe(WEB_PREVIEW_TARGET_FPS);
    expect(WEB_PREVIEW_TARGET_FPS).toBe(30);
  });
});
