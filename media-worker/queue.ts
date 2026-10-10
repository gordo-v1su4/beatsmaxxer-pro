import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';

import { INTERPOLATION_PROFILE, validInterpolationArtifact, type InterpolationSource, type InterpolationArtifact, type InterpolationJob } from '../api/_lib/interpolationContract';
export type { InterpolationSource, InterpolationArtifact, InterpolationJob } from '../api/_lib/interpolationContract';

/** One durable queue per GPU worker. No job is claimed while another is active. */
export class InterpolationQueue {
  private db: Database;
  constructor(path: string, recoverInterrupted = false) {
    this.db = new Database(path, { create: true });
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, state TEXT NOT NULL, created_at INTEGER NOT NULL, data TEXT NOT NULL)');
    // Reuse verified 96 FPS renders from the previous profile without rerendering
    // or deleting their provenance. Below-96 artifacts must use the new pipeline.
    for (const row of this.db.query('SELECT data FROM jobs WHERE state=?').all('ready') as {data:string}[]) {
      const job = JSON.parse(row.data) as InterpolationJob;
      const artifact = job.artifact;
      if (job.profile !== 'rife-v4.6-cuda-nvcodec-min90-v2' || !validInterpolationArtifact(artifact)) continue;
      const id = createHash('sha256').update(`${INTERPOLATION_PROFILE}:${job.source.sha256}`).digest('hex');
      if (!this.get(id)) this.put({...job,id,profile:INTERPOLATION_PROFILE});
    }
    if (recoverInterrupted) {
      // The previous container's child processes have exited. The shared GPU
      // lock still arbitrates with other services before a recovered job runs.
      for (const row of this.db.query('SELECT data FROM jobs WHERE state=?').all('processing') as {data:string}[]) {
        const job = JSON.parse(row.data) as InterpolationJob;
        this.put({...job,state:'queued',stage:'recovered',completed:0,total:0,updatedAt:Date.now()});
      }
    }
  }
  private put(job: InterpolationJob) {
    this.db.query('INSERT INTO jobs VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,data=excluded.data').run(job.id,job.state,job.createdAt,JSON.stringify(job));
    return job;
  }
  get(id: string): InterpolationJob | undefined {
    const row=this.db.query('SELECT data FROM jobs WHERE id=?').get(id) as {data:string}|null;
    return row ? JSON.parse(row.data) : undefined;
  }
  submit(source: InterpolationSource) {
    if (!/^[a-f0-9]{64}$/.test(source.sha256) || !/^[a-zA-Z0-9_-]{16,80}$/.test(source.uploadId)
      || !Number.isSafeInteger(source.chunkCount) || source.chunkCount<1 || source.chunkCount>512
      || !Number.isSafeInteger(source.size) || source.size<1 || source.size>1024**3
      || typeof source.name!=='string' || !source.name || source.name.length>240) throw new Error('Invalid interpolation source');
    const id=createHash('sha256').update(`${INTERPOLATION_PROFILE}:${source.sha256}`).digest('hex');
    const existing=this.get(id);
    if (existing) return existing;
    const now=Date.now();
    return this.put({id,source,profile:INTERPOLATION_PROFILE,state:'queued',stage:'queued',completed:0,total:0,createdAt:now,updatedAt:now});
  }
  claim(): InterpolationJob | undefined {
    return this.db.transaction(() => {
      if (this.db.query('SELECT id FROM jobs WHERE state=? LIMIT 1').get('processing')) return undefined;
      const row=this.db.query('SELECT data FROM jobs WHERE state=? ORDER BY created_at,rowid LIMIT 1').get('queued') as {data:string}|null;
      if (!row) return undefined;
      return this.put({...JSON.parse(row.data),state:'processing',stage:'downloading',updatedAt:Date.now()});
    })();
  }
  progress(id: string, stage: string, completed: number, total: number) {
    const job=this.get(id);
    if (!job || job.state!=='processing') throw new Error('Job is not processing');
    if (!Number.isFinite(completed)||!Number.isFinite(total)||completed<0||total<0||completed>total) throw new Error('Invalid job progress');
    return this.put({...job,stage,completed,total,updatedAt:Date.now()});
  }
  complete(id: string, artifact: InterpolationArtifact) {
    const job=this.get(id);
    if (!job || job.state!=='processing') throw new Error('Job is not processing');
    if (!validInterpolationArtifact(artifact)) throw new Error('Invalid interpolation artifact');
    return this.put({...job,state:'ready',stage:'ready',completed:artifact.frames,total:artifact.frames,artifact,updatedAt:Date.now()});
  }
  fail(id: string, error: string) {
    const job=this.get(id);
    if (!job || job.state!=='processing') throw new Error('Job is not processing');
    return this.put({...job,state:'failed',stage:'failed',error:error.slice(0,400),updatedAt:Date.now()});
  }
  retry(id: string) {
    const job=this.get(id);
    if (!job || job.state!=='failed') throw new Error('Only failed jobs can be retried');
    return this.put({...job,state:'queued',stage:'queued',completed:0,total:0,error:undefined,artifact:undefined,updatedAt:Date.now()});
  }
  close() { this.db.close(); }
}
