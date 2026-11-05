# Mac GPU-completion tail investigation — November 5, 2026

**Disabling nonessential previews did not reliably remove the completion tail.**
These measurements do not justify shipping an adaptive preview policy. The
DOM/encoded-frame input acceptance still passes; queue-completion tails are a
separate unresolved profiling question.

## Hypotheses declared before the diagnostic runs

1. **Cold pipeline/texture work.** The original 11385bd input trace had its largest
   tails on moves 2–5. Prediction: a warm repeat with all twelve previews should
   lose the tail without changing resource counts.
2. **Sustained preview rendering/copy backlog.** Prediction: keeping all twelve
   decoder handles and media identities, but rendering only PGM plus the target
   preview, should materially reduce warm queue-completion p95. Restoring full
   previews should restore the tail.
3. **Delayed JavaScript callback delivery.** Prediction: completion tails should
   coincide with main-thread stalls or long render calls. A large GPU-completion
   tail with short render calls and smaller event-loop delays weakens this
   explanation, although it cannot exclude browser/GPU-process dispatch delay.

## Method and preserved identity

Physical Apple M3 / 16 GB Mac, macOS 26.7.2, headed Chrome 156.0.8078.80; isolated
worktree and existing strict-port dev server. Original dirty checkout preserved.
No OS, driver, browser flags, dependency versions or acceptance thresholds changed.
Audio volume was zero; no human-observer attestation is claimed.

The new `svelte/scripts/diagnose-gpu-completion-tail.ts` is a **diagnostic script**,
not a product acceptance shortcut. It adds no render loop. It observes the
existing `renderAll()` submission, requires 24 trusted MIX moves per phase,
matches integer DOM percentage and encoded normalized MIX on a newer frame, and
bounds completion collection to three seconds after the drag. All cases kept
twelve decoder handles, identical source URLs, element identities, filenames
and dimensions. The target was transition / `top-0` with PGM active.

The reduced case used the public engine `setCanvasActive()` method to deactivate
the other eleven preview bindings; diagnostics required their skip reason to
remain `inactive`. This is deliberately different from the normal product
workload. It did not remove clips or media elements. Full binding activity was
restored afterward; the isolated browser was closed after every run.

“Cold” here means the first drag in a fresh isolated browser profile, after
the input gate's normal two-second playback settle. It does not mean a cold OS,
empty driver shader cache, or the first frame after application navigation.

The additional stopped case was added only after preview reduction failed to
isolate the tail. It stopped the transport with all sources retained and the
same two render bindings active. It changes the continuous media/timeline
workload bundle and therefore cannot distinguish decoding alone from other
time-driven processing.

## Fixed-source results at 11385bd

Both fresh-browser diagnostic runs used exact
`11385bde17958aa5771b1d8fa2321b23d4229593`. The second added queue API call counts
and the stopped case. Each phase had 24/24 valid samples, zero browser/probe
errors, and zero recorded long-task entries with the observer supported.

First run, event-to-GPU-completion p95:

| Full cold | Full warm | Reduced warm diagnostic | Full restored warm |
|---:|---:|---:|---:|
| 124.8 ms | 135.3 ms | 137.1 ms | 155.3 ms |

Extended run:

| Phase | Event→GPU completion p95 / max | Submission→completion p95 | Maximum synchronous render call | Maximum 10 ms timer overrun |
|---|---:|---:|---:|---:|
| Full cold | 143.2 / 209.1 ms | 123.7 ms | 2.7 ms | 22.4 ms |
| Full warm | 181.8 / 198.8 ms | 167.2 ms | 3.0 ms | 18.2 ms |
| Reduced warm diagnostic | 137.6 / 147.2 ms | 115.1 ms | 3.2 ms | 19.0 ms |
| Full restored warm | 145.5 / 189.9 ms | 123.1 ms | 3.1 ms | 13.8 ms |
| Reduced stopped diagnostic | 98.9 / 129.7 ms | 82.2 ms | 19.8 ms | 39.3 ms |

