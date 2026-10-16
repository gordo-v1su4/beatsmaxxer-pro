import { get } from 'svelte/store';
import { audioEngine } from '$lib/audio';
import { timingInput, type TimingInput } from '$lib/stores/timingSignals';
import { midiChannels, activeChannelId, restoreMidiChannels, type MidiChannel } from '$lib/stores/midiChannels';
import { midiLayers, type MidiLayer } from '$lib/stores/rack';
import { midiUiOpen } from '$lib/stores/rackUi';
import { triggerSource, triggerMidiModule } from '$lib/stores/triggerLane';
import { getModuleDef } from '$lib/modules/catalog';

interface WorkflowSignals {
  version: 1;
  timing: Omit<TimingInput, 'generation'> | null;
  rhythm: { bpm: number; beats: number[]; onsets: number[]; duration: number; keyIndex: number } | null;
  channels: MidiChannel[];
  activeChannel: string | null;
  layers: Record<string, MidiLayer | null>;
  uiOpen: boolean;
  source: 'audio' | 'midi';
  midiModule: string | null;
  audio: { volume: number; tempo: number; pitchSemitones: number; keySemitones: number };
}

/** Musical events are small data, unlike the original audio/video files. */
export function captureWorkflowSignals(): WorkflowSignals {
  const input = get(timingInput), state = audioEngine.getState(), sound = audioEngine.getSoundTouchState();
  const { generation: _generation, ...timing } = input ?? { generation: -1 };
  const beats = [...audioEngine.getBeatGrid()];
  return {
    version: 1, timing: input?.generation === audioEngine.getUploadedTrackLoadGeneration() ? timing as WorkflowSignals['timing'] : null,
    rhythm: beats.length >= 2 && state.duration > 0 ? { bpm: audioEngine.getAnalysisBpm(), beats, onsets: [...audioEngine.getAnalysisOnsets()], duration: state.duration, keyIndex: sound.analysisKeyIndex } : null,
    channels: get(midiChannels), activeChannel: get(activeChannelId), layers: get(midiLayers), uiOpen: get(midiUiOpen),
    source: get(triggerSource), midiModule: get(triggerMidiModule),
    audio: { volume: sound.volume, tempo: sound.tempo, pitchSemitones: sound.pitchSemitones, keySemitones: sound.keySemitones },
  };
}

export function parseWorkflowSignals(raw: unknown): WorkflowSignals | undefined {
  if (raw === undefined) return undefined; // Existing workflow files remain readable.
  const fail = () => { throw new Error('Invalid workflow trigger data.'); };
  const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  const text = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 1000;
  const number = (value: unknown, min = 0, max = Infinity): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const times = (value: unknown) => Array.isArray(value) && value.length <= 200000 && value.every((time, i) => number(time) && (!i || time >= value[i - 1]));
  const events = (value: unknown) => Array.isArray(value) && value.length <= 200000 && value.every((event, i) => record(event) && number(event.time) && number(event.strength, 0, 1) && (!i || event.time >= value[i - 1].time));
  const notes = (value: unknown) => Array.isArray(value) && value.length <= 200000 && value.every(note => record(note) && number(note.time) && number(note.note, 0, 127) && Number.isInteger(note.note) && number(note.velocity, 0, 127) && (note.beat === undefined || number(note.beat)));
  const layer = (value: unknown) => record(value) && text(value.name) && number(value.duration) && notes(value.notes) && (value.identity === undefined || text(value.identity));
  const data = raw as WorkflowSignals;
  if (!record(data) || data.version !== 1 || typeof data.uiOpen !== 'boolean' || !['audio', 'midi'].includes(data.source)
    || (data.midiModule !== null && (!text(data.midiModule) || !getModuleDef(data.midiModule)))) fail();
  if (!Array.isArray(data.channels) || data.channels.length > 64 || data.channels.some(channel => !record(channel) || !text(channel.id) || !text(channel.name) || !times(channel.onsets) || !number(channel.duration) || !number(channel.firstOnset) || !number(channel.noteCount) || typeof channel.color !== 'string' || !/^#[a-f\d]{3,8}$/i.test(channel.color) || (channel.notes !== undefined && !notes(channel.notes)))) fail();
  if (new Set(data.channels.map(channel => channel.id)).size !== data.channels.length || (data.activeChannel !== null && !data.channels.some(channel => channel.id === data.activeChannel))) fail();
  if (!record(data.layers) || Object.keys(data.layers).length > 100 || Object.entries(data.layers).some(([id, value]) => !getModuleDef(id) || (value !== null && !layer(value)))) fail();
  const rhythm = data.rhythm;
  if (rhythm !== null && (!record(rhythm) || !number(rhythm.bpm, 1, 1000) || !number(rhythm.duration, .001) || !times(rhythm.beats) || rhythm.beats.length < 2 || rhythm.beats.some((beat, i) => i > 0 && beat <= rhythm.beats[i - 1]) || !times(rhythm.onsets) || !number(rhythm.keyIndex, 0, 11) || !Number.isInteger(rhythm.keyIndex))) fail();
  const input = data.timing;
  if (input !== null) {
    if (!record(input) || !text(input.name) || !number(input.bpm, .001) || !number(input.duration, .001) || !times(input.beats) || (input.sourceSha256 !== undefined && !/^[a-f\d]{64}$/i.test(input.sourceSha256))
      || !Array.isArray(input.midi) || input.midi.length > 64 || input.midi.some(channel => !record(channel) || !text(channel.name) || !events(channel.events))
      || !record(input.features) || Object.keys(input.features).length > 128 || Object.values(input.features).some(feature => !record(feature) || !(['onsets', 'activity', 'loudness'] as const).every(key => events(feature[key])))) fail();
  }
  const audio = data.audio;
  if (!record(audio) || !number(audio.volume, 0, 1) || !number(audio.tempo, .5, 2) || !number(audio.pitchSemitones, -12, 12) || !Number.isInteger(audio.pitchSemitones) || !number(audio.keySemitones, -12, 12) || !Number.isInteger(audio.keySemitones)) fail();
  return data;
}

export function restoreWorkflowSignals(data: WorkflowSignals) {
  audioEngine.cancelPendingAnalysis();
  if (data.rhythm) audioEngine.applyPreparedRhythm(data.rhythm);
  timingInput.set(data.timing ? { ...structuredClone(data.timing), generation: audioEngine.getUploadedTrackLoadGeneration() } : null);
  restoreMidiChannels(structuredClone(data.channels), data.activeChannel);
  midiLayers.set(structuredClone(data.layers)); midiUiOpen.set(data.uiOpen);
  triggerSource.set(data.source); triggerMidiModule.set(data.midiModule);
  audioEngine.setTempo(data.audio.tempo); audioEngine.setPitch(data.audio.pitchSemitones); audioEngine.setVolume(data.audio.volume);
  audioEngine.nudgeKey(data.audio.keySemitones - audioEngine.getSoundTouchState().keySemitones);
}
