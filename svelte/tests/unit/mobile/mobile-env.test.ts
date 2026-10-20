import { afterEach, describe, expect, test, vi } from 'vitest';
import { get } from 'svelte/store';
import { mobileShellForViewport, initMobileEnv, isMobileShell, viewportSize } from '$lib/mobile/mobileEnv';
afterEach(()=>vi.unstubAllGlobals());

describe('mobile shell selection', () => {
  test('a narrow desktop browser starts with the desktop media session', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    vi.stubGlobal('window', { innerWidth: 440, innerHeight: 900, location: { search: '' },
      addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const stop = initMobileEnv();
    expect(get(isMobileShell)).toBe(false);
    stop();
  });

  test('a real phone still starts with the phone session', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' });
    vi.stubGlobal('window', { innerWidth: 390, innerHeight: 844, location: { search: '' },
      addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const stop = initMobileEnv();
    expect(get(isMobileShell)).toBe(true);
    stop();
  });
  test('a temporary small viewport updates layout without replacing the desktop media session',()=>{
    const listeners=new Map<string,()=>void>();
    const viewport={innerWidth:1440,innerHeight:900,location:{search:''},
      addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn),
      removeEventListener:(name:string)=>listeners.delete(name)};
    vi.stubGlobal('window',viewport);
    const stop=initMobileEnv();
    expect(get(isMobileShell)).toBe(false);
    viewport.innerWidth=588;viewport.innerHeight=330;listeners.get('resize')!();
    expect(get(viewportSize)).toEqual({width:588,height:330});
    expect(get(isMobileShell)).toBe(false);
    stop();
  });
  test('keeps a phone on the mobile shell in either orientation', () => {
    expect(mobileShellForViewport(390, 844)).toBe(true);
    expect(mobileShellForViewport(844, 390)).toBe(true);
  });

  test('keeps a tablet on the desktop shell in either orientation', () => {
    expect(mobileShellForViewport(768, 1024)).toBe(false);
    expect(mobileShellForViewport(1024, 768)).toBe(false);
  });

  test('honors explicit review overrides', () => {
    expect(mobileShellForViewport(1440, 900, '?mobile=1')).toBe(true);
    expect(mobileShellForViewport(390, 844, '?desktop=1')).toBe(false);
  });
});
