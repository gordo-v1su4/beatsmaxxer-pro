# Paused first-frame previews

Date: 2026-11-05. Branch: `codex/completion-verification`.

Fresh real-media QA previously showed test cards in ready rack slots until Play
or an effect parameter change. With transport stopped, its frozen timeline
prevented the preview cadence from noticing the first decoded frame. Scheduling
alone was insufficient: the effect pass also needed a semantic invalidation.

The binding state now includes the video element identity, ready-frame state and
source URL. First readiness and replacement invalidate once without advancing
the transport. Advancing video time stays outside this semantic key, preserving
the existing playback cadence limit and idle stopped behavior.

Regression tests reproduced the missing repaint before the fix. They cover
first decode, same-slot replacement, the actual effect-plus-blit pass, subsequent
idle frames and the existing playback cap. Full Windows suite: 1,156 passed,
8 skipped, 1 existing TODO; Svelte check: zero errors/warnings; production build
and client bundle guard passed.

Native in-app browser proof used a fresh `/?qa=1&desktop=1` session with real
footage, twelve ready slots and the transport still showing Play. All twelve
previews displayed footage before playback. Selecting a named Punch preset then
changing Mix by one unit correctly displayed Custom. This verifies initial
picture behavior; it does not certify physical audiovisual latency or explain
the separate Mac GPU-completion tail.
