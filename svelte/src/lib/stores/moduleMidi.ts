import { parseMidi } from '$lib/audio/MidiParser';
import { supportsModuleMidi } from '$lib/modules/midiContracts';
import { midiLayers, type MidiLayer } from '$lib/stores/rack';

/**
 * Parse a file into the one layer shape shared by rack controls, runtime, and
 * the arranger. Keeping this outside the page prevents QA imports and manual
 * uploads from drifting into subtly different MIDI representations.
 */
export async function parseModuleMidiFile(file: File): Promise<MidiLayer> {
  const data = parseMidi(await file.arrayBuffer());
  return {
    identity: `${file.name}:${file.size}:${file.lastModified}`,
    name: file.name,
    notes: data.notes,
    duration: data.duration
  };
}

/** Attach one MIDI part to a module without switching its trigger source. */
export async function attachModuleMidiFile(moduleId: string, file: File): Promise<MidiLayer> {
  if (!supportsModuleMidi(moduleId)) {
    throw new Error(`${moduleId} has no MIDI timing consumer`);
  }
  const layer = await parseModuleMidiFile(file);
  midiLayers.update((layers) => ({ ...layers, [moduleId]: layer }));
  return layer;
}
