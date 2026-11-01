# Svelte performance reference

## Feedback loop first

Build an unattended measurement that catches the reported symptom before changing code. Record the target browser/device, navigation mode, cache state, dataset, and threshold.

For startup issues, capture at least:

- navigation to first paint and first useful interaction;
- named application startup phases;
- long tasks or event-loop stalls;
- initial JavaScript and CSS transfer/evaluation;
- component/canvas/media mount counts;
- GPU pipeline, media decode, network, and audio-permission waits separately.

For interaction lag, capture event-to-render latency and isolate JS, layout, GPU, media, and network work.

## Optimization order

1. Mount only the active surface's component tree.
2. Remove unnecessary synchronous work before the first useful frame.
3. Defer optional initialization until after first interaction or an idle period.
4. Avoid eagerly importing, compiling, decoding, fetching, or allocating every feature when startup needs a subset.
5. Keep hot reactive state narrow and avoid large object/array recreation.
6. Reduce work per animation frame only after profiling identifies it.

Do not claim an iPhone fix from Android/Chromium emulation. Chrome on iOS uses WebKit. Use a WebKit iPhone profile for script, layout, and lifecycle behavior, then retain a physical-device check for real iOS GPU, thermal, memory, and media behavior.

After the fix, rerun the original measurement, the minimized regression gate, `svelte-check`, and the production build. Remove temporary instrumentation.
