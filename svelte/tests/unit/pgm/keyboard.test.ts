import {describe,expect,it} from 'vitest';
import {pgmDigit,pgmSlotNumber} from '$lib/runtime/pgm/keyboard';
describe('PGM source keyboard',()=>{
  const event={key:'0',repeat:false,altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,defaultPrevented:false};
  it('maps all ten literal digits and keeps row gaps stable',()=>{for(let i=0;i<10;i++)expect(pgmDigit({...event,key:String(i)},false)).toBe(i);expect(pgmSlotNumber('bottom-0')).toBe(6);expect(pgmSlotNumber('bottom-4')).toBe(10);});
  it('selects the last two sources with minus and equals',()=>{expect(pgmDigit({...event,key:'-'},false)).toBe(10);expect(pgmDigit({...event,key:'='},false)).toBe(11);expect(pgmSlotNumber('bottom-5')).toBe(11);});
  it('ignores editors, modifiers, repeats and already handled events',()=>{expect(pgmDigit(event,true)).toBeNull();for(const flag of ['repeat','altKey','ctrlKey','metaKey','shiftKey','defaultPrevented'])expect(pgmDigit({...event,[flag]:true},false)).toBeNull();expect(pgmDigit({...event,key:'a'},false)).toBeNull();});
});
