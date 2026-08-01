import { beforeEach, describe, expect, test } from 'vitest';
import { get } from 'svelte/store';
import { dragState, endDrag, moveDrag, setHoverTarget, startDrag } from '$lib/stores/drag';

describe('drag input contract', () => {
  beforeEach(() => endDrag());

  test('pointer remains the default input mode', () => {
    startDrag({ moduleId: 'transition', source: 'palette' }, 10, 20);
    expect(get(dragState)).toMatchObject({ active: true, input: 'pointer', x: 10, y: 20 });

    moveDrag(30, 40);
    expect(get(dragState)).toMatchObject({ x: 30, y: 40 });
  });

  test('keyboard grab uses the same payload and drop-target contract', () => {
    startDrag({ moduleId: 'shake', source: 'palette' }, 0, 0, 'keyboard');
    setHoverTarget({ row: 'bottom', slotIndex: 2 });

    expect(get(dragState)).toMatchObject({
      active: true,
      input: 'keyboard',
      payload: { moduleId: 'shake', source: 'palette' },
      hoverTarget: { row: 'bottom', slotIndex: 2 }
    });

    endDrag();
    expect(get(dragState)).toMatchObject({ active: false, payload: null, input: 'pointer' });
  });
});
