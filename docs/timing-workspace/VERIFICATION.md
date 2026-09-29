# Timing workspace integration evidence

September 13, 2026, local `codex/timing-workspace-refresh`. This records focused checks in the actual app through the Codex in-app Browser. No standalone benchmark suite, interpolation job or performance soak was rerun. Historical benchmark data remains unchanged.

**Current scope:** resident rendering plus finite musical triggers are implemented and checked below. Earlier sections retain the historical continuous-only audit. The follow-up supersedes those outstanding-control notes; it does not establish identical performance on an untested M3 browser.


## Musical trigger and header follow-up (September 13 evening)

The shared Timing trigger controls now select beat grid, MIDI notes, mix onsets, vocal onsets, stem onsets, vocal phrase starts, RMS peaks or explicit Continuous playback. Channel selection can rotate by slot or use one channel. Threshold, independent Ramp/Stutter chance sliders, minimum post-burst gap and seed apply across slots. Per-clip effects remain independent; this is shared event configuration, not a cross-clip ramp. Active bursts and cooldowns reject events before chance is evaluated. Therefore 50% means a one-in-two chance per eligible event, not exactly half the final number of bursts.

Finite schedules preserve normal playback between bursts and deterministic source positions on seeks. Ramp exit continues from its integrated end position. Stutter repeats/holds an anchor or uses seeded Jump Cut slices, with straight, swung or dotted subdivisions. The editor shows accepted bursts, repeat boundaries, empty normal-playback gaps, a numbered four-bar song ruler and a live playhead. Fourteen ramp shapes include the twelve Perform cubic shapes plus saved R&D cosine and smash; editable min/max adjusts actual rates. Exact HOLD boundaries were corrected while checking SMASH.

Saved Redline song, MIDI JSON and analysis JSON load through the dev-only LOAD REDLINE SONG + TRIGGERS action. The loader verifies matching audio SHA256 and binds prepared inputs to the current song generation, preventing stale triggers after song replacement. Imports support MIDI or prepared analysis JSON with matching audio, optionally MIDI JSON. This does not implement live hardware MIDI or extract new features from arbitrary raw WAV stems. Missing data is reported rather than silently substituting random triggers. Prepared inputs are held in memory and must be reloaded after refresh.

Focused checks: 30 tests across six files pass. Tests compare ten independent ramp schedules and MIDI Jump Cut source mapping directly with existing vendored R&D pure functions, including accepted event timestamps, rate/source samples and post-burst continuity. This is a correctness comparison, not a rerun of the standalone benchmark. Production build passes. Svelte check retains the same nine pre-existing errors and fourteen warnings; no new Timing or shared-header errors.

Actual @Browser checks on the desktop: saved MIDI channels contained 573 vocal, 1445 synth and 349 bass events. Mix onsets contained 942 events; vocal onsets 630; stem channels 630/314/249; vocal phrases 40; RMS peaks 372. All six prepared sources produced accepted schedules through the real source menu. Straight/swing/dotted behavior is covered by pure tests and swung Jump Cut was exercised through the UI. The Perform-style Stutter chance slider was set to 50 through keyboard input and confirmed in settings.

During a 9.933-second actual-song playback sample at 60 FPS output, five random PGM cuts occurred; burst, gap and waiting states were observed. All ten source timestamps advanced, every slot used the resident path, legacy videos remained paused, and no additional frame uploads occurred. Texture allocation stayed flat at 6.498456 GiB. This short integration observation does not prove an end-to-end 99% benchmark target or M3 frame pacing.

LAPTOP 540p explicitly resizes frames once during preload and selects an 8 GiB budget with 60 FPS output. All ten original clips loaded at 960x540 and 6.50 GiB, compared with 11.55 GiB at native 1280x720. Every decoded frame is retained, including interpolated-source frames; spatial resolution is the tradeoff. The allocation figure excludes browser/OS/driver overhead. The M3 has 16 GB shared memory and was not directly tested by this agent. A 360p reload option is available if necessary.

The currently autoloaded QA clips are 24 FPS BASE sources, not the saved 96 FPS RIFE variants. Quarter speed therefore supplies six distinct frames per second for those originals; resident uploads do not invent intermediate frames. Existing RIFE identity/readiness remains explicit, and no new interpolation or silent clip replacement was performed.

