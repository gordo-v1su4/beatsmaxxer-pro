# MIDI control contracts

MIDI is module-owned and opt-in by file load. Loading a supported module's file selects `MIDI`; removing it selects `AUD`. `DENS` deterministically keeps or drops the same indexed notes in the rack, runtime, and Arrange profile. Velocity biases that keep/drop decision toward accents; it never changes effect amplitude. Paused transport never displays a hit, seek recomputes from the new transport position, and the part repeats at its own duration.

All supported rows use the physical acceptance scenario `redline.wav` + `lead-vocal-and trupmets.mid`: the rack filename, selected source, active hit, note count, and density must match the Arrange lane published from the exact same parsed notes array.

| Module | Class | Note consumer / state |
|---|---|---|
| TRANSITION | Trigger | Starts the selected move and DURATION envelope. |
| SPEEDRAMP | None | Continuous CYCLE bezier; no meaningful note target. |
| STUTTER | Trigger | Captures a frame and starts LEN/GATE/HOLD. |
| TIMESAMPLER | Trigger | Enters the authoritative slice-jump scheduler. |
| PUNCH ZOOM | Trigger | Starts crash-zoom AMOUNT/SNAP. |
| HANDHELD | Modulation | Starts IMPACT lurch; HANDHELD/SWAY continue. |
| DRIFT CAM | Modulation | Starts NUDGE over continuous drift. |
| RACK FOCUS | None | Continuous two-beat pull; no note envelope. |
| ANAMORPHIC | None | Continuous presentation/look. |
| FILM GRAIN | None | Continuous texture. |
| LIGHT LEAK | Trigger | Fires a pass; FREQ/HOLD define its tail. |
| DUTCH ANGLE | Modulation | Starts SNAP over continuous DRIFT. |
| HALATION | None | Continuous highlight filter. |
| BARREL | Modulation | Gates the BEAT warp amount. |
| VHS / CAM | Modulation | Gates BEAT glitch; tape controls continue. |
| PRISM | None | Continuous chromatic split. |
| MOTION STREAK | Modulation | Pulses streak LENGTH over accumulation. |
| INCEPTION | Modulation | Gates BEAT fold motion. |
| SPECIALTY LENS | Modulation | Gates BEAT glass amount. |

The executable copy of this table is `src/lib/modules/midiContracts.ts`; the catalog test requires exactly one contract for every current module and prevents a `None` module from accepting a dead MIDI file.
