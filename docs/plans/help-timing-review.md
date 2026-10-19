# Timing first-pass documentation and presentation

Owner review: October 18, 2026. This pass documents Timing and its first-cut review. Perform finishing and a combined Timing/Perform workflow remain separate design questions.

## Implementation checklist

- [x] Replace accumulated Help styles with the app font, compact type and thin spacing; flat fills, no card outlines or colored left rails.
- [x] Organize navigation by workspace: Start, Timing, Beats & bars, Arrange, Export video, Resolve, Perform overview.
- [x] Explain song analysis readiness: RHY·OK and ARR·OK; loading, missing data and clip preparation.
- [x] Explain all three Timing effects, MIDI triggers, chance/density/gaps, sampler launch and retrigger modes with examples and diagrams.
- [x] Replace the clipped curve illustration with a complete, labeled interactive curve.
- [x] Explain cuts versus effect motion; Balanced versus Random; saved takes versus a new recording.
- [x] Explain banks, song sections, recording, replay and portable arrangement files.
- [x] Separate video export from arrangement JSON and Resolve ZIP; document exact UI locations, relinking and current limitations.
- [x] Add actual UI screenshots with focused enlargements; retain an accessible text explanation for each.
- [x] Replace the native white Resolve checkbox with a compact app-colored toggle.
- [x] Make success toasts dismiss automatically; translucent background around 70%; keep active progress/errors actionable.
- [x] Match portfolio image dimensions to existing portfolio assets; capture clean high-resolution real-media screens separately from documentation crops.
- [x] Verify Help navigation, diagrams, mobile scrolling, screenshots, keyboard access, checkbox and toast in the browser; run Svelte check/build.

## Follow-up questions — not behavior changes in this documentation pass

- How should a Timing first pass become a Perform finishing pass? Current separate workspace behavior must be stated honestly.
- More varied shot lengths with a useful minimum: current effect ownership, common cycle lengths and trigger spacing can produce regular cuts. Random changes deck selection; it is not a shot-length editor.
- Which editing controls should shape shot-length variation independently from the effect inside a shot?
- Resolve export currently carries Timing edits and audio, not editable Perform shaders. The measured desktop roundtrip is 40.9 seconds; full-song native video was tested separately.

## Verification

Svelte check: 0 errors / 0 warnings. Production build passed. Browser: seven topics each show one section; all images load; desktop and mobile have no page-wide overflow. At 393px, all topic footers are reachable inside the viewport. The four-bar curve updates to 16 beats / 8 seconds. Resolve ON/OFF toggles aria-pressed and export uses the same state. Workflow save toast measured rgba(24,60,55,0.7), then automatically disappeared. Errors/missing-media messages remain dismissible.

Diagram skill's standalone animation-script checker is not applicable to this multi-topic HTML guide: its script implements navigation and the static curve duration illustration, not animated diagrams. Accessible SVG title/description IDs and layout were checked in the browser. Owner's app font, flat fills and compact sizes override the skill's default editorial skin.

Portfolio references inspected live on disk: Beatsmaxxer3840x2800, Pindeck3840x2160, TrailerFeed3840x2400, ReviewRoom1920x1200. Delivered three3840x2800 PNGs in svelte/.artifacts/portfolio-2026-10-18. Captured from real loaded UI as four bounded 2x browser tiles per view, stitched without resizing. Full-frame screenshot requests exposed a compositor tiling bug; defective captures were discarded.