Both Perform module types and Timing now use shared header styling and an OnAirBadge component. The entire active header is tinted in its effect's existing accent, with a clearer red ON AIR marker. Removed the compact Perform whole-module inset outline and the regular Perform beat-flashing preview border. Verified green Transition and blue Punch Zoom live headers during actual Perform playback, then cyan Stutter in Timing, with no module outline or shadow. Both pages' ten previews measured 419.1667 by 235.78125 pixels (16:9). No viewport sizing change was made for this header request. Collapsed rail labels read FX / CLIPS and PGM. Final browser was left paused in Timing.

## Earlier UI correction

Follow-up: Timing source labels are S0–S9; filenames remain in the patch row and PGM hover descriptions. Card selection no longer outlines the whole module. Timing previews reuse Perform's ScreenBadge. Stutter now has a cycle-relative 4/4 ruler, beat/bar span, repeated-play starts and a runtime-phase playhead instead of mode glyphs. It labels the current continuous cycle explicitly; event-trigger gating remains outstanding. Ten focused tests cover clock mapping, measure labels and verified media identity. The four saved RIFE variants were checked against their content hashes; the app identifies those attached files during preload and shows `4× RIFE`, with `BASE` for unverified sources. This registry recognizes the saved variants, not arbitrary third-party interpolation provenance.

Timing cards reuse Perform's `MediaPatchBay`, `HeaderBtn`, `ModuleGrip` and `Screw`. Headers use the same charcoal gradient and title typography. The latest user correction supersedes the earlier per-slot color mapping: every ramp uses Speedramp's `#99f6e4`, every stutter/jump uses Timesampler's `#67e8f9`, including PGM highlights, the shared editor and palette. Defaults alternate Ramp/Stutter across all ten slots and across the row boundary, preserving explicit edits. These names and exact colors were confirmed in the rendered browser DOM. The filename/load/clear row is separate from the effect heading. Both existing left rails remain. PGM's queued/live footer identifies clip numbers in Timing.

Removed the colored rule above the Intro/Verse/Chorus strip. Active section titles carry the section color. Timing palette, editor chrome and stutter blocks use the existing neutral palette with green active states. All ten preview rectangles measured width/height between 1.77780 and 1.77788 (16:9 with subpixel rounding).

## Actual app checks

### Capacity recurrence across addresses

The first 8-to-12 GiB repair changed only localhost localStorage. Tailscale HTTPS is a different origin and still initialized from the unchanged 8 GiB code default. An isolated initial-settings reproduction confirmed capacity rejection; a regression test using the ten actual 720p frame counts (340/352/345/219/346/319/361/361/361/361) failed at exactly the eighth bank, needing 1.24 GiB with 0.17 GiB remaining.

The default is now 12 GiB. `capacityRevision: 1` migrates legacy 8 GiB settings once while preserving clip edits, frame rate and other caps; explicit 8 GiB selections saved after migration persist. Pre-revision settings cannot distinguish an intentional 8 GiB choice from the old default, so both migrate once. Capacity errors carry required bytes and show a bank-level explanation plus an explicit fit-and-reload action, even if another clip is selected or the editor is collapsed. The configured cap is per browser origin, allocations are per tab, and neither is total physical GPU capacity.

Fresh-settings @Browser verification loaded all ten automatically at 11.5528 / 12 GiB, including resident render paths and video frames on S7–S9. Selecting 8 GiB reproduced exactly three blocked slots; the bank notice reported 11.55 GiB required. Clicking `USE 12 GiB & RELOAD` restored ten ready banks, zero errors, and visible resident previews on S7–S9. Eighteen focused tests passed, and both changed Svelte components compiled without warnings. Svelte check retains the same nine pre-existing errors. The Tailscale proxy returned HTTP 200 for the final clip; direct Tailscale browser testing on the agent host is blocked by disabled local Tailscale DNS (ERR_NAME_NOT_RESOLVED). No machine DNS settings were changed. One background QA tab also hit a separate first-clip HTML-video bootstrap timeout; the foreground fresh run loaded all ten successfully. That timeout is not the last-three capacity error.

Tests used a separate `?qa=1&qaTimingTransient=1` tab. This development-only flag prevents test Timing settings from overwriting the user's saved curves. Existing media was loaded through the real CLIPS file chooser. Runtime observations used the read-only `__BMX_QA__.timingSnapshot()` hook via browser CDP.

