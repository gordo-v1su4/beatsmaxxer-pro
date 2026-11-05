# Trusted MIX drag latency — November 5, 2026

Passed **24/24 intended drag values** against the actual Perform MIX control
with twelve decoded fixture videos and running song audio (muted). No production
optimization or threshold change was required.

Environment: Windows 11 Pro 10.0.26200, headed Chrome 157.0.8103.38, strict
`127.0.0.1:5174` dev server. HEAD was
`90c92e4b564c30d4fd26cb06b5c6d895079d36b1` plus the uncommitted named-preset UI
and harness changes. Imported UI source was held fixed during the measurement;
other local GPU work and root builds/tests were paused. Chrome used an isolated
profile and was closed after the run.

Exact successful PowerShell invocation, from `svelte/`:

```powershell
$env:HEADLESS='0'
$env:INPUT_LATENCY_REPORT='.artifacts/completion-input-latency-corrected.json'
bun scripts/verify-input-latency-runner.ts
```

All measurement defaults remained unchanged: `transition` MIX, 24 moves at
80 ms spacing, two pixels per move, 2,000 ms bounded completion window,
DOM/encoded-frame p95 limit 100 ms and maximum limit 150 ms. The drag moved MIX
from 100 to 70. Each move had to be trusted, change the DOM percentage, encode
the matching normalized GPU MIX on a newer rendered preview frame, and complete
its submitted GPU work. Every captured move retained pointer capture.

| Browser event to measurement | p50 | p95 | Maximum |
|---|---:|---:|---:|
| Capture handler arrival | 13.9 ms | 16.8 ms | 17.0 ms |
| DOM `aria-valuenow` update | 14.7 ms | 17.3 ms | 17.6 ms |
| Matching encoded frame submitted | 17.2 ms | 20.2 ms | 20.2 ms |
| GPU queue completion | 22.1 ms | 25.8 ms | 26.2 ms |

No browser/probe errors or long-task entries were recorded; the long-task
observer was supported. Audio remained running, twelve rack decoder handles
remained present, and the audio clock advanced.

Raw ignored evidence and screenshot:

- `svelte/.artifacts/completion-input-latency-corrected.json`
- `svelte/.artifacts/completion-input-latency-corrected.png`

The screenshot was inspected: live PGM plus all twelve video previews were
rendered, with the transition MIX at 70%.

## Preserved initial failures and harness corrections

The first unchanged run failed coverage **6/24**. Its raw report remains
`svelte/.artifacts/completion-input-latency-first-failed.json`. A diagnostic
repeat preserved events, actual percentages and pointer-capture state in
`svelte/.artifacts/completion-input-latency-diagnostic.json` plus its PNG.

Two harness assumptions were wrong. Rack wrappers round MIX percentages to
integers, so expecting fractional percentages missed legitimate updates.
Additionally, held CDP mouse moves require `button: 'left'` together with
`buttons: 1`; omitting the former lost pointer capture once the pointer left
the knob. With correct held-button metadata, all 24 moves retained capture.
The corrected expected percentage follows the existing integer contract.
The latency thresholds and move count/spacing were retained. The independent
evaluator's missing-coverage and stale-frame checks correctly rejected those
initial runs.

## Limits

Trusted CDP events measure browser-delivered input, not physical mouse hardware
latency. Encoded timing is after the existing `renderAll()` submission;
`onSubmittedWorkDone()` includes other queued work. Neither establishes
compositor presentation or visible-pixel latency. The observer wraps the existing
renderer temporarily and adds no RAF/render loop.

This is one sustained, deliberately spaced MIX drag under twelve fixture
videos. It does not certify faster coalesced input, other control types,
Timing controls, arbitrary uploads, physical audio quality, or other devices.
Fresh paused previews are a separate regression investigation; starting playback
before this test intentionally does not exercise their initial idle state.
