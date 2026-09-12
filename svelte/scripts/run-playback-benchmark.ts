import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { withChrome, evalPage, dispatchVisibleButtonClick, screenshotPng } from './cdp';

if (process.env.HEADLESS === '1') throw new Error('Scored playback requires headed Chrome on the target GPU');
const seconds = Number(process.env.BENCHMARK_SECONDS ?? 120);
const count = Number(process.env.BENCHMARK_DECKS ?? 8);
const backend = process.env.BENCHMARK_BACKEND ?? 'beatsmaxxer';
const mode = process.env.BENCHMARK_MODE ?? 'cuts';
const seed = Number(process.env.BENCHMARK_SEED ?? 42);
if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw new Error('Seed must be an unsigned 32-bit integer');
if (![30,60,120,600].includes(seconds) || ![1,4,6,8].includes(count)) throw new Error('Unsupported duration or deck count');
if (!['beatsmaxxer','mediabunny','gpu-bank'].includes(backend)) throw new Error('Unsupported backend');
if (!['cuts','remap'].includes(mode) || (mode==='remap'&&backend!=='gpu-bank')) throw new Error('Remap requires gpu-bank');
const root=resolve(import.meta.dir,'../..');
const directory=resolve(root,'svelte/.artifacts/playback-benchmark');
const name=`${Date.now()}-${backend}-${count}-${mode}-${seed}`;
const url=process.env.BENCHMARK_URL??'http://127.0.0.1:5174/benchmark';
const controls={mode,backend,count:String(count),duration:String(seconds),seed:String(seed),trigger:mode==='remap'?'stem-onsets':'legacy',pattern:'audio-stutter4',groove:'straight',resolution:'720',view:'switch',budget:backend==='gpu-bank'?(mode==='remap'?'24576':'12288'):'256',speed:'speed-ramp',interpolation:mode==='remap'?'rife4':'original',volume:'.15'};
let accepted=false;
await withChrome('playback-benchmark', 9700, async session=>{
  await session.send('Page.enable');
  await session.send('Page.navigate',{url});
  let ready=false;
  for(let attempt=0;attempt<90;attempt++){
    const status=await evalPage<string>(session,"document.getElementById('status')?.textContent??''");
    if(status.startsWith('Ready.')){ready=true;break;}
    if(status.startsWith('Error')||status.startsWith('TypeError'))throw new Error(status);
    await Bun.sleep(500);
  }
  if(!ready)throw new Error('Benchmark page did not initialize');
  await evalPage(session,`(() => {
    const settings=${JSON.stringify(controls)};
    const mode=document.getElementById('mode');mode.value=settings.mode;mode.dispatchEvent(new Event('change'));
    for(const [key,value] of Object.entries(settings))document.getElementById(key).value=value;
  })()`);
  await dispatchVisibleButtonClick(session,'Play');
  const deadline=Date.now()+(seconds+180)*1000;
  let captured=false, finished=false;
  while(Date.now()<deadline){
    const state=await evalPage<{playing:boolean;busy:boolean;status:string;count:number}>(session,"(() => {const s=window.__BMX_BENCHMARK__.snapshot();return {playing:s.playing,busy:s.busy,status:s.status,count:s.records.length};})()");
    if(state.playing&&!captured){await Bun.sleep(3000);await screenshotPng(session,`${directory}/${name}.png`);captured=true;}
    if(state.count&&!state.busy&&!state.playing){finished=true;break;}
    await Bun.sleep(1000);
  }
  if(!finished)throw new Error('Benchmark timed out');
  const result=await evalPage<Record<string,unknown>>(session,'window.__BMX_BENCHMARK__.snapshot().records.at(-1)',30000);
  const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const report={...result,appRevision:revision,appDirty:Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()),runControls:controls};
  await Bun.write(`${directory}/${name}.json`,JSON.stringify(report,null,2));
  if(result.kind!=='musical-run'||!result.completed||(result.invalid as string[]).length)throw new Error(`Invalid benchmark run; evidence saved to ${directory}/${name}.json`);
  const {raw,schedule,...summary}=report as Record<string,unknown>;
  console.log(JSON.stringify(summary,null,2));
  console.log(`Evidence: ${directory}/${name}.json`);
  accepted=Boolean((result.acceptance as {passed?:boolean})?.passed);
  session.close();
});
// Measurement can succeed while the candidate fails its performance gate.
if(process.env.BENCHMARK_REQUIRE_PASS==='1'&&!accepted)process.exitCode=1;
