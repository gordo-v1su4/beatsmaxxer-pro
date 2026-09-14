# Timing workspace implementation plan

Resident playback and the initial workspace are implemented and functionally verified, September 13, 2026. **Musical trigger follow-up implemented:** finite burst scheduling, source selection, chance/gap, groove, ramp shapes and range controls now use the saved R&D contracts. The configuration audit below describes the original gap; the follow-up evidence supersedes its outstanding status. Live hardware MIDI and extraction from arbitrary raw stems remain outside this implementation. Work branch: `codex/timing-workspace-refresh`, based on the benchmark branch. See [current integration evidence](TIMING-WORKSPACE-VERIFICATION.md) for the measured playback checks and their limits. Preserve unrelated working-tree changes.

**User constraint: do not rerun benchmarks.** Reuse existing evidence in this project and the sibling ZigSwap project. This overrides earlier instructions to repeat benchmarks or perform new performance soaks, including the verification wording in the active goal.

Latest verification clarification: validate the integrated playback in the actual app against the saved benchmark results, as requested by the user. Reuse existing media and scenarios for focused production integration checks; record actual app behavior and compare like-for-like conditions where possible. Do not rerun the old standalone benchmark suite or replace its historical data. Unit tests may support correctness, but are not a substitute for actual app playback verification. Report measured differences and non-comparable conditions honestly; matching results is a goal, not an assumed fact.

## Revised completion goal

Implement this plan end to end with benchmark-derived resident GPU playback as the first priority. Deliver the dedicated Timing workspace with per-clip Ramp OR Stutter, editable reference-matched curves and measure numbering, interpolated-source playback support, the existing visual style and sidebars, ten 16:9 previews, shared song-section looping, Hold/Linear/Random clip ordering and PGM 0–9 keyboard/click parity. Keep Perform and Timing separate for this version. Verify the integrated playback in the real GPU app against saved Beatsmaxxer/ZigSwap results, including source correctness, loading/capacity handling and resource cleanup. Fix discrepancies within scope and report remaining evidence limits. Do not declare completion for a mockup, a disconnected UI or unit tests alone. Global/cross-clip ramping, combined visual effects, clip collections and media replacement remain deferred. Use Bun/Bunx and uv; preserve unrelated work.

## Confirmed first-version scope and priority

The primary deliverable is the benchmark-derived resident GPU playback behavior in the actual app. The Timing UI exists to edit and use that playback, not as an independent UI-only milestone that can substitute for engine integration. Reuse the existing tests' playback approach and interpolated source-media capabilities; initial ramp tuning can be iterative.

Perform and Timing are separate processing alternatives for this version: use the existing broad-effects Perform workspace OR the new Ramp/Stutter-only Timing workspace. Do not automatically chain Timing into Perform effects. A future workflow that writes out or passes timed clips into additional effects is deferred. Both keep their settings. Returning to Timing joins the current song position; it does not integrate the entire time spent in Perform. Resident banks remain available until removal, capacity change or engine disposal.

Implementation priority: establish the benchmark-to-production playback contract and integrate that engine alongside the existing planned Timing controls. The phase list below groups work by concern; it is not permission to finish UI while leaving playback disconnected.

## Design references

The actual Perform screen with controls minimized and both side menus visible is the workspace authority. Preserve its charcoal palette, typography, controls, side-menu widths and program viewer. Ten slots, two rows of five, with true 16:9 viewers. Generated mockups are supporting sketches only.

For the curve itself, use `../audio-ui-curves/soundtouch-envelope-studio/src/components/CurveEditor.tsx`, `src/lib/envelope.ts`, and `src/types.ts`. The user requests its exact curve aesthetics: line weight, hollow dot size, anchor density, spacing, grid and measure numbering, and how points can be rearranged. Its surrounding controllers are NOT the reference. Run it and compare visually at equivalent sizes before building the curve editor; source inspection alone is not visual acceptance. Retain Beatsmaxxer colors and shell.

