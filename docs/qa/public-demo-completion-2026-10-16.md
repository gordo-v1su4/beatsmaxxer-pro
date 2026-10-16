# Public demo completion acceptance

This report covers V1S-258 and its public demo, workflow persistence, entry, documentation and browser acceptance dependencies. V1S-251 (future Timesampler) and V1S-255 (desktop media API parity) remain explicitly deferred. All implementation and final acceptance belong to one PR.

## Environment and media

- Linux Chrome with a physical RTX 4070 Ti (12 GiB), headed under the server's display session. QA container: four vCPU, 20 GiB system memory. No local desktop GPU testing or changes to source-video resolution/frame rate.
- Ten clean original clips, the Redline song and its matching analysis, MIDI and structure files. The reviewed metadata is `svelte/src/lib/runtime/publicDemo.json`; no large media is embedded in Git or workflow JSON.
- Public bundle verification fetched all 14 files anonymously, checked SHA-256 and byte ranges: 93,389,163 bytes. The production-build preview passed the same verifier.
- The owner approved anonymous curated demos. ENTER opens the app without a code; song/clip/Timing imports request access on demand. Cancel preserves the demo. Prepared demo clips use an allowlisted, verified ready-only GET lane; private uploads, analysis, arbitrary job metadata, submissions and retries still require a session.

## Completed browser evidence

| Flow | Result |
|---|---|
| Clean Perform full-song REC | 411 samples, 13 sections, both reusable banks, 96 recorded cuts; no missing PGM textures or sampling errors. |
| Clean Perform full-song PLAY | 411 samples, 13 sections, both banks and all ten sources; no missing PGM textures or sampling errors. |
| Fresh Perform full-song export | 438 samples, all 13 sections and ten sources; no missing PGM textures/errors, restored LIVE and preserved all 96 cuts. |
| Export file inspection | VP9, constant 24 FPS, Opus 48 kHz stereo, 182.933 seconds against a 182.85-second decoded song. Inspected clean source frames and audible soundtrack. Current export follows the monitor resolution: 320×180 in this run. |
| Audio inspection | Decoded exported soundtrack 182.85 seconds; envelope correlations 0.948–0.994 at song positions 10/40/80/120/160 seconds, with an approximately 0.15-second capture onset offset. This is not a claim of frame-perfect A/V synchronization. |
| Workflow fresh-navigation roundtrip | Exact canonical JSON equality for 13 sections/96 cuts, recurring assignments, LINEAR order, eight-beat interval, feel 2, bypass state and an explicitly empty live slot. Curated media rehydrated automatically. |
| Invalid workflows | Version 99, unknown module and wrong-row module rejected while preserving current work. |
| Cancellation and relinking | Dismissed replacement confirmation and empty file selection preserved the take. A missing live-only original showed the CLIPS/reload instruction; adding that original and reloading restored exact workflow equality, including the previously empty slot. |
| Rapid native bank recalls | 24 alternating bank recalls across all ten sources; 269 PGM renders over 32.92 seconds, zero missing video and zero clip failures. |
| Steady native measurement | 157 PGM frames over 12.02 seconds (~13.1 FPS); p50 77.2 ms, p95 89.9 ms; zero missing video, 276 cache copies and four reuses. This constrained server run does not establish 60 FPS playback. |
| Timing preparation | Ten distinct verified 96 FPS banks, native 24 FPS originals retained; 7,044,019,200 bytes resident within the 8 GiB budget, pending count zero. PLAY blocked during preparation and enabled on completion. |
| Timing full-song PLAY | 377 samples, both reusable banks and all ten sources, zero missing textures/errors. Initial/final state plus replay covered all 13 sections. |
| Timing full-song export | 402 samples, all 13 sections and ten sources, zero missing textures/errors; restored LIVE/preserved 143 cuts. VP9/CFR24/Opus48k stereo, 182.925 seconds, inspected frames; soundtrack correlations 0.969–0.995 across the song with the same ~0.15-second onset offset. |
| Standalone guide | All four topics at 1920 and 375 pixels, no page overflow; local diagram scroll regions, accessible SVG titles/descriptions, all four Timing curve selectors. Three extracted diagrams passed diagram-design self-checks. |
| Production-build entry | Cold/cached READY100 held until explicit action; arbitrary key did not dismiss it; focused ENTER, keyboard Enter/Space, reduced motion, touch and no click-through passed. Underlying app stayed inert while the entry card was present. |
| Production-build demo and HELP | Normal URL exposed the two curated demos plus Save/Load, with no development presets. Perform loaded ten clips/13 sections/143 cuts and real PGM video without dev-media/Vite requests. Playback, all four embedded HELP topics and Escape close passed. |
| Production-build Timing | All ten 96 FPS banks and ten native originals became ready within the 8 GiB budget; PLAY worked. Authenticated requests reused existing verified worker jobs with zero new POST jobs. |

Raw captures, traces, downloaded workflow files and exported videos are retained under the ignored `svelte/.artifacts/linear-acceptance/` directory. They are iteration evidence, not committed media. Earlier exports containing benchmark deck labels and earlier timestamp-drift exports are superseded by the clean fresh export above.

## Export defect found by file inspection

The original MediaRecorder file used wall-clock audio packet timestamps that drifted during device scheduling stalls. One 182.85-second song consequently produced a 198.792-second video container. Download success and PGM samples alone did not catch it.

