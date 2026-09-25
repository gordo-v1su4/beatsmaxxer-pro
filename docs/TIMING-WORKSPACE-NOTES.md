# Timing workspace notes

## Deferred responsive-layout follow-up — September 24, 2026

- Perform crops its module grid and controls when the browser is narrowed. Observed during live resizing; defer the fix at the user's request.
- Make the Perform controls and preview grid adapt together while keeping controls readable and reachable. Do not solve this by shrinking all buttons indiscriminately.
- Preserve the main program viewer's height rules. Reclaim unused preview-card space without stretching or cropping video.
- Recheck both workspaces at narrow and short desktop sizes, including expanded Timing controls. The user's current Timing resize looked good, but an earlier automated size sweep showed possible preview/card overflow at shorter heights; reproduce with stable viewport measurements before declaring all responsive sizes verified.
- This note records outstanding work, not completed acceptance. Long capacity/performance checks remain deferred under the no-benchmark/no-soak constraint.

Detailed handoff: [Timing workspace plan](./TIMING-WORKSPACE-PLAN.md). This supersedes earlier exploratory mockup details.

## Next UI refresh

Work branch: `codex/timing-workspace-refresh`, based on the existing benchmark branch.

- Include the PGM 0–9 labels and keyboard selection below in this refresh, not a separate forgotten follow-up.
- Inspect the existing module-collapse / Min All presentation first and reuse its real components and styling as the starting point.
- Keep both side menus visible and at their existing widths. Current `setMinimalPerformView` retracts both rails as well as collapsing modules; the Timing presentation must not inherit that rail-hiding behavior.
- Add Timing alongside Perform and Arrange. Between Perform and Timing, retain the common top bar, FX/Clips browser, PGM source panel, and program viewer; change the main editing area.
- Use 16:9 clip previews and one collapsible shared timing editor with an exclusive workspace-wide Global / Per Clip selector, without mixed overrides. Preserve Perform's own collapse state when switching views.
- Add a compact shared song-section strip for selecting and looping Intro/Verse/Chorus, using Arrange's section and loop state rather than a second independent song sequencer.
- Show the selected clip's effect-cycle position and playback rate on its ramp graph. Keep song-section looping distinct from effect cycles and source-video loops.
- Keep existing continuous source advancement for speed ramps. Repeating the effect cycle must not automatically restart the video.
- Keep PGM's role unchanged for now; it selects clip slots even when their timing effects match. Do not add a column or replace it with the speculative timing-preset browser from an earlier mockup.
- Recording complete performances, exact replay of random choices, source-loop regions, and a broader preset redesign remain separate design discussions.

UI mockups are exploratory. Per-clip timing state and the preloaded-texture playback integration still require implementation; adding a tab alone does not deliver independent per-clip effects.

## Requested follow-up: PGM numbering and keyboard control

Recorded September 13, 2026. Requirement only; not implemented.

- Label the ten PGM source slots **0 through 9**, replacing the displayed 1 through 10 numbering.
- Pressing a digit selects the PGM slot with that same visible digit: 0 selects the first slot, 9 selects the tenth.
- Keyboard selection must use the same source-selection and beat-quantization behavior as clicking the corresponding PGM button, including queued and on-air feedback.
- Apply consistent labels and bindings across Perform and the proposed Timing workspace. Source identity remains the clip slot, not its effect type.
- Do not trigger source changes while entering text or numbers in an input, editing content, or using modified keyboard shortcuts. Ignore held-key repeats and unavailable slots.
- Verify all ten mappings, click/keyboard parity, quantized switching, and editable-field protection when implementing.

The current source inspection did not find a digit-key PGM binding. Verify the complete event path before implementation rather than assuming existing support.

## Grill-with-docs: workspace relationship

User constraint: no benchmark reruns. Use the existing Beatsmaxxer Pro and ZigSwap reports/data. No new benchmark runs or performance soaks; retain functional implementation checks without regenerating performance measurements. This supersedes older plan/goal wording requesting benchmark repetition.

User clarification: Timing is a dedicated workspace containing Ramp and Stutter, while the existing Perform workspace retains its broader visual effects. The benchmark-derived playback integration is essential to Timing; initial ramp tuning need not be perfect. Interpolated source media from the RIFE tests is also part of the intended playback capability.

Resolved by the user: the first version offers Perform OR Timing as separate processing alternatives. Combining timing with additional visual effects, writing out timed clips, or passing them onward is later work. Benchmark-derived GPU playback is the number-one priority; the UI is its editing surface. Initial ramp tuning can remain iterative. Preserve workspace settings; transition behavior between active workspaces remains to be defined.

Read-only benchmark evidence review: RIFE inputs were interpolated offline, not generated by live browser inference. The saved Beatsmaxxer remap result `svelte/.artifacts/playback-benchmark/1789252260630-gpu-bank-8-remap-42.json` used the speed-ramp profile (0.5x–2x); it should not be cited as a sustained quarter-speed test. Quarter-speed scheduling and 96fps source / 24fps output support are present in the harness. See `docs/PLAYBACK-BENCHMARK.md` and sibling `../zig-swap/docs/musical-playback-benchmark.md` for original conditions and evidence. No new benchmarks were run.

Q3 resolved: Ramp and Stutter are separate, one active effect per slot. First version is Per Clip only; Global mode and cross-clip ramps move to later work. This supersedes earlier Global/Per Clip requirements, including the original goal wording.
