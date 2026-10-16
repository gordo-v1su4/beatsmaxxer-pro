import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { get } from 'svelte/store';
import { requireHostedAccess, finishServiceUnlock, hostedServicesUnlocked, serviceUnlockRequested, openProtectedFilePicker, chooseProtectedFile } from '../../../src/lib/access/accessGate';
beforeEach(()=>{
 finishServiceUnlock(false);hostedServicesUnlocked.set(false);
 vi.stubGlobal('window',{location:{origin:'https://beats.test'}});
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({required:true,unlocked:false})));
});
afterEach(()=>{finishServiceUnlock(false);hostedServicesUnlocked.set(false);vi.unstubAllGlobals();});
test('canceling the code window prevents a new-song file picker',async()=>{
 const input={click:vi.fn()} as unknown as HTMLInputElement;
 openProtectedFilePicker(input);
 await vi.waitFor(()=>expect(get(serviceUnlockRequested)).toBe(true));finishServiceUnlock(false);
 expect(input.click).not.toHaveBeenCalled();expect(get(hostedServicesUnlocked)).toBe(false);
});
test('a successful unlock continues the pending picker and concurrent actions',async()=>{
 const input={click:vi.fn()} as unknown as HTMLInputElement;
 openProtectedFilePicker(input);const second=requireHostedAccess();
 await new Promise(resolve=>setTimeout(resolve,0));finishServiceUnlock(true);
 expect(await second).toBe(true);expect(input.click).not.toHaveBeenCalled();
 expect(get(serviceUnlockRequested)).toBe(true);chooseProtectedFile();expect(input.click).toHaveBeenCalledOnce();
 expect(get(serviceUnlockRequested)).toBe(false);expect(get(hostedServicesUnlocked)).toBe(true);
});
test('an existing server session needs no code dialog',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({required:true,unlocked:true})));
 expect(await requireHostedAccess()).toBe(true);expect(get(serviceUnlockRequested)).toBe(false);
});
test('concurrent imports share one status request and one canceled attempt',async()=>{
 let release!:(response:Response)=>void;
 const fetcher=vi.fn(()=>new Promise<Response>(resolve=>release=resolve));vi.stubGlobal('fetch',fetcher);
 const first=requireHostedAccess(),second=requireHostedAccess();
 expect(first).toBe(second);expect(fetcher).toHaveBeenCalledOnce();
 release(Response.json({required:true,unlocked:false}));
 await vi.waitFor(()=>expect(get(serviceUnlockRequested)).toBe(true));finishServiceUnlock(false);
 expect(await first).toBe(false);expect(await second).toBe(false);expect(get(serviceUnlockRequested)).toBe(false);
});
test('a late status response cannot reopen an attempt canceled while checking',async()=>{
 let release!:(response:Response)=>void;
 vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>release=resolve)));
 const input={click:vi.fn()} as unknown as HTMLInputElement;
 openProtectedFilePicker(input);const checking=requireHostedAccess();finishServiceUnlock(false);
 release(Response.json({required:true,unlocked:false}));await checking;await new Promise(resolve=>setTimeout(resolve,0));
 expect(get(serviceUnlockRequested)).toBe(false);expect(input.click).not.toHaveBeenCalled();
});