The finalizer now compares raw packet timestamps with independently decoded PCM durations, repairs drift only with reliable packet correspondence, keeps audio continuous and maps video onto that clock. CFR filling holds the previous picture until the next picture's mapped time. Healthy recordings with discarded empty decoder packets retain the existing path; ambiguous drifting recordings fail explicitly. Eight focused regression tests cover the clock, picture identity, cancellation and track preservation. A fresh full-song app export verifies the correction above.

## Automated validation

- Full Linux unit suite after PR review and anonymous-demo changes: 981 passed, eight skipped. Svelte check: zero errors, zero warnings. Production build passed. Secret scan passed with values redacted.
- Windows unit suite excludes the five pre-existing Linux symlink deployment tests; the full Linux run includes them.
- Read-only standards/spec reviews completed; all material workflow and export findings were fixed and re-reviewed.
- `HEADLESS=1 SKIP_UNIT=1 SKIP_BUILD=1 bun run test:local` passed all UI, playback, interaction, stutter, audio, beat and six negative-fixture gates, using a separate loopback QA server. Unit/build results above apply to the same app code. Physical desktop-proof artifacts were explicitly skipped by this headless suite; the custom demo acceptance above used headed server Chrome on the RTX GPU.
- Linux `bun run smoke:desktop` passed the embedded frontend build. A Windows installer/native-shell run is not claimed; desktop media API parity remains deferred in V1S-255.
- The Windows dev server now ignores generated `.artifacts` files after an actual `EBUSY` watcher crash on a captured PNG. A newly created file held with an exclusive Windows lock no longer terminated Vite; HTTP and anonymous demo verification still passed. This watch-only setting does not change production output.

## PR review regressions

PR #45 review found four defects, all corrected in the same PR. Demo initialization waits for the matching song's autosave decision after poster loading, then clears restored-layout protection before seeding the published structure. A browser test preloaded a saved verse-only layout: the demo still produced 13 sections, six chorus assignments and 143 cuts, with no saved section retained.

Workflow files now embed musical event data and routing while continuing to reference original audio/video. A fresh navigation started with no imported signals. After loading only the matching song and the custom workflow, 2,367 Timing events, Perform MIDI notes, channel selection, routing, tempo 1.15, pitch +2, key -3 and volume 0.42 restored with exact signal-data equality. Source rhythm uses the exact analysis BPM rather than reconstructing it from a rounded tempo display. Invalid event data is rejected before mutation; legacy files explicitly request missing imports.

Missing originals used only by later sections or banks now trigger the CLIPS/reload instruction. Deployment accepts the exact supplied Compose variable template by replacing it with the directory that deployment verified; duplicate destinations, unexpected templates and writable mounts remain rejected. Regression tests exercise the committed template with default and custom directories.

A follow-up review found that an already-running hosted analysis could overwrite restored controls. Workflow restoration now invalidates that request before applying saved signals. Delayed success and failure regression tests use the real audio-load path and prove source BPM, beat grid, tempo, pitch and key remain restored without changing the song generation.

The browser also held a real Studio analysis request until after workflow restoration; releasing the delayed failure left signals, tempo 1.15, pitch +2, key -3, volume 0.42 and ready status unchanged. A final transition check starts with custom MIDI routing and loads the complete Perform demo: old channels, card layers and global routing are cleared, while all 2,367 freshly imported Redline Timing events remain and PGM renders real video.

The exact deployed merge revision and public verification belong in PR #45's post-merge release record. Final Brag capture follows accepted production behavior and remains separate from performance evidence.

## Required review checkpoint

Kimi/OpenCodeReview run 38858218681 reviewed 15 of 26 selected files, then its provider returned the account's five-hour quota error. The manifest is `partial` with 11 failed items, and the workflow correctly rejected it. The owner subsequently explicitly waived Kimi for PR #45 only. The partial run is not represented as a completed review. Latest-head CI, Greptile and the new anonymous-demo acceptance still apply before release.

Sixteen partial findings were addressed: full staged-asset hash verification and public HEAD checks; exact-commit catalog lookup; early demo-root validation; Compose constants/comment handling/map-form validation; packaging shape and case handling; controlled async media failures in both servers; a module-anchored default root; early friendly structure validation; approved demo-ID reuse; clearer legacy/status branches and bank indexing; unknown-based JSON guards; and import placement. Three low suggestions are retained as deliberate boundaries: the MIME tables belong to different public/QA format surfaces; `/demo-media/` is the fixed public route contract; unsupported multi-range requests retain the tested single-range policy. No additional functional defect was established by those suggestions.

## Anonymous-demo preview acceptance

Greptile's final non-blocking cancellation race is fixed: concurrent imports share one access-status attempt, and a canceled attempt ignores late status responses. Both regression cases pass. The owner authorized merging this fix without another Greptile run.

Fresh headed Chrome with cookies cleared entered through the normal production-build URL without a code. Perform loaded 10 clips, 13 sections and 143 cuts, played real output, and opened all four HELP topics. SONG, CLIPS and Timing import opened the access dialog; Cancel/Escape preserved the take and Shift+Tab stayed in the modal. Private audio/video uploads, hosted analysis, arbitrary job reads and job submission all returned 401 without a session.

Timing downloaded all ten approved prepared results through GET `/__api/media/demo/jobs/<id>` with zero worker submissions. All ten sources verified 96 FPS; the complete browser frame bank used 7,044,019,200 bytes within the 8 GiB budget, and playback passed. A real PIN response delayed five seconds still unlocked services; a fresh CHOOSE FILE click opened the native picker. Canceling the subsequent import retained the loaded demo. Public production verification follows merge.
