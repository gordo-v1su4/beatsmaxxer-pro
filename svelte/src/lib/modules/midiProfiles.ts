export type MidiTimingClass =
  | 'none'
  | 'scheduler-jump'
  | 'shader-envelope'
  | 'shader-gate';

export interface ModuleMidiProfile {
  timingClass: MidiTimingClass;
  trigger: string;
  velocity: 'ignored' | 'density-priority-only';
  density: boolean;
  evidence: string;
  scenario: string;
}

const none = (reason: string, scenario: string): ModuleMidiProfile => ({
  timingClass: 'none',
  trigger: reason,
  velocity: 'ignored',
  density: false,
  evidence: 'MIDI rejected; rack keeps filename/profile/active-hit/source empty.',
  scenario
});

/**
 * Exhaustive MIDI behavior for the current catalog.
 *
 * This is deliberately not inferred from category or from the presence of a
 * BEAT-looking control. A note must name the exact runtime state it changes.
 * DENS uses midiTrigger.noteFires: note index is deterministically hashed and
 * velocity biases the threshold, so louder notes survive deeper thinning; it
 * never scales effect amplitude.
 */
export const MODULE_MIDI_PROFILES: Record<string, ModuleMidiProfile> = {
  transition: none('No note consumer; TRIG/FIRE and interval scheduling own transition starts.', 'Real MP4 + audio; verify MIDI import is refused and FIRE still starts the move.'),
  speedramp: none('No note consumer; the authoritative transport curve owns playback rate.', 'Real MP4 + audio; verify MIDI import is refused and the bezier curve alone changes rate.'),
  tapdelay: none('No note consumer; LEN/HOLD/GATE operate on the transport grid.', 'Real MP4 + audio; verify MIDI import is refused and grid divisions still hold frames.'),
  timesampler: {
    timingClass: 'scheduler-jump',
    trigger: 'A note emits midi-trigger into the TimeSampler reducer and advances forcedJumpState/source slice.',
    velocity: 'ignored',
    density: false,
    evidence: 'Rack filename and parsed note identity feed AudioEngine; active schedule exposes the current MIDI hit and source=midi.',
    scenario: 'Real MP4 + audio + lead-vocal-and trupmets.mid; each parsed onset produces the same arranger tick and slice jump.'
  },
  punch: {
    timingClass: 'shader-envelope', trigger: 'Retriggers beatPulse used by SNAP to drive crash-zoom amount.',
    velocity: 'density-priority-only', density: true,
    evidence: 'Rack filename/profile plus kept active hit; triggerAge uniform; source=midi.',
    scenario: 'Real MP4 + audio + MIDI kick part; retained notes restart the zoom while dropped notes do not.'
  },
  shake: {
    timingClass: 'shader-envelope', trigger: 'Retriggers beatPulse used by IMPACT camera displacement.',
    velocity: 'density-priority-only', density: true,
    evidence: 'Rack filename/profile plus kept active hit; triggerAge uniform; source=midi.',
    scenario: 'Real MP4 + audio + percussion MIDI; retained notes strike IMPACT without changing HANDHELD/SWAY.'
  },
  orbit: {
    timingClass: 'shader-envelope', trigger: 'Retriggers beatPulse used by NUDGE in the drift-camera phase.',
    velocity: 'density-priority-only', density: true,
    evidence: 'Rack filename/profile plus kept active hit; triggerAge uniform; source=midi.',
    scenario: 'Real MP4 + audio + sparse MIDI; retained notes nudge the orbit and preserve continuous drift.'
  },
  focus: none('No note consumer; AMOUNT/BLOOM and the focus pull are continuous.', 'Real MP4 + audio; verify MIDI import is refused and focus parameters remain continuous.'),
  anamorphic: none('No note consumer; BARS/CROP/FLARE are continuous lens parameters.', 'Real MP4 + audio; verify MIDI import is refused and the lens controls still alter the frame.'),
  grain: none('No note consumer; SIZE/AMOUNT/DRIFT follow deterministic film-frame time.', 'Real MP4 + audio; verify MIDI import is refused and grain remains timeline deterministic.'),
  leak: {
    timingClass: 'shader-envelope', trigger: 'Overrides the internal firing cycle and opens the current leak event envelope.',
    velocity: 'density-priority-only', density: true,
    evidence: 'Rack filename/profile plus kept active hit; triggerAge uniform; source=midi.',
    scenario: 'Real MP4 + audio + lead MIDI; retained notes fire the selected leak geometry; AUDIO only shapes non-MIDI drive.'
  },
  dutch: {
    timingClass: 'shader-envelope', trigger: 'Retriggers beatPulse used by SNAP angle displacement.',
    velocity: 'density-priority-only', density: true,
    evidence: 'Rack filename/profile plus kept active hit; triggerAge uniform; source=midi.',
    scenario: 'Real MP4 + audio + MIDI; retained notes snap the horizon while TILT/DRIFT remain continuous.'
  },
  halation: none('No note consumer; THRESHOLD/SPREAD/TINT are highlight filters.', 'Real MP4 + audio; verify MIDI import is refused and highlight response remains picture-driven.'),
  bulge: {
    timingClass: 'shader-gate', trigger: 'Retriggers the BEAT gate that scales signed barrel/pincushion AMOUNT.',
    velocity: 'density-priority-only', density: true,
    evidence: 'Rack filename/profile plus kept active hit; triggerAge uniform; source=midi.',
    scenario: 'Real MP4 + audio + MIDI; retained notes open BEAT warp and dropped notes leave it closed.'
  },
  vhs: {
    timingClass: 'shader-gate', trigger: 'Retriggers the BEAT GLITCH gate for block and line rips.',
    velocity: 'density-priority-only', density: true,
    evidence: 'Rack filename/profile plus kept active hit; triggerAge uniform; source=midi.',
    scenario: 'Real MP4 + audio + MIDI; retained notes gate VHS rips without changing tracking/chroma/noise.'
  },
  prism: none('No note consumer; SPLIT/ANGLE/EDGE are continuous chromatic optics.', 'Real MP4 + audio; verify MIDI import is refused and prism remains edge-driven.'),
  streak: {
    timingClass: 'shader-envelope', trigger: 'Retriggers beatPulse that boosts directional streak length/energy.',
    velocity: 'density-priority-only', density: true,
    evidence: 'Rack filename/profile plus kept active hit; triggerAge uniform; source=midi.',
    scenario: 'Real MP4 + audio + MIDI; retained notes accent streaks and dropped notes do not.'
  },
  mirror: {
    timingClass: 'shader-envelope', trigger: 'Retriggers BEAT fold-plane displacement for the selected mirror geometry.',
    velocity: 'density-priority-only', density: true,
    evidence: 'Rack filename/profile plus kept active hit; triggerAge uniform; source=midi.',
    scenario: 'Real MP4 + audio + MIDI; retained notes move the fold plane without changing fold type.'
  },
  lens: {
    timingClass: 'shader-gate', trigger: 'Retriggers the BEAT gate that scales specialty-lens glass deformation.',
    velocity: 'density-priority-only', density: true,
    evidence: 'Rack filename/profile plus kept active hit; triggerAge uniform; source=midi.',
    scenario: 'Real MP4 + audio + MIDI; retained notes open the glass gate and dropped notes leave it at rest.'
  }
};

export function moduleAcceptsMidi(moduleId: string): boolean {
  return MODULE_MIDI_PROFILES[moduleId]?.timingClass !== 'none';
}