Verified reference details: curve stroke 1.5 SVG units; anchor radius 2; anchor stroke 1, increased by 0.35 for the active lane. Account for SVG scaling when matching perceived screen size. Dense sampled paths are separate from sparse editable anchors. Clicking empty space adds a point, dragging moves it, double-clicking deletes it. Snapping supports Off/Bar/Beat/16th/32nd. Evaluators support linear, smooth, tension and hold. Preserve musical measure/beat labeling and grid hierarchy after inspecting the rendered reference. Do not port its React shell, SoundTouch audio engine, or multiplier/key/tempo lanes.

## Settled requirements

- Compact Perform / Arrange / Timing navigation. Between Perform and Timing retain top bar, FX/Clips library, PGM rail and program viewer; change the main editing area. No extra column.
- Timing uses minimized preview cards and one collapsible bottom editor with Ramp / Stutter tabs. Keep Perform collapse state independent. Current Min All also hides rails: do not inherit that behavior.
- Add an Intro / Verse / Chorus strip above previews sharing Arrange section boundaries and song-loop state. It is section rehearsal navigation, not another arrangement timeline.
- First version: Per Clip timing only. Each slot uses Ramp OR Stutter (plus bypass/Off), retaining settings when switching. Global timing and ramps spanning source cuts are deferred; do not show an active Global selector in this version. This user decision supersedes the original global/per-clip scope in the goal.
- Latest UI clarification: alternate Speedramp and Stutter/Jump defaults across slots 0–9, including the row boundary. Use the existing Speedramp accent for ramps and Timesampler accent for stutter/jump cuts; do not inherit the original Perform slot's color. Preserve explicitly edited clip settings.
- Timing sources use S0–S9 throughout the rail, module heading and editor. Filenames stay in the existing patch row and hover text. Use no whole-card selection outline. Mark attached verified interpolated media as `4× RIFE`; ordinary or unverified media is `BASE`. High frame rate or a filename alone does not prove RIFE provenance. The current hash registry covers the four saved benchmark variants; general metadata/import support remains future work.
- Effect cycles do not rewind footage. Distinguish effect-cycle length, song-section looping and future source-loop regions. In 4/4, one bar is four beats.
- Display the selected clip's real runtime phase/rate on the ramp. Cross-clip curve history and global speed continuity are deferred with Global mode.
- Top-bar Clip Order: Hold / Linear / Random. Cut interval and quantization remain separate. Linear follows eligible slot order; Random chooses another eligible slot; Hold disables automatic advancement. Manual queued selection takes priority. Handle zero/one eligible source safely.
- Remove top-level Presets for this refresh. Keep Edit; its parameter randomization differs from random clip ordering. Keep timing shape choices inside the editor without a new preset browser.
- PGM labels and keyboard digits must match 0–9: zero selects first slot, nine tenth. Click and key use the same quantized queue and on-air feedback. Ignore editable fields, modified shortcuts, held-key repeats and unavailable slots. Apply to Perform and Timing.

## Implementation phases

### 1. Faithful shell

Extend `rackUi.ts` and `+page.svelte`, reusing actual RackSlot/EffectModule/CompactModule styling and components. Preserve canvas IDs and rendering ownership; avoid duplicate loops or media reloads on page changes. Lift Arrange's local section selection into shared state alongside its existing loop region.

Review an actual app screenshot against the supplied minimized screenshot: both rails, ten 16:9 previews, section strip, shared editor open/collapsed and compact navigation. A generated approximation is insufficient.

### 2. Timing identity and routing

Add versioned slot-keyed local timing state; reserve a future extension for global timing without exposing or implementing it now. Repeated timing effects must not depend on the one-instance-per-effect catalog. Audit `pgm.ts`, `PgmDirector.ts`, audio scheduling and recorder consumers; adapt effect-keyed routing to stable slot identity without breaking Perform. Implement ordering and digits through the same selection path.

Persist each slot's Ramp and Stutter configurations using the existing project/session mechanism. Do not tie clip identity to filenames or effect labels. Workspace and effect selection changes must retain settings.

### 3. Shared curve editor

Use normalized cycle positions with musical labels and an explicit speed scale including 1x. Implement point add/select/drag/delete, snap, segment shape, endpoint protection and explicit coincident-point behavior. One drag is one undo gesture. Enlarge invisible hit targets instead of visible dots. Preserve sparse editable anchors over a smooth densely sampled curve.

