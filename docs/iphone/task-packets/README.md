# Implementation Task-Packet Template

Copy this template into a new file named `{story-id}-{short-slug}.md`. Replace every bracketed value. A task is not ready to delegate while any required field remains undecided.

```markdown
# {STORY-ID} — {Outcome}

## Objective

{One observable end state.}

## Dependencies

- {Completed story or contract}

## Read first

- {Maximum three directly relevant documents/files}

## Allowed scope

- {Exact directories/files the implementer may change}

## Forbidden scope

- Do not change public contracts unless this task explicitly defines the change.
- Do not modify web/desktop behavior unless listed in Allowed scope.
- Do not add adjacent features.

## Required behavior

1. {Decision-complete behavior}
2. {Decision-complete behavior}

## Interfaces

- Inputs: {types/commands/files}
- Outputs: {types/events/files}
- Errors: {named structured outcomes}
- Thread/queue ownership: {if applicable}

## Edge cases

- {Concrete edge case and required result}

## Acceptance checks

- [ ] {Automated test and expected result}
- [ ] {User-visible or physical-device evidence}
- [ ] No changes outside Allowed scope.

## Commands

```text
{Exact non-interactive commands}
```

## Stop condition

Stop when the acceptance checks pass. If a required contract is missing or contradicted, report the blocker; do not invent a replacement architecture.

## Handoff response

- Files changed
- Tests and results
- Evidence paths
- Known risks
- Next eligible story ID
```

## Model allocation guidance

Small or inexpensive models are suitable for contract fixtures, reducer tests, documentation synchronization, error-copy tables, and isolated SwiftUI components with frozen inputs.

Use the strongest available implementation model for audio-clock anchoring, iOS/Rust FFI ownership, IOSurface/Metal/wgpu interop, decoder lifetime, deterministic export, and physical-device performance diagnosis.
