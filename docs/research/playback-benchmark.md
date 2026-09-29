# Playback benchmark

This applies the September 12 zig-swap experiment to Beatsmaxxer. It runs at
`http://127.0.0.1:5174/benchmark` on the development server. It is a comparison
harness using the app's **current VideoPool and TimeSampler reducer**, with a
common WebGPU presenter. It does not include rack effects or the production
PgmDirector/AppLoop, so it is not an end-to-end rack performance score.

## Run

```powershell
bun run benchmark:prepare   # import from sibling ../zig-swap
bun run dev
# In another terminal:
bun run test:benchmark
bun run benchmark:run       # current VideoPool, 8 decks, 120 seconds, seed 42
bun run benchmark:report    # summary with matching trace/media IDs
```

To import a different local zig-swap checkout, pass its path to
`bun run benchmark:prepare <path>`. The source must contain the prepared fixture
set described in zig-swap's `docs/musical-playback-benchmark.md`. The importer
verifies media SHA-256 values, preserves original bytes, rewrites only local URL
prefixes in metadata, and records source revision and original metadata hashes.
Fixtures live under `svelte/.artifacts/benchmark-fixtures/`; the dev server serves
only that directory. They are excluded from production builds and Git.

```powershell
$env:BENCHMARK_BACKEND = 'gpu-bank' # or beatsmaxxer / mediabunny
$env:BENCHMARK_DECKS = '8'         # 1 / 4 / 6 / 8
$env:BENCHMARK_SECONDS = '120'     # 30 / 60 previews; 120 scored; 600 soak
$env:BENCHMARK_SEED = '42'
bun run benchmark:run

# Accepted independent-ramp interaction, four RIFE frame banks:
$env:BENCHMARK_MODE = 'remap'
$env:BENCHMARK_BACKEND = 'gpu-bank'
$env:BENCHMARK_SECONDS = '30'
bun run benchmark:run
```

The runner launches headed Chrome with the physical GPU and saves JSON plus a
screenshot to `svelte/.artifacts/playback-benchmark/`. Keep its window visible.
`BENCHMARK_URL` can select another dev server. `BENCHMARK_REQUIRE_PASS=1` makes a
failed performance gate produce a nonzero exit status. Initialization errors,
incomplete runs, and invalid observations always fail the command. Preview
completion alone never passes the scored gate.

The page offers the same controls interactively and downloads results. It does
not write files to the server. The runner saves results locally. Pausing or
hiding a run invalidates it; Reset releases resources. The comparison-suite
button rotates three candidates over 1/4/6/8 decks and seeds 42/43/44 for 120
seconds each (72 minutes plus preloading). It fixes the media, groove, trigger
pattern, and candidate-specific memory caps, independent of earlier UI choices.
Run 1080p comparisons through the page and 600-second eight-deck soaks for
finalists. Do not run benchmarks concurrently with other GPU tests or builds.

## Contract and limits

- One estimated AudioContext output clock drives the saved, seeded event trace.
  Audio-derived onsets and MIDI can trigger cuts/stutters. Separate time-remap
  mode keeps independent per-deck ramps and switching across all decks.
- The resident path predecodes and uploads the entire selected clip set before
  music starts. Playback selects texture bindings; it has no decoder or upload
  fallback. Estimated budgets are explicit: 12 GiB for original resident banks,
  24 GiB for the selected interpolated banks, and 256 MiB for bounded WebCodecs
  reuse. These are different memory tradeoffs, not equivalent cache budgets.
- Remapping outputs at 24 fps. The four RIFE clips store 96 fps for extra source
  samples; that does not mean 96 fps output. Original and interpolated media
  must be labeled separately in any comparison.
- Source PTS and generation are checked again at the common GPU submission
  boundary. Unique source frames are separate from presentation updates.
  Rejected candidates are not automatically counted as stale frames displayed.
- Scoring uses the measured display interval. Standard cuts require 99% on time;
  missed and skipped program triggers stay in the denominator. Source error
  exceeding one source frame plus one display interval for over 100 ms fails.
  A missing source frame, GPU loss/error, or resident-cache miss cannot silently
  qualify as success. 32nd/64th-note stress scores are separate.
- Raw source observations, complete schedules, media/analysis hashes, GPU
  adapter information, memory estimates, preload time, app revision/dirty state,
  and exact runner controls accompany each result. Decoder/driver memory is not
  fully observable. Browser submission timing is not physical scanout or an
  acoustic timing calibration. Nearly static footage is weak evidence of ramp
  quality; use sustained movement for perceptual decisions.

