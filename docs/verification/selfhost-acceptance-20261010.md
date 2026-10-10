# Self-hosted acceptance — October 10, 2026

The user selected the Review Room hosting pattern and Dockhand management.
VM100 runs the static browser app/authenticated API and serial CUDA interpolation
worker. Hostinger runs the Dockhand dashboard, connected through Hawser.
Playback, timing and export remain browser-side. The old Vercel site has not
been switched during candidate acceptance.

The base playback/output cadence is 24 FPS; Speedramp covers 0.25× to 2×.
A 24 FPS original receives fourfold interpolation to 96 FPS so quarter speed
retains 24 unique frames per output second. Only distinct Speedramp sources are
submitted; Stutter sources retain their original media.

## Runtime and browser evidence

- Dockhand app-vm shows `beatsmaxxer-pro` and `media-worker` as Internal/running.
  Both were recreated through managed deployments. Credentials are masked,
  and the existing external `media-worker_interpolation-work` volume remains.
- The public acceptance route serves the static production build, authenticated
  API and revision health. Anonymous gate is locked; Origin-bearing anonymous
  media requests return 401. Production browser requests go to the owned app
  and RustFS, with no Vercel request in the preparation round trip.
- Four real files loaded through the UI produced two Speedramp preparations.
  Cached variants attached automatically. A fresh 24 FPS source produced 392
  frames at 96 FPS through GPU decode, CUDA RIFE, GPU encode and GPU verification.
  PLAY stayed blocked during processing and resumed after local frame preparation.
- A candidate image built from an incomplete QA copy lacked its GPU health
  helper. Rebuilding the complete worker source restored CUDA health. Browser
  Retry then completed the fresh job; NVIDIA runtime/driver settings were unchanged.
- The fresh clip exposed nominal 96 FPS measured as 95.99999999999999. Strict
  native comparisons submitted the prepared result again. A shared client rate
  check now allows only timestamp roundoff (one millionth FPS), keeps 90/91/95.9
  and non-finite rates below the requirement, verifies the content hash, and
  reuses the original 96 FPS render. A clean production-browser reload confirmed
  all four sources ready, exactly two prepared sources, PLAY enabled, and no
  additional job for the prepared file.
- Full-screen help passed header/Timing entry, all four topics, Escape and
  390×844 checks. Diagrams scroll within a narrow viewport. The guide correctly
  distinguishes one Speedramp curve per trigger from Stutter repeats, explains
  beats/bars, and describes Density's extra spacing beyond the minimum Gap.
- Section groups survived portable download/reload with all clip links and 58
  cuts. Capture/clear controls stayed disabled during REC and PLAY.

Server evidence stays in `/home/gordo/beatsmaxxer-qa-no-gpu/evidence`; local
copies are gitignored under `svelte/.artifacts/linear-acceptance`. Screenshots
include `dockhand-managed-app-worker.jpg`, `selfhost-clips-ready.png`,
`selfhost-retry-processing.png` and `workflow-help-*.png`.

## Standards

The exact staged Git tree passed Svelte checks with zero errors/warnings and
897 unit tests with no failures. Eight additional real-media assertions passed
with the read-only server fixture bundle mounted, bringing covered assertions
to 905. Eight tests remain skipped: three browser-only audio checks, one fixture
generation helper, and four MIDI checks whose separate legacy fixture path is
unavailable. Worker queue tests and Python input-boundary checks also passed.

One documented ownership conflict and one design judgment were addressed.
The architecture now distinguishes Timing MIDI/audio-source cut ownership from
Perform/beat scheduling and records manual/recorded-playback priority.
Browser acceptance, queue migration and queue completion now share render
validation, including finite duration/frame count and engine/model provenance.

## Spec

One help finding was addressed: Density contributes additional post-effect
spacing. At 120 BPM and 65% Density, 180 ms minimum Gap becomes 530 ms total.
The worker also accepts the previously stranded 60–96 FPS input band under its
existing bounded frame/duration limits. Python boundary checks cover supported,
out-of-range and non-finite inputs.

Review findings: Standards 2 addressed; Spec 1 addressed. The separately found
96 FPS roundoff regression is fixed and has client lifecycle coverage.

Exact-main deployment, mandatory GitHub reviews and final canonical-domain
migration remain release gates; candidate browser evidence does not claim them.
