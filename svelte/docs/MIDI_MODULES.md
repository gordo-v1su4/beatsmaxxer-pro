# Per-module MIDI contract

MIDI is not a generic clock for the rack. The authoritative table is
`src/lib/modules/midiProfiles.ts`; tests require one entry for every catalog
module. Files are rejected for modules whose timing class is `none`.

For DENS-enabled modules the kept/dropped rule is shared and deterministic:
`noteFires(index, velocity, density)` hashes the note's stable parsed index and
uses velocity only to bias survival. Velocity never scales effect strength.
The same parsed note identity (filename, note index, pitch, velocity, written
beat, and playback seconds) must back the rack lane, active-hit readout, runtime
trigger and arranger projection; none of those surfaces may re-parse or
re-quantise the file independently.

| Module | Timing class | Note changes | Velocity / DENS |
|---|---|---|---|
| TRANSITION | none | No consumer; FIRE/interval starts moves | rejected |
| SPEEDRAMP | none | Transport bezier owns playback rate | rejected |
| STUTTER | none | Transport LEN/HOLD/GATE owns holds | rejected |
| TIMESAMPLER | scheduler-jump | `midi-trigger` advances forced slice jump state | velocity ignored; no DENS |
| PUNCH ZOOM | shader envelope | SNAP crash-zoom pulse | velocity prioritises deterministic DENS |
| HANDHELD | shader envelope | IMPACT displacement pulse | velocity prioritises deterministic DENS |
| DRIFT CAM | shader envelope | NUDGE phase pulse | velocity prioritises deterministic DENS |
| RACK FOCUS | none | Continuous focus filter | rejected |
| ANAMORPHIC | none | Continuous BARS/CROP/FLARE | rejected |
| FILM GRAIN | none | Deterministic film-frame time | rejected |
| LIGHT LEAK | shader envelope | Opens current leak event, overriding its cycle | velocity prioritises deterministic DENS |
| DUTCH ANGLE | shader envelope | SNAP angle pulse | velocity prioritises deterministic DENS |
| HALATION | none | Picture-driven highlight filter | rejected |
| BARREL | shader gate | Opens BEAT warp gate | velocity prioritises deterministic DENS |
| VHS / CAM | shader gate | Opens BEAT GLITCH rip gate | velocity prioritises deterministic DENS |
| PRISM | none | Continuous chromatic optics | rejected |
| MOTION STREAK | shader envelope | Accents streak length/energy | velocity prioritises deterministic DENS |
| INCEPTION | shader envelope | Moves BEAT fold plane | velocity prioritises deterministic DENS |
| SPECIALTY LENS | shader gate | Opens BEAT glass-deformation gate | velocity prioritises deterministic DENS |

Each profile also names its rack evidence and the real MP4 + audio + MIDI
scenario required for acceptance. A filename alone is never proof: acceptance
requires the timing profile, selected source, deterministic kept hit, active
hit, matching arranger projection, and visible effect response.