Observed queue calls during each approximately two-second drag phase:

| Phase | `submit` | `copyExternalImageToTexture` | `writeBuffer` | Paused source elements |
|---|---:|---:|---:|---:|
| Full cold | 188 | 55 | 306 | 1 |
| Full warm | 177 | 52 | 292 | 1 |
| Reduced warm diagnostic | 122 | 0 | 48 | 1 |
| Full restored warm | 185 | 51 | 304 | 1 |
| Reduced stopped diagnostic | 24 | 0 | 48 | 12 |

`writeTexture` was available and counted zero in every phase. Counts cover all
calls through the exposed application queue, not just one preview. Eliminating
these explicit external-image copies does not eliminate implicit decoder,
external-texture import or browser compositor work.

The device exposed `core-features-and-limits` only; `timestamp-query` was absent.
Queue completion and `setCanvasActive` APIs were available. Actual GPU timestamp
duration was therefore not measured. These timings include callback delivery;
timer-overrun instrumentation weakens a large JavaScript-only stall explanation
but does not isolate driver scheduling or GPU-process callback batching.

## Separate source-change comparison

After the fixed-source experiments completed, the clean tracked isolated tree
was fetched and moved to pushed paused-preview fix
`9d2be168f1356e8f1a73101efde9f3ac203d8f9c`. The new diagnostic script remained an
intentional untracked file; original checkout and media were preserved.

A fresh browser ran the original full twelve-preview input gate with unchanged
24-move / 80 ms / 100 ms p95 / 150 ms maximum settings. It passed 24/24:

| Measurement | p95 | Maximum |
|---|---:|---:|
| DOM percentage update | 22.4 ms | 25.0 ms |
| Encoded GPU frame | 25.5 ms | 28.8 ms |
| GPU queue completion | 136.4 ms | 138.3 ms |

The screenshot was inspected: real PGM and twelve video previews, MIX 70%.
This single source-change comparison does **not** establish that the paused
first-frame fix prewarms or resolves the tail. The queue tail remains, and its
value lies within the variability already measured on the previous revision.

## Interpretation and next decision

- Warming alone did not consistently eliminate the tail, weakening hypothesis 1.
- Removing eleven preview bindings substantially reduced explicit queue calls
  but did not consistently improve completion p95, weakening a preview-only
  version of hypothesis 2. A broader continuous media/timeline contribution is
  still plausible: stopping it reduced the tail, but did not eliminate it.
- Short playing render calls and smaller timer delays weaken a purely main-
  thread explanation for 100–180 ms completion tails. GPU/backend/browser callback
  scheduling and unsampled driver work remain unresolved.

Keep the existing product rendering policy. A future optimization should first
gain an attributable GPU/backend trace or a repeatable controlled experiment
that isolates decoder/controlled-effect work from queue notification behavior.
Do not equate completion callbacks with display scanout or apply reduced-case
numbers to product performance claims. These are small diagnostic samples,
not randomized or long-session statistical comparisons.

## Reproduction and local evidence

From the isolated Mac `svelte/` directory, with the existing Bun process PATH:

```bash
HEADLESS=0 GPU_TAIL_REPORT=.artifacts/mac-gpu-tail-11385bd-extended.json bun scripts/diagnose-gpu-completion-tail.ts
HEADLESS=0 INPUT_LATENCY_REPORT=.artifacts/mac-input-latency-9d2be16.json bun scripts/verify-input-latency-runner.ts
```

Use the recorded revision for each command; do not conflate them. Copied local
ignored evidence under `.artifacts/completion-2026-11-05/mac/`:

- `mac-gpu-tail-11385bd.json`
- `mac-gpu-tail-11385bd-extended.json`
- `mac-input-latency-9d2be16.json`
- `mac-input-latency-9d2be16.png`
