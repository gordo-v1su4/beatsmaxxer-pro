import { describe, expect, test } from 'vitest';
import { captureScene, sameClip, sceneChanges } from '$lib/arrangement/sectionScenes';

const chorusFile = new File(['c'], 'chorus.mp4');
const verseFile = new File(['v'], 'verse.mp4');

describe('section scenes', () => {
  test('capture records every slot, empty ones as null', () => {
    const scene = captureScene({ 'top-0': { name: 'chorus.mp4', url: 'blob:1', file: chorusFile } });
    expect(scene.slots['top-0']).toEqual({ name: 'chorus.mp4', url: 'blob:1', file: chorusFile });
    expect(scene.slots['bottom-4']).toBeNull();
  });

  test('a file is the same clip under a fresh blob URL', () => {
    expect(sameClip({ name: 'chorus.mp4', url: 'blob:2', file: chorusFile }, { name: 'chorus.mp4', url: 'blob:1', file: chorusFile })).toBe(true);
    expect(sameClip({ name: 'a', url: '/qa/a.webm' }, { name: 'a', url: '/qa/a.webm' })).toBe(true);
  });

  test('recall only touches slots that differ, and never blanks a slot', () => {
    const scene = captureScene({
      'top-0': { name: 'chorus.mp4', url: 'blob:1', file: chorusFile },
      'top-1': { name: 'chorus.mp4', url: 'blob:1', file: chorusFile },
    });
    const live = {
      'top-0': { name: 'chorus.mp4', url: 'blob:9', file: chorusFile },
      'top-1': { name: 'verse.mp4', url: 'blob:3', file: verseFile },
      'top-2': { name: 'verse.mp4', url: 'blob:3', file: verseFile },
    };
    expect(sceneChanges(scene, live).map((c) => c.slotId)).toEqual(['top-1']);
  });
});
