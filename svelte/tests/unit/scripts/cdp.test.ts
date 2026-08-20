import { describe, expect, it, vi } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  browserProfilesRoot,
  chromeLaunchArgs,
  dispatchVisibleButtonClick,
  evalPage,
  navigateAndReady,
  type CdpSession
} from '../../../scripts/cdp';

const svelteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('CDP browser isolation', () => {
  it('keeps Chrome profiles repo-local and outside Vite\'s watched root', () => {
    expect(browserProfilesRoot()).toBe(resolve(svelteRoot, '../.artifacts/browser-profiles'));
    expect(browserProfilesRoot().startsWith(`${svelteRoot}/`)).toBe(false);
    expect(browserProfilesRoot()).not.toContain('/tmp/');
  });

  it('disables extensions and background network work for proof profiles', () => {
    const userDataDir = resolve(svelteRoot, '../.artifacts/browser-profiles/proof');
    const args = chromeLaunchArgs('/Applications/Google Chrome', 10036, userDataDir, true);

    expect(args).toContain('--disable-background-networking');
    expect(args).toContain('--disable-extensions');
    expect(args).toContain('--no-first-run');
    expect(args).toContain('--enable-automation');
    expect(args).toContain(`--remote-debugging-port=10036`);
    expect(args).toContain(`--user-data-dir=${userDataDir}`);
    expect(args).not.toContain('--headless=new');
    expect(args).not.toContain('--enable-unsafe-swiftshader');
    expect(args).not.toContain('--enable-unsafe-webgpu');
    expect(args).not.toContain('--use-angle=swiftshader');
    expect(args).not.toContain('--use-gl=angle');
    expect(args).not.toContain('--autoplay-policy=no-user-gesture-required');
  });

  it('keeps autoplay bypass diagnostic-only and opt-in', () => {
    const args = chromeLaunchArgs('/Applications/Google Chrome', 10036, '/repo/.artifacts/browser-profiles/proof', true, true);
    expect(args).toContain('--autoplay-policy=no-user-gesture-required');
  });

  it('clicks PLAY through trusted CDP mouse input at the visible button coordinates', async () => {
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const session = {
      send: (method: string, params: Record<string, unknown> = {}) => {
        calls.push({ method, params });
        if (method === 'Runtime.evaluate') return Promise.resolve({ result: { value: { x: 50, y: 75 } } });
        return Promise.resolve({});
      }
    } as unknown as CdpSession;

    await dispatchVisibleButtonClick(session, 'PLAY');

    expect(calls.slice(1).map(({ method }) => method)).toEqual([
      'Input.dispatchMouseEvent', 'Input.dispatchMouseEvent'
    ]);
    expect(calls[1]?.params).toMatchObject({ type: 'mousePressed', x: 50, y: 75, button: 'left' });
    expect(calls[2]?.params).toMatchObject({ type: 'mouseReleased', x: 50, y: 75, button: 'left' });
  });

  it('enables CDP command-line provenance without changing the headed native-GPU contract', () => {
    const args = chromeLaunchArgs('/Applications/Google Chrome', 10036, '/repo/.artifacts/browser-profiles/proof', true);

    expect(args).toContain('--enable-automation');
    expect(args.some((arg) => arg.includes('--headless'))).toBe(false);
    expect(args.some((arg) => /swiftshader|llvmpipe|disable-gpu|use-angle|use-gl/i.test(arg))).toBe(false);
  });

  it('confines software WebGPU flags to explicitly headless test runs', () => {
    const args = chromeLaunchArgs('/Applications/Google Chrome', 10036, '/repo/.artifacts/browser-profiles/test', false);

    expect(args).toContain('--headless=new');
    expect(args).toContain('--enable-unsafe-swiftshader');
    expect(args).toContain('--use-angle=swiftshader');
  });

  it('labels a timed-out evaluation with its action', async () => {
    const session = {
      send: () => Promise.reject(new Error('CDP timeout: Runtime.evaluate (8000ms)'))
    } as unknown as CdpSession;

    await expect(evalPage(session, 'window.expensiveAction()', 8_000, 'fixture assignment'))
      .rejects.toThrow('CDP evaluation "fixture assignment" failed: CDP timeout: Runtime.evaluate (8000ms)');
  });

  it('preserves Runtime.evaluate exception details instead of returning null', async () => {
    const session = {
      send: () => Promise.resolve({
        result: { type: 'object', subtype: 'error', description: 'Error: decoded frame unavailable' },
        exceptionDetails: {
          text: 'Uncaught (in promise) Error: decoded frame unavailable',
          exception: { description: 'Error: decoded frame unavailable\n    at attachClip (bmxQa.ts:218:13)' }
        }
      })
    } as unknown as CdpSession;

    await expect(evalPage(session, 'window.__BMX_QA__.attachClip()', 8_000, 'fixture assignment'))
      .rejects.toThrow('CDP evaluation "fixture assignment" failed: Error: decoded frame unavailable\n    at attachClip (bmxQa.ts:218:13)');
  });

  it('retries a transient readiness evaluation stall within the overall deadline', async () => {
    vi.stubGlobal('Bun', { sleep: () => Promise.resolve() });
    let readinessAttempts = 0;
    const session = {
      send: (method: string) => {
        if (method !== 'Runtime.evaluate') return Promise.resolve({});
        readinessAttempts++;
        if (readinessAttempts === 1) {
          return Promise.reject(new Error('CDP timeout: Runtime.evaluate (8000ms)'));
        }
        return Promise.resolve({ result: { value: true } });
      }
    } as unknown as CdpSession;

    await navigateAndReady(session, 'http://127.0.0.1:5174/?qa=1', undefined, 1_000);
    expect(readinessAttempts).toBe(2);
    vi.unstubAllGlobals();
  });
});
