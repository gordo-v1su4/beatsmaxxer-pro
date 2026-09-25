import { audioEngine } from '$lib/audio';
import { videoPool } from '$lib/media/VideoPool';
import { supportsModuleMidi } from '$lib/modules/midiContracts';
import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
import { activeRackSlotIds, rackBottom, rackTop } from '$lib/stores/rack';
import { attachModuleMidiFile } from '$lib/stores/moduleMidi';
import { addMidiChannels, clearMidiChannels } from '$lib/stores/midiChannels';
import { syncMidiUiFromLoadedParts } from '$lib/stores/rackUi';
import { isTauriRuntime } from '$lib/platform/runtime';
import { get } from 'svelte/store';

export interface QaMidiAssignment {
  moduleId: string;
  file: string;
}

export interface QaManifest {
  bundle?: string;
  sourceRoot?: string;
  clips?: string[];
  audio?: string;
  audios?: string[];
  stems?: string[];
  midi?: string;
  midis?: string[];
  midiAssignments?: QaMidiAssignment[];
}

export const CLOUD_QA_MANIFEST_FILE = 'manifest.cloud.json';
export const REDLINE_QA_MANIFEST_FILE = 'manifest.json';

/** Pick Redline bundle vs committed cloud fixtures (`?qaManifest=cloud|redline|auto`). */
export async function resolveQaManifestFile(
  search: string,
  probe: (url: string, init?: RequestInit) => Promise<Response> = fetch
): Promise<string> {
  const params = new URLSearchParams(search);
  const forced = params.get('qaManifest');
  if (forced === 'cloud') return CLOUD_QA_MANIFEST_FILE;
  if (forced === 'redline') return REDLINE_QA_MANIFEST_FILE;
  if (forced && forced !== 'auto') return `manifest.${forced}.json`;

  try {
    const res = await probe('/qa-media/manifest.json');
    if (!res.ok) return CLOUD_QA_MANIFEST_FILE;
    const manifest = (await res.json()) as QaManifest;
    const firstClip = manifest.clips?.[0];
    if (!firstClip?.startsWith('redline/')) return REDLINE_QA_MANIFEST_FILE;
    const head = await probe(`/qa-media/${firstClip}`, { method: 'HEAD' });
    return head.ok ? REDLINE_QA_MANIFEST_FILE : CLOUD_QA_MANIFEST_FILE;
  } catch {
    return CLOUD_QA_MANIFEST_FILE;
  }
}

export function validateQaMidiAssignments(
  manifest: QaManifest,
  activeModuleIds = [...get(rackTop), ...get(rackBottom)]
): QaMidiAssignment[] {
  const assignments = manifest.midiAssignments ?? [];
  if (assignments.length === 0) return assignments;
  if (assignments.length !== 7) {
    throw new Error(`QA MIDI manifest must assign exactly 7 stems; found ${assignments.length}`);
  }
  const moduleIds = assignments.map(({ moduleId }) => moduleId);
  const files = assignments.map(({ file }) => file);
  if (new Set(moduleIds).size !== assignments.length) {
    throw new Error('QA MIDI manifest assigns more than one stem to a module');
  }
  if (new Set(files).size !== assignments.length) {
    throw new Error('QA MIDI manifest assigns one stem more than once');
  }
  const midiInventory = new Set(manifest.midis ?? []);
  const activeModules = new Set(activeModuleIds);
  for (const assignment of assignments) {
    if (!midiInventory.has(assignment.file)) {
      throw new Error(`QA MIDI assignment is not inventoried: ${assignment.file}`);
    }
    if (!activeModules.has(assignment.moduleId)) {
      throw new Error(`QA MIDI assignment targets inactive rack module: ${assignment.moduleId}`);
    }
    if (!supportsModuleMidi(assignment.moduleId)) {
      throw new Error(`QA MIDI assignment targets unsupported module: ${assignment.moduleId}`);
    }
  }
  return assignments;
}

/** Load the rack-bound MIDI parts without registering duplicate free stem lanes. */
export async function loadQaMidiAssignments(manifest: QaManifest): Promise<void> {
  const assignments = validateQaMidiAssignments(manifest);
  const files = await Promise.all(assignments.map(async (assignment) => {
    const response = await fetch(`/qa-media/${assignment.file}`);
    if (!response.ok) {
      throw new Error(`MIDI fetch failed for ${assignment.moduleId}: ${response.status}`);
    }
    const blob = await response.blob();
    const name = assignment.file.split('/').at(-1) ?? assignment.file;
    return {
      assignment,
      file: new File([blob], name, { type: blob.type || 'audio/midi' })
    };
  }));
  for (const { assignment, file } of files) {
    await attachModuleMidiFile(assignment.moduleId, file);
  }
}

