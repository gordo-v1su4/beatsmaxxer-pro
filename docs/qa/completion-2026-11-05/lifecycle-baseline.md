# Workspace lifecycle baseline — November 5, 2026

Passed the new lifecycle gate on `codex/completion-verification`, production
baseline revision `a5b863d7b2179b124d8d194a0802ed4abace6c03`, with the uncommitted
`svelte/scripts/verify-workspace-lifecycle-runner.ts` added for this run.
No production UI or engine changes were required.

Environment: Microsoft Windows 11 Pro 10.0.26200, headed Google Chrome
157.0.8103.38, local strict-port dev server `127.0.0.1:5174`. The other app
browser was closed before testing. Chrome used a fresh isolated profile and
was closed by the harness after each run. The song was muted through the QA
audio-engine seam before starting playback.

Exact PowerShell invocation, from `svelte/`:

```powershell
$env:WORKSPACE_LIFECYCLE_CYCLES='3'
$env:WORKSPACE_LIFECYCLE_BACKGROUND='1'
$env:WORKSPACE_LIFECYCLE_REPORT='.artifacts/workspace-lifecycle-full.json'
$env:HEADLESS='0'
bun scripts/verify-workspace-lifecycle-runner.ts
```

The default QA URL was `http://127.0.0.1:5174/?qa=1&qaMidi=1`. Timing preparation
used the existing **LOAD REDLINE SONG + TRIGGERS** and **LAPTOP · 540P** buttons.
A preceding one-cycle smoke passed six observations; its report explicitly
marks repeated resource convergence as uncovered.

## Observed result

The full gate passed **20 observations**, with **zero captured console errors
or uncaught browser exceptions**. Three cycles each exercised stopped
Perform↔Timing switching, playing Perform→Arrange→Perform, and playing
Timing→Arrange→Timing. During Arrange, the original playback workspace retained
engine ownership. Hidden rack previews stopped advancing their rendered frame
IDs while the PGM source continued to render and the Arrange monitor remained
visible.

| Measurement | Result |
|---|---|
| Exposed rack decoder handles | 12 throughout |
| Canvas DOM elements | 13 in native workspace; 14 in Arrange; 13 on return |
| Timing resident assets | 12 throughout |
| Pending resident loads at observations | 0 |
| Resident accounting | 4,611,686,400 bytes initially in Perform; 3,873,484,800 from first Timing observation onward |
| Subsequent resource growth | None above each workspace/view baseline |
| Observation duration | 2.575–2.747 seconds |
| Audio-context/playhead advancement | 2.589–2.749 seconds per observation |

Both final-cycle workspaces also passed actual browser background/foreground
roundtrips. The runner activated a temporary `about:blank` target, required
`document.hidden === true` in the app, waited a further two seconds, and restored
the app target. Production lifecycle recovery resumed the observation without
calling the QA transport-start or audio-resume hooks after returning. These
checks establish recovery after a short real tab absence; they do not cover OS
sleep, long suspension, mobile interruptions, or GPU-device loss.

Raw local evidence, intentionally under ignored artifacts:

- `svelte/.artifacts/workspace-lifecycle-full.json`
- `svelte/.artifacts/workspace-lifecycle-smoke.json`

## Scope and review notes

This is lifecycle/resource acceptance, **not a cadence or input-latency pass**.
PGM `renderCount` resets on source selection (`WebGpuEngine.setPgmLiveModule`),
so the gate compares rendered timeline frame IDs for progress instead of
interpreting counter deltas as FPS. Dedicated cadence and visual gates remain
required.

Counts describe exposed rack handles, Timing resident accounting, and DOM
canvases, not total Chromium decoders, process GPU allocations, or every Perform
cache. The gate does not directly count RAF subscribers. Arrange's final blit
has no independent diagnostic counter, so visible monitor geometry plus an
advancing PGM source does not replace physical visual verification. Muted media
and audio-context progress do not prove audible output quality.

The runner fails closed when hooks, WebGPU, fixture media, Timing preparation,
required UI controls, or actual background visibility are unavailable. It
requires the existing development-only Redline control and a twelve-source
fixture rack. This baseline therefore does not certify a production URL with
those controls absent, arbitrary uploads, other browsers, or other GPU hosts.

Strict resource upper bounds can flag legitimate future caching-policy changes;
review their measured cause instead of weakening the gate automatically. Any
browser console error fails the run, including an unrelated optional-service
error. Playback checks assume the default 1× song speed and accommodate one
song wrap per sample; altered-speed or very short-loop fixtures need a dedicated
scenario. The default three cycles verify short repeat stability, not a
multi-hour leak test.
