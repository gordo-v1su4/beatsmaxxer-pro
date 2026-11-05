# Beatsmaxxer Pro completion plan

Owner direction: November 5, 2026. Tracking parent: [V1S-428](https://linear.app/v1su4/issue/V1S-428).
Working branch: `codex/completion-verification`; baseline main `2b531ff`.

## Scope and delivery contract

Focus on Beatsmaxxer Pro web, its shared desktop app, and the Experimental Desktop backlog.
The separate Beatsmaxxer Native product (`beatsmaxxer-resolume`) is excluded by the owner's latest instruction.
Preserve the current app while measuring the baseline; then make a substantial UI pass with a simpler musical workflow,
strong presets, and discoverable detailed controls. Keep the existing visual identity and WebGPU renderer.

Commit and push intended changes frequently. Open substantial coherent PRs after their acceptance is reviewable.
Automatically merge only when required CI/checks, affected runtime/export/platform acceptance, the applicable repository
reviewer, and Greptile 5/5 cover the current revision. Fix review findings and repeat as needed.
A review score alone does not prove runtime behavior. Follow `docs/deploy-app-vm.md` and verify exact public revision after merge.
The older finish skill's one-final-PR rule and September continuity sprint snapshot are superseded by this owner direction.

## Inventory reconciled against live Linear

The complete November 5 snapshot is [linear-inventory.json](linear-inventory.json), including full issue descriptions and relations.
Pagination exhausted for all three project inventories. The Native snapshot is reference-only and excluded from execution.

| Project | Items | State at audit | Execution |
| --- | ---: | --- | --- |
| Beatsmaxxer Pro (P-V1S-1) | 51 | 49 Done, 2 Canceled | Verify current acceptance; create follow-ups for measured gaps |
| Experimental Desktop (P-V1S-10) | 4 | Archived Backlog | Reconcile and implement V1S-205/207/208/209 |
| Beatsmaxxer Native (P-V1S-15) | 14 | 6 Done, 8 unfinished | Excluded; separate product/repository |

Preserve historical Done/Canceled status. In particular V1S-251/255 are delivered, and V1S-347 includes November 1 completion;
October 22 unresolved notes are historical. Re-run current acceptance rather than repeating old fixes blindly.
Canceled V1S-302/303 do not silently become content requirements.
PR #52 remains separately open; inspect its current diff and reviews before incorporating the demo-recovery fix.

The connector reads the archived Pro project but rejected attaching a newly saved issue to it by both project ID and UUID.
New execution issues are currently team V1S children of V1S-428; project association remains pending connector reconciliation.

## Ordered execution

- [x] Create active completion goal and inspect branch/worktree/remotes without removing unrelated files.
- [x] Fetch complete Linear inventory, full descriptions and relations; identify Native exclusion.
- [x] Parallel read-only audits: web lifecycle, media/client-server boundary, desktop/platform evidence.
- [x] Run current unit/check/build baseline.
- [ ] V1S-429: establish input-to-visible and lifecycle/resource baseline; fix measured responsiveness regressions.
- [ ] V1S-430: define stable mixed-resolution export/media policy; verify quality, resource limits and failure recovery.
- [ ] V1S-431: substantial UI pass with simple primary workflow and advanced controls; browser review at actual sizes.
- [ ] V1S-432: differentiated musical presets and reusable content/workflow examples, with observed picture changes.
- [ ] V1S-433: physical MacBook browser and installed Windows acceptance; establish native Mac feasibility separately.
- [ ] V1S-434: Experimental Desktop mapping, lighting and atomic looks; explicit hardware evidence.
- [ ] V1S-435: reviewed PR chunks, exact-main deployment, public checks and affected desktop release acceptance.

V1S-429 and media policy tests can proceed in parallel. UI implementation follows the baseline and a concrete visual/interaction
direction. Preset/content acceptance follows the finished controls. Heavy GPU/browser runs run sequentially on each host.
Agents own disjoint files; root integrates, commits, pushes, reviews and releases.

## Existing architecture and measured concerns

- Three screens, two playback workspaces, one production RAF owner. Arrange preserves the originating renderer.
- Perform to Timing switching is currently locked while playing. Test supported transitions, and design any future change explicitly.
- Hidden canvases use visibility observers; Timing exit cancels pending uploads and releases sampler-only banks.
- Unit lifecycle/render tests are useful but do not certify physical browser background behavior or long-session resource stability.
- Existing cadence scripts test six straight/swing/dotted and ordering cases each, with 150 ms ordinary-source gap limits.
  They exclude intentional retiming from ordinary decoder checks. Keep effect-aware expectations and prior thresholds.
- Current Timing export size is chosen by first decoded source. A 480p-first take can set 480p output despite later1080p sources.
  New tests characterize this and leave a TODO for an explicit, source-order-independent output policy.
- Timing defaults use full-resolution resident frames and a12GiB budget; complete demo chooses270p/8GiB.
  Laptop friendliness must be demonstrated with actual memory/decoder pressure and quality, not inferred from GPU use.
- Hosted Ramp preparation fits sources within1280x720 and never enlarges smaller inputs. Preserve and communicate the difference
  between original quality, resident preview resolution, prepared Ramp quality and exported output size.

## Client/server boundary

Local clips and songs play locally. HTML video decode, WebGPU effects, timing playback and export run in the client.
Original and Stutter paths retain native sources. Timing Ramp below96FPS can upload the source to the authenticated GPU worker,
reuse content-addressed preparation, download and verify output, then play locally. Optional hosted song analysis uploads audio.
Curated demos download known assets and cached analysis; public ready-job lookup is allowlisted. Ordinary cuts are local after loading.
Service outage tests must preserve local originals while reporting unavailable hosted features accurately.

## Acceptance matrix and evidence rules

Every report records source SHA, OS, hardware/browser/WebView versions, media identities, output dimensions/FPS, settings,
cold/warm state, commands, thresholds and artifact locations. Passing, failing, skipped and unmeasured are distinct.

| Lane | Required evidence |
| --- | --- |
| Interaction | Knob/slider/preset/scrub/drag/undo event-to-visible p50/p95/max; input, handler and presentation delays; cut gaps alongside UI latency |
| Lifecycle | Perform/Timing to Arrange and return while playing; stopped workspace switches; background/foreground; reload and recovery |
| Resources | Active bindings, decoder/source identity counts, resident bytes, pending uploads, cancellation/retry and repeated-switch plateau |
| Musicality | Same reference phrase with visibly distinct preset outcomes; intended beat/MIDI launch, sustained sample ownership and deterministic replay |
| Media | Mixed480p/720p/1080p, portrait/4:3/square/16:9, common fractional/integer FPS and VFR, codec capability and corrupt inputs |
| Exports | Whole song and selected loop; explicit dimensions, CFR, correct sources/cuts/effect frames, audible synchronized soundtrack; inspect actual file |
| Persistence | Preset/advanced settings, take, banks and assignments roundtrip; invalid imports preserve current work |
| Service | Anonymous demo, private uploads, existing job reuse, busy/offline/failure/retry/cancel, provenance and range validation |
| Platforms | Windows Chrome/Edge and installed WebView2 app; actual MacBook Chrome/Safari, thermal/battery/memory differences |
| Desktop experiments | Two real outputs with mapping/blend and live edits; lighting viewer>=40Hz and measured latency; atomic beat-switched looks |

Use proposed UI targets as hypotheses: visible response within the next practical frame, p95<=50ms and no unexplained>100ms
UI stalls in fixed reference scenarios. Record baseline and agree a supported hardware/media envelope before treating targets as proven.
Browser next-paint metrics are not physical input-to-photon or audio-to-photon measurements.
Do not loosen source-cadence thresholds to obtain a pass.

Mac browser support and native Mac packaging are separate gates. Current release workflow ships Windows only.
`smoke:desktop` on Mac/Linux builds only the frontend, so cannot certify a Mac desktop app.
Missing physical Mac access, second display, lighting rig or platform evidence remains an explicit incomplete gate.

## Baseline and current evidence

November5, main2b531ff / initial working branch:
- `bun run test`:1130 passed,8skipped;179 test files passed,2skipped.
- `bun run check`:0errors,0warnings.
- `bun run build`:pass; client-bundle guard1450.0kB across16startup chunks; existing dynamic-import warnings.
- Native in-app browser QA navigation:12/12clips ready, real song and current Perform layout visible; transport stopped.
  This is a visual baseline, not a performance run.
- Mixed-resolution characterization:6passed,1TODO; actual renderer with mocked decoder/canvas boundaries, not real codec proof.
- Lifecycle harness written; runtime verification pending.

## Research used to choose measurements

[INP](https://web.dev/articles/inp) measures responsiveness through the next paint, not eventual completion of asynchronous work.
[Chrome guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/performance/identify-inp-causes) separates input,
processing and presentation delay, and recommends Event Timing plus Long Animation Frames for attribution.
[Safari26 WebKit release notes](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) document WebGPU availability;
support alone does not establish application performance. Verify installed versions and physical device behavior.

## Completion rule

All in-scope children and Experimental Desktop acceptance have reproducible evidence, substantial chunks are reviewed/merged,
affected public/installed flows pass at the delivered revision, and unresolved hardware/platform requirements are resolved.
Until then the goal remains active. This plan is an execution checklist, not a claim of completion.