- Loaded existing `deck-{1,4,6,8}-720-rife4.mp4`: four 1280×720, 96 FPS resident banks, frame counts 1152 / 876 / 1152 / 1152. Total texture allocation 15,969,484,800 bytes (14.8727 GiB), with all decoder instances disposed after load. Initial successful per-bank loading times summed to approximately 5.803 seconds; this excludes selection/setup and is not a comparable total-preload benchmark.
- During 121 browser observations over two seconds of cosine-ramp playback, every loaded preview used `resident-frame-bank`. Maximum requested-source versus selected-PTS difference was 9.95 ms, below one 96 FPS source frame (10.42 ms). Decode/upload counters were unchanged and all four legacy HTML videos stayed paused at unchanged positions.
- Quarter-speed anchors were set using the real curve keyboard controls. The first check exposed callback-time jitter. Production selection now samples exact output-frame boundaries. After correction, a 2.009-second observation saw 49 distinct samples, each advancing exactly one 96 FPS source frame, rate 0.25, zero requested/selected PTS error, and unchanged decode/upload counters. This is a short functional observation, not a dropped-frame SLA.
- Clicking source 3 and pressing digit 0 queued and completed the corresponding PGM cuts. The footer showed the actual target clip. Linear mode produced 0→1→2→3→0→1. Random mode produced 3→0→2→1→2→0. These checks used the existing beat-quantized production scheduler.
- Seven observed cuts reported 0.2–0.7 ms from scheduler decision to first PGM submission in the existing cut-latency hook. This excludes waiting for the musical boundary and display scanout; it is not comparable to the saved benchmark's strict on-time percentage or full end-to-end latency.
- Source 0 retained its quarter-speed ramp while source 1 independently used Stutter. Hold kept the same frame within its cycle. Jump testing exposed adjacent-cycle seed clustering; the corrected hash produced slices 2, 7 and 5 over a three-second app observation. Revisiting a cycle remains deterministic.
- Intro selection and Loop Section enabled song-region looping. Seeking beyond the region wrapped playback into the Intro. Switching Perform/Timing retained per-clip effect settings and resident banks, with the legacy Perform controls restored in Perform.
- A 0.25 GiB budget rejected the 3.96 GiB source with an actionable error, zero resident allocation and no decoder fallback. Raising the budget to 8 GiB loaded all 1152 frames successfully. Clearing the clip returned both the bank map and selected texture map to empty and resident allocation to zero. An earlier four-clip clear also returned allocation to zero.

## Automated verification

- Final `bun run build`: pass.
- Final focused Timing clock/bank/history, PGM keyboard/scheduler and device-loss suite: 39 tests pass, including output jitter, jump-slice diversity, single-gesture undo, selected-effect synchronization, persisted bypass restoration and all ten alternating defaults. Earlier shared timeline/render scheduling checks also passed.
- `bun run check`: nine existing errors and 14 warnings in eight files. Errors remain in storage request/test typing, the existing WebGPU sampler callback, arrangement section test setup and bind-group test casts. No new Timing type errors. This is not a clean full type-check gate.

## Final editor and lifecycle checks

- Compared the running SoundTouch Envelope Studio again with the real Timing editor. The base curve retains its 2000-unit width, 206-unit lane, 1.5-unit path stroke and hollow two-unit anchors with larger invisible hit targets. Timing uses musical bar.beat labels and the requested Speedramp color; the reference's unrelated lanes and controllers are not ported.
- Six pointer moves in one drag moved the middle anchor from beat 2.00 at 2.00× to beat 2.25 at 3.12×. One Ctrl+Z restored its original position and rate. The existing Edit menu's Undo routes to Timing history while on Timing, keeping Perform parameter history separate.
- Pointer addition created a snapped fourth anchor at beat 2.50. Double-click initially exposed SVG pointer capture swallowing the anchor's double-click; capture now stays on the pressed anchor. A subsequent native double-click removed the interior anchor and left both endpoints intact.
- Selecting a Ramp clip after a Stutter clip showed the Ramp editor, and selecting the Stutter clip again restored the Stutter editor. Turning Off on that clip, selecting another clip and returning, then disabling Off restored Stutter. Store tests additionally verify saved-settings round-trip restoration.
- Verse 1 selection and looping in Timing appeared as LOOP ON in Arrange and remained Verse 1/Loop on returning to Timing. Clearing the final test clip returned resident allocation to zero.
- Device recovery test was explicitly simulated in the isolated browser: destroyed its GPU device, then invoked the engine's device-loss handler. Intentional `destroy()` is suppressed by the shared device's normal notification policy, so it alone is not a driver-loss simulation. After the handler was invoked, the engine created a different device and reloaded the 340-frame bank in approximately 454 ms, ready with its decoder disposed and `resident-frame-bank` rendering. Existing unit tests cover unexpected-loss notification. This does not claim a physical driver reset was performed.

