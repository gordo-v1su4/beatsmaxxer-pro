import { expect, test, vi } from 'vitest';
import * as scenes from '$lib/arrangement/sectionScenes';

test('the initialized loop claims prepared clips before same-tick lookahead clears them', async () => {
  let prepared = true;
  const register = vi.fn(() => {
    const claimed = prepared;
    return Promise.resolve({ status: claimed ? 'success' : 'error' });
  });
  const runtime = {
    registerModuleClip: register,
    registerModuleFileClip: register
  };
  scenes.primeSceneRecallRuntime(runtime as unknown as Parameters<typeof scenes.primeSceneRecallRuntime>[0]);
  const result = scenes.recallScene({ slots: {
    'top-0': { name: 'next.mp4', url: '/next.mp4' }
  } });
  // AppLoop advances lookahead immediately after synchronous section entry.
  prepared = false;
  expect(register).toHaveBeenCalledOnce();
  await expect(result).resolves.toEqual({ loaded: 1, failed: [] });
});
