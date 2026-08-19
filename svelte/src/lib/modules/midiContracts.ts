export type MidiTimingClass = 'trigger' | 'modulation' | 'none';

export interface MidiTimingContract {
  timingClass: MidiTimingClass;
  consumer: string;
  velocity: string;
  density: boolean;
  proof: string;
}

const VELOCITY_SELECTION =
  'Velocity biases deterministic DENS selection toward accents; it does not scale effect amplitude.';
const SHARED_PROOF =
  'redline.wav + lead-vocal-and trupmets.mid; rack filename/source/hit and Arrange identity/count/density must agree.';
const none = (consumer: string): MidiTimingContract => ({
  timingClass: 'none', consumer, velocity: 'Not consumed.', density: false,
  proof: 'MIDI control is absent; loading a file is intentionally unavailable.'
});
const driven = (timingClass: 'trigger' | 'modulation', consumer: string): MidiTimingContract => ({
  timingClass, consumer, velocity: VELOCITY_SELECTION, density: true, proof: SHARED_PROOF
});

/** Exhaustive operator contract for every current catalog module. */
export const MIDI_TIMING_CONTRACTS = {
  transition: driven('trigger', 'Each kept note starts the selected transition move and DURATION envelope.'),
  speedramp: none('Playback rate follows its continuous CYCLE bezier; no note event has a meaningful target.'),
  tapdelay: driven('trigger', 'Each kept note captures a frame and starts the LEN/GATE/HOLD freeze window.'),
  timesampler: driven('trigger', 'Each kept note enters the authoritative slice-jump scheduler; MODE/SLIC/LOOP/RATE remain continuous controls.'),
  punch: driven('trigger', 'Each kept note starts the crash-zoom pulse; AMOUNT and SNAP shape it.'),
  shake: driven('modulation', 'Each kept note starts the IMPACT footstep/lurch envelope; HANDHELD and SWAY continue.'),
  orbit: driven('modulation', 'Each kept note starts the NUDGE envelope over the continuous DRIFT CAM orbit.'),
  focus: none('RACK FOCUS uses its continuous two-beat focus pull and has no note-routed envelope.'),
  anamorphic: none('ANAMORPHIC is a continuous presentation/look; no note-routed parameter exists.'),
  grain: none('FILM GRAIN is a continuous texture; no note-routed parameter exists.'),
  leak: driven('trigger', 'Each kept note fires the LIGHT LEAK pass; FREQ/HOLD define its tail instead of an internal firing clock.'),
  dutch: driven('modulation', 'Each kept note starts the SNAP tilt accent over continuous DRIFT.'),
  halation: none('HALATION is a continuous highlight filter; no note-routed parameter exists.'),
  bulge: driven('modulation', 'Each kept note gates the BEAT amount of the continuous BARREL warp.'),
  vhs: driven('modulation', 'Each kept note gates the BEAT glitch amount; tracking/chroma/noise remain continuous.'),
  prism: none('PRISM is a continuous chromatic split; no note-routed parameter exists.'),
  streak: driven('modulation', 'Each kept note pulses streak LENGTH over the continuous accumulation.'),
  mirror: driven('modulation', 'Each kept note gates the BEAT fold motion; fold/offset/spin remain continuous.'),
  lens: driven('modulation', 'Each kept note gates the BEAT glass amount; zoom and edge remain continuous.')
} as const satisfies Record<string, MidiTimingContract>;