## Evidence limits

The saved benchmark reported different memory totals and harness conditions. These short production checks establish that the integrated route uses resident frames and respects source selection; they do not establish the historical strict 99% gate or identical throughput. Report the observed 14.87 GiB allocation as this app's texture accounting, not total GPU/driver memory. The other user tab was open during tests.

## Completion audit

| Requirement | Evidence |
| --- | --- |
| Resident GPU route and pre-interpolated sources | Four existing 96 FPS files loaded through the app; real PGM/previews use resident textures; decode/upload counters unchanged during play |
| Per-clip Ramp OR Stutter, independent Perform | Runtime source/effect observations, page-switch checks, retained settings and editor/history tests |
| Faithful shell and alternating effect colors | Actual reused header/patch components, ten measured 16:9 rectangles, latest rendered names/colors, existing rails and program viewer |
| Reference curve, editable points, snaps, undo | Running reference comparison, native point drag/add/double-click checks, one-gesture Ctrl+Z and Edit Undo, evaluator/snap unit tests |
| Source progression, slow playback and jumps | Analytical curve integration tests, real quarter-speed consecutive source frames, hold/jump observations and cut-independent clocks |
| Shared song sections and looping | Intro boundary wrap and Verse 1/Loop round trip through Arrange; shared bounds and stores |
| Hold/Linear/Random and PGM 0–9 | Click and keyboard cuts in the app; observed linear/random sequences; digit mapping/typing guards and scheduler priority tests |
| Loading, capacity, cancellation and cleanup | Live capacity failure/recovery, zero allocation after clear, partial-failure/cancellation tests and simulated device recovery |
| Saved benchmark comparison without rerunning it | Historical reports unchanged; short production observations and their non-comparable conditions documented above |
| Build and bounded validation | Production build passes; 39 focused tests pass; existing type-check failures identified separately |

The requested first version is implemented and functionally verified within these stated evidence limits. Global timing, combined visual effects, media collections and source-region editing remain deferred.

## Editing selection versus live output

Timing viewport/title clicks now tint the selected header and show EDITING. The bottom editor repeats EDITING S0-S9, while ON AIR remains tied only to the PGM source. Both markers can coexist on one header. Selection adds a header-only lower accent, not a module outline; preview geometry is unchanged.

Verified in @Browser: clicked S1 then S3 (both Stutter), observing exactly one selected header and matching bottom-editor slot each time while S0 stayed ON AIR. Started playback with the default HOLD order: S3 remained selected for editing and S0 remained live. Stopped playback and selected S0, confirming both states on the same header, no module outline, and 16:9 previews. Production build passes. No playback-routing behavior or automatic-order defaults were changed for this UI adjustment.

Selection correction: per user feedback, removed the EDITING badge/prefix and the selected header's lower accent line. Selection now changes only the header background color; ON AIR remains independent. This supersedes the additional markers described above.

Single-highlight correction: Timing no longer applies the Perform on-air header tint. Only the selected editor slot has a colored header; PGM is identified independently by its existing ON AIR badge. Verified S1 to S3 viewport clicks in the live browser: exactly one colored header each time, S0 stays on air with a neutral header, and the bottom editor follows selection. Perform live-header behavior is unchanged.

PGM slot styling follow-up: source buttons now use the same 16%/8% effect-accent gradient as Timing selection, with neutral separators and no colored border or outer glow. Bar-length and feel controls are unchanged. Shared ON AIR badge restored to the former compact 6.5px red text and translucent background, without the added bright dot. Production build passes; browser computed styles confirm the gradient, neutral border, no slot shadow, and restored badge in both workspaces.

## Unified manual slot selection (September 14)