Use one evaluator for runtime and drawing. Preserve existing Bézier preset meaning via a compatibility representation rather than silently changing it to the reference's tension interpolation. Validate exact curve appearance, numbered measures and drag feel against the running SoundTouch reference. Stutter receives rhythm/hold/jump controls appropriate to its behavior. Live indicators come from actual runtime state.

### 4. Production resident-frame integration

Extract reusable loading/frame lookup/disposal from `qa/benchmark/gpu-bank.ts`; do not ship the fixture-specific deck unchanged. Support imported media timestamps, cancellation, errors, unload cleanup and device loss. Separate source position, timing phase and PGM selection. Integrate speed over elapsed time and select resident frames; stutter/jumps use the same source-clock contract.

Preflight GPU memory and expose readiness/capacity errors. Ten short clips are not guaranteed to fit. Estimate dimensions × frame count × bytes per pixel and measure overhead. Any proxy/fallback must be explicit, not silently included in resident-only claims. Connect to existing preview/program texture presentation without unnecessary CPU copies.

Define seek and backwards song-loop re-anchoring explicitly. Preserve current source progression where compatible; do not promise identical footage on each loop without a source-region design.

### 5. Verification

Use Bun. Cover all ten digit mappings, typing protection, click/key parity, ordering eligibility, queue priority, effect-setting preservation, independent local settings, no unintended restart on PGM cuts, no cycle-boundary rewind, interpolation/snap correctness, preset compatibility, seek/loop behavior and resource disposal.

On the GPU desktop with actual clips verify state-preserving page switches, visible rails, 16:9 viewers, accurate live graph, shared Arrange section loops and actual cut history. Repeated load/unload must not grow resources indefinitely.

Use existing benchmark reports and saved data from this repository and the sibling ZigSwap project for performance evidence. Do not rerun benchmark cases, launch performance soaks, or generate replacement performance measurements. Keep original run conditions and distinguish recorded results from unmeasured production behavior. Ordinary functional tests and UI/runtime correctness checks remain in scope; they must not become disguised benchmark reruns. Report existing evidence gaps explicitly instead of running benchmarks to fill them. Report pre-existing check failures separately.

## Runtime behavior implemented

1. Ramp and Stutter remain separate, one active effect plus Off per slot, retaining both configurations. Per Clip only. Bypass remembers the last active effect across persistence and page switches.
2. Timing and Perform are separate processing alternatives. Timing does not feed Perform's visual-effect chain. Returning to Timing rejoins the current song position, retaining its bank and settings rather than integrating the entire inactive interval.
3. Off-air clips advance independently on the song clock. PGM cuts do not restart a clip or its effect. Effect cycles repeat while source position advances and wraps at the source end. Seeking or wrapping the song section reanchors source position to the new song position; this does not promise exact historical visual replay. Source in/out regions remain deferred.

## Configuration audit and outstanding trigger work — September 13

Read this section before claiming Zig-swap behavior parity or extending Timing triggers. Reference task: **Fix decoder and fixture validation**, `01a0937b-95ed-7762-ac9e-f70d84f5e2f4`, in `../zig-swap`. The actual **02 / CONFIGURATION** panel is `../zig-swap/web/musical-benchmark.html:180`; behavior lives in `web/src/benchmark/schedule.ts`, signal selection in `web/src/benchmark/main.ts`, and accepted checkpoints in `docs/musical-playback-benchmark.md`.

The current `runtime/timing/clock.ts` applies continuous repeating ramps/stutters. Its Stutter fields are division, repeats, repeat/hold/jump mode and jump slices. It has no trigger-source selection, groove, chance, cooldown or normal-playback gaps. The PGM STR8/SWNG/DOT buttons affect source switching, not these repeats. TimingPanel's diagonal/flat/stepped symbols only identify repeat/hold/jump; the highlighted box follows cycle phase. They are not event traces or measured curves.

Verified reference behavior:

Local inputs are already present: `test_media/Redline (Remastered) Stems/` contains nine WAV stems and seven MIDI stems, inventoried in `svelte/tests/fixtures/media/manifest.json`. `svelte/.artifacts/benchmark-fixtures/benchmark/` contains `redline-midi.json`, `redline-analysis.json` and the matching `redline.mp3`. The prepared analysis covers mix/vocals/synth/bass, with a source hash and tempo map; preserve that provenance when connecting the full-song WAV. These inputs need routing, not regeneration or another benchmark run.

