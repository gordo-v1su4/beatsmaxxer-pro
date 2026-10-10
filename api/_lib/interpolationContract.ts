export const INTERPOLATION_PROFILE = 'rife-v4.6-cuda-nvcodec-min96-v3';
export interface InterpolationSource { sha256:string; name:string; uploadId:string; chunkCount:number; size:number }
export interface InterpolationArtifact {
  objectKey:string; url:string; sha256:string; fps:number; sourceFps:number; duration:number;
  width:number; height:number; frames:number; factor:number; engine:string; model:string;
  gpu?:string; processingSeconds?:number; totalSeconds?:number; cpuSeconds?:number;
}
/** Both the durable worker cache and browser accept the same verified render. */
export function validInterpolationArtifact(artifact: InterpolationArtifact | null | undefined): artifact is InterpolationArtifact {
  return Boolean(artifact && Number.isFinite(artifact.fps) && artifact.fps >= 96
    && Number.isInteger(artifact.factor) && artifact.factor >= 4 && artifact.factor <= 16
    && artifact.model === 'rife-v4.6' && artifact.engine === 'rife-cuda-nvcodec-2.2.3'
    && Number.isFinite(artifact.duration) && artifact.duration > 0
    && Number.isSafeInteger(artifact.frames) && artifact.frames > 0
    && Number.isInteger(artifact.width) && artifact.width > 0
    && Number.isInteger(artifact.height) && artifact.height > 0
    && Number.isFinite(artifact.sourceFps) && artifact.sourceFps > 0
    && typeof artifact.url === 'string' && artifact.url.length > 0
    && typeof artifact.objectKey === 'string' && artifact.objectKey.length > 0
    && /^[a-f0-9]{64}$/.test(artifact.sha256));
}
export interface InterpolationJob {
  id:string; source:InterpolationSource; profile:string; state:'queued'|'processing'|'ready'|'failed';
  stage:string; completed:number; total:number; createdAt:number; updatedAt:number;
  artifact?:InterpolationArtifact; error?:string;
}
