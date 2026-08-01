import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { ClipRegistry } from '$lib/media/ClipRegistry';

describe('ClipRegistry object URL ownership', () => {
  const create = vi.spyOn(URL, 'createObjectURL');
  const revoke = vi.spyOn(URL, 'revokeObjectURL');

  beforeEach(() => {
    create.mockReset();
    revoke.mockReset();
    let id = 0;
    create.mockImplementation(() => `blob:test-${++id}`);
  });

  afterAll(() => {
    create.mockRestore();
    revoke.mockRestore();
  });

  test('rolls a staged file back with exactly one revoke', () => {
    const registry = new ClipRegistry();
    const staged = registry.stageFile('fx', new File(['a'], 'a.mp4'));

    expect(registry.get('fx')).toBeNull();
    expect(registry.rollback(staged)).toBe(true);
    expect(registry.rollback(staged)).toBe(false);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:test-1');
  });

  test('defers replacement revoke until the final retained reference is released', () => {
    const registry = new ClipRegistry();
    const first = registry.registerFile('fx', new File(['a'], 'a.mp4'));
    registry.retain(first);
    const second = registry.registerFile('fx', new File(['b'], 'b.mp4'));

    expect(registry.get('fx')).toBe(second);
    expect(revoke).not.toHaveBeenCalled();
    registry.releaseReference(first);
    registry.releaseReference(first);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:test-1');

    registry.remove('fx');
    registry.dispose();
    expect(revoke.mock.calls.map(([url]) => url)).toEqual(['blob:test-1', 'blob:test-2']);
  });
});
