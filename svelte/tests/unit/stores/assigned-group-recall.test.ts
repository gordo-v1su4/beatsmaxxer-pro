import { beforeEach, expect, test, vi } from 'vitest';
import { arrangement, autoClips, DEFAULT_ARRANGEMENT, selectSection } from '$lib/stores/arrangement';
import { recallScene } from '$lib/arrangement/sectionScenes';

vi.mock('$lib/arrangement/sectionScenes', () => ({
  captureScene: vi.fn(() => ({ slots: {} })),
  recallScene: vi.fn(async () => ({ loaded: 1, failed: [] })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  autoClips.set(false);
  arrangement.set(structuredClone(DEFAULT_ARRANGEMENT));
});

test('restored group assignments recall without the transient auto-clips toggle', () => {
  const scene = { slots: { 'top-0': { name: 'verse.mp4', url: '/verse.mp4' } } };
  arrangement.update(sections => sections.map((s, i) => i === 1 ? { ...s, clipGroupId: 'verse-group', scene } : s));
  selectSection(1);
  expect(recallScene).toHaveBeenCalledWith(scene);
});

test('unassigned captured scenes still respect the auto-clips toggle', () => {
  arrangement.update(sections => sections.map((s, i) => i === 1 ? { ...s, scene: { slots: {} } } : s));
  selectSection(1);
  expect(recallScene).not.toHaveBeenCalled();
});
