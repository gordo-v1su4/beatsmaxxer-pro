export type ModuleTimingClass = 'event-envelope' | 'transport-cycle' | 'slice-event' | 'none';

export interface ModuleTimingContract {
  moduleId: string;
  timingClass: ModuleTimingClass;
  midiConsumer: boolean;
  noteTrigger: string;
  velocity: string;
  density: string;
  evidence: string;
  scenario: string;
}

const sharedDensity = 'DENS applies; noteFires(index, velocity, DENS/100) deterministically keeps accents and drops quieter notes; UI and runtime consume firingTimes(layer, density).';
const sharedEvidence = 'Rack shows source, filename, kept/total count, DENS and active hit; arranger projects the same MidiLayer.identity and firingTimes list.';

const supported = (
  moduleId: string,
  timingClass: Exclude<ModuleTimingClass, 'none'>,
  noteTrigger: string,
  scenario: string
): ModuleTimingContract => ({
  moduleId,
  timingClass,
  midiConsumer: true,
  noteTrigger,
  velocity: 'Velocity affects deterministic keep/drop only; surviving notes trigger at full effect strength.',
  density: sharedDensity,
  evidence: sharedEvidence,
  scenario
});

const unsupported = (moduleId: string, reason: string, scenario: string): ModuleTimingContract => ({
  moduleId,
  timingClass: 'none',
  midiConsumer: false,
  noteTrigger: reason,
  velocity: 'Not applicable; MIDI import is unavailable.',
  density: 'Not applicable; no dead DENS control is exposed.',
  evidence: 'Rack exposes no MIDI picker and stores no MidiLayer; arranger therefore exposes no contradictory lane.',
  scenario
});

const contracts: ModuleTimingContract[] = [
  supported('transition', 'event-envelope', 'A kept note resets transition beatPulse; TYPE selects the move, MOVE LENGTH/DURATION shapes its note envelope.', 'Real video + Redline + vocal/trumpet MIDI: each kept note visibly restarts the selected transition.'),
  supported('speedramp', 'transport-cycle', 'A kept note resets the speed-ramp cycle origin; LEN and the Bezier MIN/MAX curve determine playback-rate state.', 'Real video + Redline + MIDI: seek across notes and verify each kept note restarts the same rate curve.'),
  supported('tapdelay', 'event-envelope', 'A kept note opens the STUTTER gate; LEN, GATE and HOLD determine the captured-frame state.', 'Real video + Redline + MIDI: kept notes freeze, dropped notes do not, and playback resumes after GATE.'),
  supported('timesampler', 'slice-event', 'A kept note is a midi-trigger event selecting/restarting the current slice; MODE, JMP, SLIC, LOOP and RATE determine slice playback.', 'Real video + Redline + MIDI: kept notes produce deterministic slice jumps and dropped notes produce none.'),
  supported('leak', 'event-envelope', 'A kept note starts the leak pass; TYPE is geometry while FREQ/HOLD and AUDIO shape the visible pass.', 'Real video + Redline + MIDI: each kept note starts the selected leak geometry for the configured hold.'),
  supported('streak', 'event-envelope', 'A kept note resets the streak envelope; LENGTH, ANGLE and DECAY determine trail state.', 'Real video + Redline + MIDI: kept notes create fresh directional trails with deterministic decay.'),
  unsupported('punch', 'PUNCH currently follows the audio/beat envelope; SNAP is not wired as a discrete MIDI event consumer.', 'Real video + Redline confirms audio punch; MIDI picker must be absent.'),
  unsupported('shake', 'HANDHELD IMPACT is continuous beat shaping, not a discrete note-owned state.', 'Real video + Redline confirms impact response; MIDI picker must be absent.'),
  unsupported('orbit', 'DRIFT CAM NUDGE is continuous beat shaping, not a note-owned camera cue.', 'Real video + Redline confirms drift/nudge; MIDI picker must be absent.'),
  unsupported('focus', 'RACK FOCUS PULSE has no discrete focus-target state per note.', 'Real video + Redline confirms audio pulse; MIDI picker must be absent.'),
  unsupported('anamorphic', 'ANAMORPHIC is a persistent lens/crop treatment with no rhythmic event consumer.', 'Real video confirms persistent bars/crop; MIDI picker must be absent.'),
  unsupported('grain', 'FILM GRAIN is a persistent texture with no meaningful note event.', 'Real video confirms persistent grain; MIDI picker must be absent.'),
  unsupported('dutch', 'DUTCH SNAP is continuous beat shaping and has no note-owned angle state.', 'Real video + Redline confirms audio snap; MIDI picker must be absent.'),
  unsupported('halation', 'HALATION is a luminance-driven persistent bloom with no note event.', 'Real video confirms highlight bloom; MIDI picker must be absent.'),
  unsupported('bulge', 'BARREL BEAT gates a continuous distortion; it has no discrete MIDI consumer.', 'Real video + Redline confirms beat-gated distortion; MIDI picker must be absent.'),
  unsupported('vhs', 'VHS BEAT gates continuous tape damage; it has no discrete MIDI event state.', 'Real video + Redline confirms beat glitch; MIDI picker must be absent.'),
  unsupported('prism', 'PRISM is a persistent chromatic split with no rhythmic event consumer.', 'Real video confirms split/angle/edge; MIDI picker must be absent.'),
  unsupported('mirror', 'INCEPTION BEAT gates a continuous fold; it has no discrete MIDI fold-state transition.', 'Real video + Redline confirms beat-gated fold; MIDI picker must be absent.'),
  unsupported('lens', 'SPECIALTY LENS BEAT gates persistent glass; it has no discrete MIDI lens state.', 'Real video + Redline confirms beat pump; MIDI picker must be absent.')
];

export const MODULE_TIMING_CONTRACTS: Record<string, ModuleTimingContract> = Object.fromEntries(
  contracts.map((contract) => [contract.moduleId, contract])
);

export function timingContract(moduleId: string): ModuleTimingContract | undefined {
  return MODULE_TIMING_CONTRACTS[moduleId];
}

export function moduleAcceptsMidi(moduleId: string): boolean {
  return timingContract(moduleId)?.midiConsumer === true;
}
