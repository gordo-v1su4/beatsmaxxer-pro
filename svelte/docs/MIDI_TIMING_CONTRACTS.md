# MIDI timing contracts

MIDI is an explicit per-module capability. Loading a part never installs a second clock: the active module receives note ages/events projected from the authoritative audio transport. `MidiLayer.identity` is created once at parse time and the rack, runtime cache, and arranger lane all retain that same identity.

For every supported module, DENS uses the shared deterministic `noteFires(index, velocity, density)` selector. Velocity only biases which notes survive; it does not secretly scale the effect after selection. The rack and arranger both draw `firingTimes(layer, density)`, which is also the list consumed by `AppLoop`.

| Module | Class | MIDI note consumer | Velocity / DENS | Required real-media proof |
|---|---|---|---|---|
| TRANSITION | Event envelope | Resets transition pulse; TYPE and MOVE LENGTH shape it | Shared deterministic thinning | Selected transition visibly restarts on kept vocal/trumpet notes |
| SPEEDRAMP | Transport cycle | Resets rate-curve origin; LEN and Bezier MIN/MAX shape it | Shared deterministic thinning | Video rate curve restarts on kept notes after seeks |
| STUTTER | Event envelope | Opens capture gate; LEN, GATE and HOLD own freeze state | Shared deterministic thinning | Kept notes freeze; dropped notes do not |
| TIMESAMPLER | Slice event | Emits `midi-trigger`; MODE/JMP/SLIC/LOOP/RATE own slice state | Shared deterministic thinning | Kept notes produce deterministic slice jumps |
| LIGHT LEAK | Event envelope | Starts leak pass; TYPE/FREQ/HOLD/AUDIO own visible pass | Shared deterministic thinning | Selected leak geometry starts on kept notes |
| MOTION STREAK | Event envelope | Resets trail; LENGTH/ANGLE/DECAY own trail state | Shared deterministic thinning | Fresh directional trail begins on kept notes |
| PUNCH ZOOM | None | No discrete note-owned state; SNAP remains audio/beat shaping | MIDI unavailable | Real video confirms audio punch; no MIDI picker |
| HANDHELD | None | IMPACT is continuous beat shaping | MIDI unavailable | Audio impact works; no MIDI picker |
| DRIFT CAM | None | NUDGE is continuous beat shaping | MIDI unavailable | Audio nudge works; no MIDI picker |
| RACK FOCUS | None | PULSE has no discrete focus-target state | MIDI unavailable | Audio pulse works; no MIDI picker |
| ANAMORPHIC | None | Persistent crop/lens treatment | MIDI unavailable | Bars/crop remain persistent; no MIDI picker |
| FILM GRAIN | None | Persistent texture | MIDI unavailable | Grain remains persistent; no MIDI picker |
| DUTCH ANGLE | None | SNAP is continuous beat shaping | MIDI unavailable | Audio snap works; no MIDI picker |
| HALATION | None | Luminance-driven persistent bloom | MIDI unavailable | Bloom follows highlights; no MIDI picker |
| BARREL | None | BEAT gates continuous distortion | MIDI unavailable | Audio gate works; no MIDI picker |
| VHS / CAM | None | BEAT gates continuous tape damage | MIDI unavailable | Audio glitch works; no MIDI picker |
| PRISM | None | Persistent chromatic split | MIDI unavailable | Split remains persistent; no MIDI picker |
| INCEPTION | None | BEAT gates continuous folds | MIDI unavailable | Audio fold gate works; no MIDI picker |
| SPECIALTY LENS | None | BEAT gates persistent glass | MIDI unavailable | Audio lens pump works; no MIDI picker |

Rack evidence for a supported module must include source, filename, exact kept/total count, DENS, and active-hit state. Its arranger lane must expose the same `data-midi-identity`, note positions and kept count. Removing the part returns that module to audio/onset triggering.