/** Load every inventoried stem into the arranger trigger lanes. */
export async function loadQaMidiChannels(manifest: QaManifest): Promise<void> {
  const paths = manifest.midis ?? [];
  if (paths.length === 0) return;

  clearMidiChannels();
  const files = await Promise.all(paths.map(async (midiPath) => {
    const response = await fetch(`/qa-media/${midiPath}`);
    if (!response.ok) {
      throw new Error(`MIDI fetch failed for ${midiPath}: ${response.status}`);
    }
    const blob = await response.blob();
    const name = midiPath.split('/').at(-1) ?? midiPath;
    return new File([blob], name, { type: blob.type || 'audio/midi' });
  }));

  const added = await addMidiChannels(files);
  if (added.length === 0) {
    throw new Error('QA MIDI stems did not produce any arranger trigger channels');
  }
}

export async function loadQaMediaFromManifest(
  manifest: QaManifest,
  options?: { midi?: boolean; arrangerMidi?: boolean }
) {
  const clips = manifest.clips ?? [];
  const slotIds = activeRackSlotIds();
  const errors: string[] = [];

  // Song + Essentia rhythm must finish before clips prewarm or transport can
  // start — otherwise rack video runs on the 128 default BPM.
  if (manifest.audio) {
    try {
      const response = await fetch(`/qa-media/${manifest.audio}`);
      if (!response.ok) throw new Error(`audio fetch failed: ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], manifest.audio, { type: blob.type || 'audio/mpeg' });
      await audioEngine.loadAudioFile(file, { hostedAnalysis: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`audio: ${msg}`);
      console.error('[QA] audio load failed:', err);
    }
  }

  for (let i = 0; i < slotIds.length; i++) {
    const clip = clips[i % clips.length];
    if (!clip) continue;
    const slotId = slotIds[i];
    const url = `/qa-media/${clip}`;
    try {
      let file: File | undefined;
      if (isTauriRuntime()) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`clip fetch failed: ${response.status}`);
        const blob = await response.blob();
        file = new File([blob], clip, { type: blob.type || 'video/mp4' });
      }
      const result = await mediaRuntime.registerModuleClip(slotId, clip, url, file);
      if (result.status !== 'success') {
        throw new Error(result.status === 'failed' ? result.error : result.status);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${slotId}: ${msg}`);
      console.error(`[QA] clip load failed for ${slotId} (${clip}):`, err);
    }
  }

  videoPool.tick(false);

  if (options?.arrangerMidi === true && manifest.midis?.length) {
    try {
      await loadQaMidiChannels(manifest);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`arranger MIDI: ${msg}`);
      console.error('[QA] arranger MIDI load failed:', err);
    }
  }

  if (options?.midi === true && manifest.midiAssignments?.length) {
    try {
      await loadQaMidiAssignments(manifest);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`MIDI: ${msg}`);
      console.error('[QA] MIDI load failed:', err);
    }
  }

  syncMidiUiFromLoadedParts();

  if (errors.length > 0) {
    throw new Error(`QA media partial failure:\n${errors.join('\n')}`);
  }
}

/** Rack module parts load only when `?qaMidi=1`. Arranger stem lanes are opt-in too. */
export function shouldAutoloadQaMidi(search: string): boolean {
  return new URLSearchParams(search).get('qaMidi') === '1';
}

/** Arrangement MIDI stem lanes — optional; arrangement works from the song alone. */
export function shouldAutoloadQaArrangerMidi(search: string): boolean {
  return new URLSearchParams(search).get('qaArrangerMidi') === '1';
}

/** ARM the arrangement sequencer after QA media loads (`?qaSequencerArm=1`). */
export function shouldAutoloadQaSequencerArm(search: string): boolean {
  return new URLSearchParams(search).get('qaSequencerArm') === '1';
}

/** Default loop span for long Redline QA — matches `loopTransport` unit tests. */
export const QA_DEFAULT_LOOP_REGION = { startSeconds: 10, endSeconds: 20 } as const;

/** Fit a rehearsal loop inside the loaded song (cloud fixtures are ~8s). */
export function qaLoopRegionForDuration(durationSeconds: number): {
  startSeconds: number;
  endSeconds: number;
} {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 1) {
    return { ...QA_DEFAULT_LOOP_REGION };
  }
  const startSeconds = Math.max(0, durationSeconds * 0.15);
  const endSeconds = Math.min(durationSeconds - 0.05, startSeconds + Math.min(6, durationSeconds * 0.75));
  if (endSeconds <= startSeconds + 0.5) {
    return { startSeconds: 0, endSeconds: Math.max(0.75, durationSeconds - 0.05) };
  }
  return { startSeconds, endSeconds };
}

/** Enable arrangement loop rehearsal (`?qaLoopRegion=1`). */
export function shouldAutoloadQaLoopRegion(search: string): boolean {
  return new URLSearchParams(search).get('qaLoopRegion') === '1';
}

export async function fetchAndLoadQaMedia(options?: { midi?: boolean; arrangerMidi?: boolean }) {
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const manifestFile = await resolveQaManifestFile(search);
  const res = await fetch(`/qa-media/${manifestFile}`);
  if (!res.ok) throw new Error(`manifest fetch failed (${manifestFile}): ${res.status}`);
  const manifest = (await res.json()) as QaManifest;
  await loadQaMediaFromManifest(manifest, options);
  return manifest;
}