- Configuration exposes prepared Redline MIDI, analyzed mix onsets, vocal onsets, separate vocal/synth/bass onsets, vocal phrase starts and RMS peaks. These are distinct signals. RMS is relative amplitude, not LUFS; vocal phrase starts come from an isolated stem gate, not speech recognition.
- MIDI/analyzed events start finite stutter bursts. Triggers arriving inside the active burst coalesce; normal source playback resumes afterward. There is no universal user-adjustable Stutter probability in this panel.
- Independent triggered ramps use a seeded **40%** selection of eligible events, finish before another starts, then play at 1x. The reference adds a 120 ms post-ramp block. Its continuous ramp fallback applies only without a trigger stream. This is different from the current production continuous cycle.
- Groove is Straight or Varied in the panel; legacy/dense patterns exercise straight, 2:1 swing and dotted subdivisions. `buildMidiSchedule` currently uses straight `startBeat + repeat * step` regardless of the Groove selector. Implement the requested explicit STR8/SWNG/DOT behavior consistently instead of copying this reference limitation.
- Named MIDI/stem sources use prepared, track-specific Redline data. Arbitrary local-audio upload disables that source selector and uses `localAudioGrid` energy-rise events with user BPM; if none are found it explicitly uses a manual beat stream. This is not an arbitrary stem-import or live-MIDI implementation.

Next implementation requirements (not implemented by this audit):

1. Share a slot-keyed event gate between Ramp and Stutter while retaining one active effect per slot. Separate trigger source, burst repetition division, groove, repetitions, **Chance %**, and **minimum gap after a burst**. For a beat source expose an **Every N beats/bars** interval; event sources use sensitivity/threshold plus chance and gap. Chance means percent of eligible events, not percent of song time. Finish active bursts without restarting them, then resume ordinary footage at 1x; preserve source continuity at ramp exits.
2. Route available song/MIDI/stem data through a common timestamped event representation with stable identity, strength, source and track provenance. Show missing-data states and the exact selected stem/track. Reuse saved Redline fixtures for comparison without assuming they match another upload or time offset. Distinguish imported MIDI notes from live hardware MIDI; live devices are not proven by the benchmark.
3. Keep PGM order/cut rhythm separate from effect triggers. Independent slot decisions must survive cuts and remain reproducible for a seed. Specify reset/reconstruction on seeking and song-section looping, and handle edits during an active burst without jumps or stuck states.
4. Replace decorative Stutter symbols with a beat-labeled event strip showing accepted triggers, repeated slices, normal-playback gaps and a live playhead. Label the active source and state (waiting / burst / gap); show effective repeat spacing for STR8/SWNG/DOT. Use the existing Perform shell and shared preview badge with Speedramp/Timesampler colors.
5. Verify 0% and 100% chance, seeded independence, finite bursts, no overlapping retriggers, enforced gaps, straight/swing/dotted boundaries, missing data, seek/loop resets and persistence. In @Browser use the loaded song and saved MIDI/analysis evidence to verify event-to-burst behavior and uninterrupted resident rendering. Existing residency/cut tests do not prove this gate. Do not rerun standalone benchmarks, interpolation jobs or soaks.

## Later, outside this refresh

- Global timing mode and a ramp spanning cuts between clips.

- Clip collections/bins inside the Clips library: named thumbnail groups, possibly compact colored boxes, for Intro, Verse, Chorus and custom groups. Explore drag/drop organization; no extra column and no committed folder-tree design yet.
- Replacing/swapping videos and future collection-driven selection. Do not automatically bind collections to song sections yet.
- Combining Timing output with additional Perform effects, including writing out or passing timed clips between the two workflows.
- Source in/out loop regions and exact repeatable visual phrases.
- Full performance recording, parameter automation, deterministic replay and broader Arrange redesign.
- Broader preset management and unrelated effects.

Completion means connected, verified timing playback plus the faithful workspace. A mockup or a new tab alone is insufficient. Keep UI acceptance and performance evidence separate.
