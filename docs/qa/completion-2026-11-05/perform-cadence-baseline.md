# Perform loop cadence — November 5, 2026

**Passed all six 60-second scenarios**, with no gate failures, on the local
Windows GPU host. Imported application source was held fixed at runtime baseline
`a5b863d7b2179b124d8d194a0802ed4abace6c03` throughout the run; concurrent commits
added documentation/harnesses only. HEAD after the run was
`90c92e4b564c30d4fd26cb06b5c6d895079d36b1`.

Environment: Windows 11 Pro 10.0.26200, headed Google Chrome 157.0.8103.38,
fresh isolated Chrome profile, strict-port dev server `127.0.0.1:5174`.
No other app/browser GPU gate ran concurrently. The existing runner set song
volume to zero. Chrome was closed by its harness after completion.

Exact PowerShell invocation from `svelte/`:

```powershell
$env:HEADLESS='0'
$env:PERFORM_LOOP_REPORT='.artifacts/completion-perform-loop-cadence.json'
$env:QA_URL='http://127.0.0.1:5174/?qa=1'
bun run verify:perform-loop-cadence
```

Defaults retained: 60,000 ms per scenario, 6,000 ms settle, 150 ms maximum
uncovered gap, minimum three loops and three advancing cached seams per measured
slot. Twelve rack decoders were required; ten ordinary-decoder slots were
measured. Speedramp, stutter and TimeSampler intentionally require separate
effect-aware acceptance and are excluded from this decoder-cadence measurement.

| Feel / order | Minimum loops | Minimum cached seams | Maximum source callback gap | Maximum cached-seam stale interval | Maximum RAF gap |
|---|---:|---:|---:|---:|---:|
| Straight / linear | 4 | 4 | 68.4 ms | 133.5 ms | 33.7 ms |
| Swing / linear | 4 | 4 | 67.5 ms | 133.5 ms | 33.6 ms |
| Dotted / linear | 4 | 4 | 67.7 ms | 133.6 ms | 33.6 ms |
| Straight / random | 4 | 4 | 68.2 ms | 133.4 ms | 33.7 ms |
| Swing / random | 4 | 4 | 71.6 ms | 133.5 ms | 33.6 ms |
| Dotted / random | 4 | 5 | 71.4 ms | 116.7 ms | 33.8 ms |

The runner recorded zero long-task and long-animation-frame entries in all six
scenarios. These observers are optional in its implementation; their absence
must not be interpreted as a universal long-task guarantee.

Raw ignored evidence:
`svelte/.artifacts/completion-perform-loop-cadence.json` (`complete: true`,
`pass: true`, `failures: []`).

This verifies fixture playback and loop coverage on this host. It does not
measure pointer/knob input latency, arbitrary-upload decoding, perceptual preset
differences, audible quality, Timing cadence, full-song export, or other browser
and device combinations. Those remain separate acceptance gates.
