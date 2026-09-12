import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root=resolve(import.meta.dir,'..');
const directory=resolve(root,'svelte/.artifacts/playback-benchmark');
const files=(await readdir(directory)).filter(name=>name.endsWith('.json')).sort();
const rows:string[]=[];
for(const file of files){
  const r=JSON.parse(await readFile(resolve(directory,file),'utf8'));
  if(r.kind!=='musical-run'||r.schemaVersion!==11)continue;
  const trace=createHash('sha256').update(JSON.stringify({schedule:r.schedule,clips:r.clips.map((clip:{sha256:string})=>clip.sha256),audio:r.audioHash,grid:r.gridHash,mode:r.mode,cadence:r.outputCadenceFps})).digest('hex').slice(0,12);
  const p95=r.decks.map((deck:{p95Ms:number|null})=>deck.p95Ms).filter((n:unknown)=>typeof n==='number') as number[];
  rows.push(`| ${r.backend} | ${r.count} | ${r.mode} | ${r.elapsed.toFixed(0)} | ${r.seed} | ${trace} | ${r.programSummary.onTimePercent.toFixed(1)}% | ${p95.length?Math.max(...p95).toFixed(1):'n/a'} | ${(r.allDecksReadyMs/1000).toFixed(2)} | ${(r.peakApplicationCacheBytes/2**30).toFixed(2)} | ${r.elapsed<120?'preview':r.acceptance.passed?'target met':'below target'} | ${r.invalid.length?'invalid':'valid'} | [JSON](${file}) |`);
}
const output=`# Beatsmaxxer playback measurements\n\nBrowser source-PTS and GPU-submission observations; not physical scanout. Compare only matching trace IDs and durations. Preload costs and memory budgets differ. Passing one run does not establish a winner. The full 36-run capacity matrix and finalist soaks are separate.\n\n| Backend | Decks | Mode | Seconds | Seed | Trace + media | Program on time | Worst deck p95 ms | Preload s | App cache GiB | Strict target | Validity | Evidence |\n|---|---:|---|---:|---:|---|---:|---:|---:|---:|---|---|---|\n${rows.join('\n')}\n`;
await writeFile(resolve(directory,'summary.md'),output);
console.log(output);
