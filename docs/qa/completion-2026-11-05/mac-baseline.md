# Physical MacBook baseline

November5,2026, isolated detached90c92e4; original dirty checkout preserved.
AppleM3AirMac15,12,16GB,8CPU/10GPU cores,macOS26.7.2,Chrome156.0.8078.80.
Safari27.2 inventoried but not tested by theseChrome gates. Existing Bun1.3.14/FFmpeg9.0.2 used with process-localPATH.

Check0errors/0warnings; units1128passed/16skipped/1TODO; production build/clientbundle pass.
An initial media-root environment failure was retained, then the full unit suite passed after removing that inherited variable.

Headed installedChrome lifecycle3cycles+actual background/foreground:20observations passed.
Twelve exposed decoder handles and12Timing assets; resident4,611,686,400bytes,zero pending at observations; runningaudio clock.
This is exposed accounting rather than totalOS/GPU allocation.

Perform cadence: all6sixty-second cases passed at original150ms/min3loop thresholds; each source completed at least4loops.
Straight/swing/dotted × linear/random source-gap maxima:109.6/92.4/105.3/106.5/106.8/114.0ms.
Animation-frame maxima ranged67.1–83.5ms; aggregate decoded-drop counters ranged2273–2934 across the twelve slots per case.
These results establish the existing gate's pass, not zero drops, physical smoothness or universal latency.

Actual post-runChrome screenshot inspected locally: realPGM and twelve distinct previews,playing/WebGPU/visible,12clips.
Artifacts: `.artifacts/completion-2026-11-05/mac/` contains lifecycle/cadenceJSON,logs and `perform-visible.png`.
Audio was muted deliberately; physical sound quality, display scanout latency,Safari and MacTauri remain unverified.

## Trusted input acceptance at pushed revision 11385bd

The isolated worktree was inspected clean at `90c92e4`, fetched from its verified
GitHub origin, and moved detached to exact pushed revision
`11385bde17958aa5771b1d8fa2321b23d4229593`. It remained clean after this test.
The original dirty checkout was untouched. The existing strict-port development
server (PID 45002, port 5174) served this isolated tree; no dependencies were
installed. Physical Mac hardware and installed Chrome were used through remote
CDP automation, with no human-observer attestation.

Exact remote shell invocation from the isolated `svelte/` directory:

```bash
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
HEADLESS=0 INPUT_LATENCY_REPORT=.artifacts/mac-input-latency.json bun scripts/verify-input-latency-runner.ts
```

The unmodified defaults passed **24/24** intended trusted MIX moves. All 24 held
pointer capture; MIX moved from 100 to 70. DOM/encoded-frame thresholds remained
p95 ≤100 ms and maximum ≤150 ms. Twelve decoded sources, playing audio context,
and volume zero were verified. No browser/probe errors or long-task entries
were recorded. Chrome was closed by the harness afterward.

| Event to measurement | p50 | p95 | Maximum |
|---|---:|---:|---:|
| Capture-handler arrival | 1.2 ms | 21.9 ms | 25.1 ms |
| DOM percentage update | 1.7 ms | 22.3 ms | 25.7 ms |
| Matching encoded GPU frame | 4.4 ms | 24.5 ms | 28.5 ms |
| GPU queue completion | 10.1 ms | 174.8 ms | 189.6 ms |

**The GPU-completion tail is materially higher than the encoded-frame latency.**
The gate records GPU completion but thresholds DOM and encoded-frame latency;
its pass therefore does not certify a low GPU-completion tail. Queue completion
can include preceding work and does not measure compositor presentation. This
tail remains a separate profiling angle, alongside the existing Mac cadence
drop/RAF measurements above.

The report and screenshot were copied to local ignored evidence:

- `.artifacts/completion-2026-11-05/mac/mac-input-latency.json`
- `.artifacts/completion-2026-11-05/mac/mac-input-latency.png`

The screenshot was inspected locally: actual playing PGM, twelve video previews,
and transition MIX at 70%. This does not establish physical audio quality,
display scanout latency, arbitrary uploads, Timing-control latency or Safari
acceptance.
