import {describe,it,expect} from 'vitest';
import {defaultLightChannels,LightEventCursor,lightEvents} from '../../../src/lib/connections/sentinelEvents';
describe('Sentinel music events',()=>{
 it('assigns Suno filenames and prefers synth to keyboard without merging vocals',()=>{
  const channels=['Backing Vocals','Drums','Keyboard','Synth','Vocals'].map(name=>({name:`For Me (${name}).mid`,events:[]}));
  expect(defaultLightChannels(channels)).toEqual([channels[1].name,channels[4].name,channels[3].name,channels[0].name]);
 });
 it('collapses chords using their strongest velocity',()=>{
  expect(lightEvents([{time:1,strength:.4},{time:1.01,strength:.8},{time:2,strength:.5}])).toEqual([{time:1,strength:.8},{time:2,strength:.5}]);
 });
 it('follows song position through a tempo change and suppresses seek catch-up',()=>{
  const cursor=new LightEventCursor([{time:1,strength:1},{time:2,strength:1},{time:5,strength:1}]);
  cursor.sample(0,1,true,0,.2,.09,.22);
  cursor.sample(1.1,1,true,1.1,.2,.09,.22);expect(cursor.count).toBe(1);
  cursor.sample(2.1,1,true,1.6,.2,.09,.22);expect(cursor.count).toBe(2);
  cursor.sample(6,2,true,1.7,.2,.09,.22);expect(cursor.count).toBe(2);expect(cursor.envelope).toBe(0);
  cursor.sample(0,3,true,1.8,.2,.09,.22);
  cursor.sample(1.1,3,true,2.9,.2,.09,.22);expect(cursor.count).toBe(3);
  cursor.sample(1.1,4,false,3,.2,.09,.22);expect(cursor.envelope).toBe(0);
 });
});
