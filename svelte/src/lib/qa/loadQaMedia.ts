import { audioEngine } from '$lib/audio';
import { videoPool } from '$lib/media/VideoPool';
import { supportsModuleMidi } from '$lib/modules/midiContracts';
import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
import { activeRackSlotIds, rackBottom, rackTop } from '$lib/stores/rack';
import { attachModuleMidiFile } from '$lib/stores/moduleMidi';
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

export async function loadQaMediaFromManifest(manifest: QaManifest) {
  const clips = manifest.clips ?? [];
  const slotIds = activeRackSlotIds();
  const errors: string[] = [];

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
      await videoPool.prewarm(slotId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${slotId}: ${msg}`);
      console.error(`[QA] clip load failed for ${slotId} (${clip}):`, err);
    }
  }

  videoPool.tick(true);

  if (manifest.audio) {
    try {
      // Load through the real upload path with hosted analysis so QA sessions
      // exercise the Essentia endpoint and get the song's true BPM instead of
      // silently running on the 128 default. Falls back to realtime estimation
      // when the service is unreachable.
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

  try {
    await loadQaMidiAssignments(manifest);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`MIDI: ${msg}`);
    console.error('[QA] MIDI load failed:', err);
  }

  if (errors.length > 0) {
    throw new Error(`QA media partial failure:\n${errors.join('\n')}`);
  }
}

export async function fetchAndLoadQaMedia() {
  const res = await fetch('/qa-media/manifest.json');
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  const manifest = (await res.json()) as QaManifest;
  await loadQaMediaFromManifest(manifest);
  return manifest;
}
