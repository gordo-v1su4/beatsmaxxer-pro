# Native GPU feature comparison

Shared source commit: 0150c43. WebView2 Edg/155.0.4283.62, public Redline Perform
demo, twelve slots, RANDOM order and one-beat cuts. All variants retained native
60 FPS preview targets and an uncapped PGM. Active paths were read from engine
diagnostics after each reload. This is source-cadence evidence, not a GPU timing
benchmark or a count of actual painted display frames.

| GPU configuration | Seconds | Gate | Ordinary max gap | Ramp max gap | Decoder drops | rAF callbacks/s |
|---|---:|---|---:|---:|---:|---:|
| [Baseline](fx-baseline-120s.json) | 120 | Pass | 133.4 ms | 133.4 ms | 64 | 38.37 |
| [Immediates only](fx-immediates-120s.json) | 120 | Pass | 133.3 ms | 116.7 ms | 67 | 38.43 |
| [Shared bindings only](fx-shared-bindings-120s.json) | 120 | Pass | 100.1 ms | 100.2 ms | 50 | 38.55 |
| [Both, instrumented](fx-both-instrumented-120s.json) | 120 | Pass | 133.3 ms | 133.2 ms | 86 | 38.48 |

Each run observed at least three source swaps per slot. STUTTER's deliberate
holds retain their existing exemption; the ordinary 150 ms and ramp 250 ms
limits were unchanged. Drops are nonzero in every row. Single samples and
random PGM choices do not establish a speed ranking; the lower shared-only
maximum is not proof that enabling immediates makes playback worse.

The both-enabled runs used lightweight upload/event instrumentation; the other
three did not. A [190-second both-enabled run](fx-both-instrumented-190s.json)
also passed through the song restart. Across 50,134 GPU video-copy calls, the
longest synchronous copy was 2 ms. Total copy-call time was 4.49 seconds over
approximately 192 seconds. No pixel readback or CPU renderer was used.

The [earlier uninstrumented current-source repeat](final-native-0150c43-120s.json)
failed with a 216.7 ms source gap around song second 64.4. It remains unresolved.
These comparisons neither erase that failure nor identify its cause. They
provide no consistent evidence that reverting either feature would solve it.
Both normal feature paths were restored after the comparison, the URL was
returned to its normal root, and playback was stopped.

Machine-readable settings/results: [native-fx-comparison.json](native-fx-comparison.json).

OCR run 39827525357 timed out after repeated Kimi HTTP 429 five-hour quota
errors. Its result JSON was empty. This is not a completed review; no merge or
release was performed.
