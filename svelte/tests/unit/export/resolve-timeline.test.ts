import {expect,test} from 'vitest';
import {resolveTimelineXml} from '$lib/export/resolveTimeline';
const asset={id:'r2',name:'clip & "one".mp4',width:1280,height:720,fps:24,duration:10,start:0};
const options={name:'Finish & Restart',fps:24 as const,width:1280,height:720,assets:[asset],audioName:'song.wav'};

test('preserves reverse, hold, jump and source change sample points on exact output frame boundaries',()=>{
  const samples=[4,4-1/24,4-1/24,1,1+1/24];
  const frames=samples.map((seconds,index)=>({at:index/24,duration:1/24,source:'r2',seconds}));
  const xml=resolveTimelineXml({...options,frames});
  expect(xml).toContain('version="1.7"');
  expect(xml).toContain('duration="5/24s"');
  expect(xml).toContain('offset="3/24s"');
  expect(xml).toContain('value="1/24s"');
  expect(xml).toContain('start="95/24s"');
  expect(xml).toContain('<ref-clip ref="range0"');
  expect(xml).toContain('frameDuration="1/24s"');
  expect(xml).toContain('name="clip &amp; &quot;one&quot;.mp4"');
  expect(xml).toContain('./Media/clip%20%26%20%22one%22.mp4');
  expect(xml).toContain('lane="-1"');
  expect(xml).not.toContain('blob:');
});

test('keeps source FPS distinct from timeline FPS, including NTSC fractional rates',()=>{
  const xml=resolveTimelineXml({...options,assets:[{...asset,fps:24000/1001}],frames:[{at:0,duration:1/24,source:'r2',seconds:0}]});
  expect(xml).toContain('frameDuration="1001/24000s"');
  expect(xml).toContain('frameDuration="1/24s"');
});

test('refuses ambiguous original filenames instead of producing a wrong relink',()=>{
  expect(()=>resolveTimelineXml({...options,assets:[asset,{...asset,id:'r3'}],frames:[{at:0,duration:1/24,source:'r2',seconds:0}]})).toThrow('share the filename');
});

test('retains source timestamps that do not fall on the nominal CFR grid',()=>{
  const xml=resolveTimelineXml({...options,assets:[{...asset,start:1.001}],frames:[{at:0,duration:1/24,source:'r2',seconds:2.001}]});
  expect(xml).toContain('start="2001000/1000000s"');
});
