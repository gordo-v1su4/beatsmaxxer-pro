import { createHash } from 'node:crypto';
import catalog from '../../svelte/src/lib/runtime/publicDemo.json';
import { INTERPOLATION_PROFILE, validInterpolationArtifact, type InterpolationJob } from '../_lib/interpolationContract';

// The public lane is read-only and restricted to the reviewed demo originals.
const demoJobs = new Map(catalog.clips.map(clip => [
  createHash('sha256').update(`${INTERPOLATION_PROFILE}:${clip.sha256}`).digest('hex'), clip
]));
export function isPublicDemoJob(id: string) { return demoJobs.has(id); }
export function publicDemoJob(payload: unknown, id: string) {
  const clip = demoJobs.get(id);
  const job = payload as Partial<InterpolationJob> | null;
  if (!clip || !job || job.id !== id || job.state !== 'ready' || job.profile !== INTERPOLATION_PROFILE
    || job.source?.sha256 !== clip.sha256 || !validInterpolationArtifact(job.artifact)) return null;
  return { id, state: 'ready', profile: INTERPOLATION_PROFILE, stage: 'ready', completed: 1, total: 1,
    source: { sha256: clip.sha256, name: clip.name, size: clip.size }, artifact: job.artifact };
}
