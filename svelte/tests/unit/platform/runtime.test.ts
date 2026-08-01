import { describe, expect, test } from 'vitest';
import { detectRuntime, isTauriRuntime, isWebRuntime } from '$lib/platform/runtime';

describe('platform runtime', () => {
  test('defaults to web in vitest', () => {
    expect(detectRuntime()).toBe('web');
    expect(isWebRuntime()).toBe(true);
    expect(isTauriRuntime()).toBe(false);
  });
});