This supersedes the earlier independent editor-click behavior: manual Timing viewport/title clicks, PGM row clicks and number keys now share selectRackSource. They update the same selectedTimingSlot immediately; both header and rail shade that slot. Stopped transport cuts output immediately; playing transport retains the existing quantized cut contract, with ON AIR marking actual output until the boundary. PGM's red slot dot is removed. Automatic cuts may change output without stealing the editor selection. A loading viewport remains editable without routing an unavailable clip.

Root cause of stale left-side live state: PgmDirector.normalizeSelection treated a direct pgmSource update as an effect replacement, restoring its cached old physical slot. PgmRail then independently updated the renderer, splitting the visible output from the store. PgmDirector's source subscription now accepts explicit source changes before normalizing; rack-change normalization still preserves the physical slot across effect swaps. The shared selection action no longer separately writes renderer state.

Regression test first failed with timesampler requested but transition retained. Six selection tests now cover direct store/scheduler/renderer agreement, scheduled cuts, physical slot preservation, shared stopped and playing selection, and unavailable-source handling. Eighteen focused selection/keyboard/rack-placement tests pass; production build passes. Svelte check retains nine existing errors and fourteen warnings.

Actual @Browser: stopped PGM S3 click matched rail, card, bottom editor and ON AIR; stopped S1 viewport click matched the same four surfaces. Playing S5 viewport click settled to bottom-0 in both selection highlights, ON AIR and the real renderer diagnostics. No red dot remains. Browser left stopped.

## Stable Timing layout and curve editing (September 14)

Timing now fits the available width rather than inheriting Perform's 1729px minimum. Its PGM height, chart height and preview-column cap account for the available window height. A stable scrollbar gutter prevents sideways jumps when content changes; the page fits naturally rather than hiding cropped content. The actual user browser measured 2447x1574 CSS pixels at final verification, with scroll dimensions equal to client dimensions in both directions. A temporary narrower test viewport was explicitly cleared after user feedback; do not change the user's viewport again for this review.

Ramp and Stutter share a fixed controls row and chart stage; their preview, panel, controls and chart rectangles compared exactly equal when switching. Reduced the gap above the shape bank. The responsive plot ruler uses actual display width, preserving readable grid lines, handles and end labels. The plot normally spans 0.5x to 3x, with quarter-speed horizontal lines and a prominent 1x line. Presets or existing points outside that interval extend the displayed range rather than clipping them.

Default curves use smooth monotone cubic interpolation across the complete point set, with continuous slopes through monotonic interior anchors and no overshoot. Their playback integral uses the same polynomial, so the displayed curve and source progression agree. New/reset curves start and end at 1x. Existing explicit shapes remain; COSINE and SMASH preserve the saved benchmark definitions. Simple presets now expose three anchors; S/INV-S retain extra anchors needed for their shape. Preset thumbnails normalize their actual rate span to show shape more clearly. Existing custom points are not deleted by migration.

Default horizontal snap is 32nd notes, with visible matching subdivisions and a 64th option. Vertical drag snaps in 0.25x steps; Alt-drag bypasses snapping for fine placement. Neighbour constraints use available grid lines rather than pushing points to near-identical x positions. Clicking an anchor focuses it for Delete/Backspace, double-click deletion remains, and a Delete Point control is available. Endpoints are protected. Selected point rate and beat are shown in the compact curve-controls row.

Verification: 22 focused curve, clock, trigger-parity and history tests pass; production build passes. A regression originally failed because the old smooth interpolation flattened at each intermediate rising point; the updated curve passes continuous-slope and numerical-integral checks. Saved COSINE parity tests explicitly choose COSINE rather than the new editable default. Browser checks confirmed zero page overflow, equal Ramp/Stutter geometry, three anchors for UP, and actual Delete followed by Undo restoring the user's entire curve exactly. No benchmark or interpolation job reran. Earlier Svelte check retained nine pre-existing errors/fourteen warnings.

### Desktop v0.2.6 release preparation and shared viewer size

- Removed Timing's smaller main-viewer height override. The program monitor now uses Perform's existing responsive sizing; the Timing thumbnail budget accommodates that monitor.
- In the existing in-app browser at 1917 x 1574 CSS pixels, both Perform and Timing measured 757.604 x 425.417 for the program canvas and 440.755 for its containing band. Timing horizontal and vertical overflow were both zero. Browser window dimensions were not changed.
- Desktop package, Tauri configuration, Cargo manifest and lockfile are 0.2.6. The release workflow rejects mismatched versions or a tag that does not match the bundled version.
