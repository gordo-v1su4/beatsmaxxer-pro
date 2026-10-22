# Source review follow-up

Reviewed against main `5cd2d9a`, with the current branch and follow-up changes.
Two independent review axes used the repository's code-review skill. These are
source reviews, not substitutes for runtime or release acceptance.

## Standards

No hard documented-standard violations were found. Two optional duplication
findings concerned repeated candidate-clock projection/clamping and repeated
controlled-effect membership checks. The membership checks now use the existing
`SYNC_MODULES` policy. Candidate-clock extraction remains a maintainability
judgment, not a correctness blocker.

The review also found that initial Stutter/SpeedRamp cadence exemptions could
survive an effect-layout change. The gate now records any live effect identity
change and rejects that run. Clip-source changes with stable effects remain
supported. A negative browser probe verified that the Stutter exemption cannot
hide an ordinary effect in the same slot.

## Spec

Loop lookahead did not schedule the loop-start section. The helper now plans the
wrap with separate boundary and source positions, with loop-region and normal
song-return unit coverage. Incoming ordinary sources can stage when leaving a
controlled slot. The new bank's clock ownership is applied before asynchronous
candidate warming; newly controlled slots preserve their warm clock at commit.

Completed Timing sampler-only GPU banks could duplicate Perform originals and
consume its available budget. Those banks now release on Timing exit. Sources
also used by Timing ramps remain cached. This deliberately preserves expensive
ramp reuse; an exactly identical file used by both a retained ramp and Perform
sampler can still have two caches. Usually prepared ramp variants and original
sampler files have different identities.

Incoming SpeedRamp still warms at the boundary; speculative future-ramp loading
was rejected after extended playback failed. Long-run web cadence remains open.
Follow-up source review found no additional definite correctness bugs in the
loop, ownership, cache retention, transfer or observer cleanup changes.

Findings: Standards 0 hard violations and 1 remaining optional duplication smell;
Spec 2 remaining limits (incoming ramp cold preparation and compatible shared-ramp
cache duplication). Runtime stall acceptance still fails in longer web runs.
