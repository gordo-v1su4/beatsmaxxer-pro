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

## Automated review corrections

Greptile's initial review identified five valid issues. Section recording now
waits for clip recall and checks both the current section and recording pass
before capturing; REC entry uses the same correction path. Legacy version-1
Timing settings retain per-deck curves. PGM ownership uses only usable decks
with active effects, so empty or OFF MIDI decks do not suppress RAND/Linear.
The Timing footer retries failed future-section preparations and frame banks;
failed worker jobs are explicitly requeued, while ready jobs are resumed.
Worker scratch cleanup runs after both successful and failed processing and
stops any unfinished child first; RustFS originals and queue provenance remain.

Eight added regressions pass in the 34-test focused server check. Both changed
Svelte components pass the autofixer, Svelte checks report zero errors/warnings,
and all five durable queue tests pass. Standards found no remaining issue;
Spec's additional OFF-deck ownership finding is also addressed.

The complete corrected server suite passes 913 assertions with zero failures
and eight skips in the existing media-capable validation image, using the
read-only real-media bundle. The dependency-only image lacked ffprobe for one
fixture check; that tooling limitation was resolved before final validation.

The revised Dockhand app and worker are healthy. A deliberately invalid owned
media job failed explicitly, removed its scratch directory, and retained its
RustFS original and SQLite provenance. Python's public-health probe received a
Cloudflare 403 after successful activation; rollback restored the prior images.
Reactivation using the established Bun health request verified the public SHA.

CI additionally exposed a frozen sequencer marker in recorded PLAY: that branch
returned before updating the step. A new AppLoop regression failed before the
one-line marker update and passed afterward (four lifecycle tests). The real
server-browser reproduction changed from stepMoved=false/PGM moved to both true.
CI assertions and timing limits were retained.

Exact-main deployment, mandatory GitHub reviews and final canonical-domain
migration remain release gates; candidate browser evidence does not claim them.