No production winner follows from a preview or a single passing run. The
original comparison decision requires repeated material improvement: at least
25% lower p95 plus one display interval absolute gain, or eight passing decks
versus six, without startup/stability regression. A complete capacity/soak
comparison remains a separate acceptance exercise. `libmedia` is not included:
the earlier experiment did not establish reliable presented PTS/decoder-path
attribution for scoring it.

## App regression recovered from the experiment

The imported swing test initially failed against the live reducer: at 120 BPM,
the third eighth-note swing boundary was 0.58333 s instead of 0.5 s. Three
boundary-advancement paths still added a straight interval. They now use the
existing groove boundary function, preserving 2:1 swing and dotted timing.

## Provenance

Source task: **Fix decoder and fixture validation**, zig-swap task
`01a0937b-95ed-7762-ac9e-f70d84f5e2f4`.

The local source revision at import was
`1f1d1f47d2c0dfde6a117ccc5fc8fddbb8a16095`. Accepted interaction checkpoints:
`50856e9`, `55cdd8a`, `2e828a7`, `e39d9b8`. The schedule, adapters, presenter,
resident bank, and bounded frame source were adapted from that repository.
VideoPool, reducer, groove, and shared types are imported from this app instead
of retaining the experiment's vendor copies. The harness additionally fixes
display-dependent tolerance, skipped program-trigger accounting, failure
reporting, and suite configuration isolation.

Follow-up: [issue #24](https://github.com/gordo-v1su4/beatsmaxxer-pro/issues/24).

## Initial local measurements — September 12, 2026

Headed Chrome, NVIDIA Blackwell adapter, eight 720p decks, 120 seconds, seed 42,
audio-onset stutters. All three runs share trace/media digest `010a6898a0cc`.

| Backend | Program cuts on time | Worst deck p95 | Preload | App-owned frame cache |
|---|---:|---:|---:|---:|
| Current VideoPool | 43.9% | 146.4 ms | 0.17 s | Not observable (browser decoder) |
| Bounded Mediabunny | 41.8% | 111.6 ms | 0.02 s | 0.25 GiB |
| Resident GPU textures | 88.9% | 19.2 ms | 2.20 s | 7.67 GiB |

All completed without an invalidation; none passed the 99% timing gate. These
are one seed at one capacity, not the full comparison or approval to replace
the production backend. Browser/OS caches were uncontrolled. Preload means
adapter load/prewarm, not all future on-demand decoding.

Local raw evidence is in `svelte/.artifacts/playback-benchmark/`:
`1789251796271-beatsmaxxer-8-cuts-42.json`,
`1789251919303-mediabunny-8-cuts-42.json`, and
`1789252042099-gpu-bank-8-cuts-42.json`. Use `benchmark:report` for clickable local
artifact links and any later runs.

The resident run's 189 program cuts were **168 within one display interval,
21 late, and zero missing**. The late cuts occurred 16.73–19.95 ms after their
scheduled times: only about 0.03–3.25 ms beyond this display's 16.7 ms deadline.
The 99% target originated in the proposed zig-swap plan, subsequently approved;
it was not a separately chosen user requirement. Treat it as a strict diagnostic
target, not an assertion that 11.1% of playback was broken.

The 30-second independent-ramp preview also completed: zero resident misses,
zero sustained source error, 18.83 GiB of textures, 6.04-second preload. The four
interpolated decks delivered approximately 24 unique fps. A 24fps output step
can intentionally wait up to 41.7 ms, so its one-display-interval percentage
must not be compared directly with the display-rate cuts mode.

## Timing workspace direction

The user's follow-up is a separate tabbed workspace with only **Ramping** and
**Stutter / Jump Cuts**. Keep clip switching in both and independent per-clip
ramps. The benchmark's backend, memory, and scoring controls belong in
diagnostics, outside the main effect controls.

The existing app selects Perform/Arrange through `viewMode` in
`svelte/src/lib/stores/rackUi.ts`; TopBar selects the view and the root page
mounts its workspace. A future Timing view should use that same navigation
boundary. Media ownership (shared with the rack or a separate set) is still to
be settled. This branch supplies the benchmark and timing regression fix;
it does not yet implement the product workspace or replace the rack backend.

## Verification

The production build and 674 unit tests passed (7 skipped). Type checking
reports nine errors in existing storage, renderer, and unit-test files; none
are in the benchmark additions. An additional existing app QA smoke loaded
eight clips but could not start the uploaded WAV transport, including a retry
through the visible Play button. It did not reach a playback measurement.
The separate benchmark completed with its verified MP3 inputs. Do not describe
this as a successful end-to-end rack playback gate.
