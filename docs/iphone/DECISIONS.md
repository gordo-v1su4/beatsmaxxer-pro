# iPhone Decision Log

Decisions are append-only. Changing a locked decision requires a new dated entry that supersedes it and identifies affected contracts, stories, tests, and mockups.

| ID | Date | Decision | Status |
| --- | --- | --- | --- |
| IPD-001 | 2026-08-05 | Create `codex/iphone-app` from `9ffd58a`; keep mobile planning and later work off web/desktop lines. | Accepted |
| IPD-002 | 2026-08-05 | Build iPhone before Android. | Accepted |
| IPD-003 | 2026-08-05 | Product is live performance plus recorded-decision replay/export, not automatic editing. | Accepted |
| IPD-004 | 2026-08-05 | Portrait handles preparation; both portrait and landscape support Live, with landscape preferred for performance. | Accepted |
| IPD-005 | 2026-08-05 | MVP supports one song, eight clips, and up to three minutes. | Accepted |
| IPD-006 | 2026-08-05 | First complete release is private TestFlight. | Accepted |
| IPD-007 | 2026-08-05 | Native SwiftUI shell plus shared Rust engine and native wgpu renderer. | Accepted |
| IPD-008 | 2026-08-05 | `AVAudioEngine` sample time is the sole authoritative playback clock. | Accepted |
| IPD-009 | 2026-08-05 | Live uses 720p30 proxies and at most three decoder lanes; export uses originals. | Accepted |
| IPD-010 | 2026-08-05 | Record versioned action events, then deterministically render 1080p30 H.264/AAC output. | Accepted |
| IPD-011 | 2026-08-05 | Analysis is local-first; do not embed a hosted-service secret in the app. | Accepted |
| IPD-012 | 2026-08-05 | Eight mobile effects, each with no more than three exposed parameters. | Accepted |
| IPD-013 | 2026-08-05 | Planning package precedes all production app scaffolding and includes an interactive wireframe plus three polished images. | Accepted |

## Decision detail

### IPD-003 — Performer, not automatic editor

Beatleap demonstrates that music-led mobile video creation can be approachable, but its automatic montage behavior is not the MVP product. Beat Surfer's differentiator is that the creator performs intentional clip and effect decisions. A future auto-performance system must emit the same take format rather than create a parallel renderer.

### IPD-007 — Native shell and shared engine

A Svelte/WebView wrapper would retain mobile-browser media limits and create another per-frame boundary. SwiftUI provides phone-native lifecycle, import, accessibility, audio session, and distribution behavior. Rust/wgpu preserves a path to shared scheduling, effects, deterministic replay, and eventual Android work.

### IPD-008 — One clock

Native code does not inherently solve synchronization. Audio sample time governs transport, beats, clip actions, effect actions, replay, and export. Display time only selects a frame to present.

### IPD-009 — Proxies and bounded lanes

Eight simultaneous animated previews would spend decoder, memory, bandwidth, and thermal budget on nonessential information. Static pad thumbnails plus current, incoming, and one prewarm lane preserve performance. Originals remain available for final rendering.

### IPD-011 — Local analysis

The current repository has no production mobile relay, and a packaged API key cannot remain secret. Local analysis plus manual correction keeps the private TestFlight build self-contained. A later hosted adapter must use real client authentication and preserve the same analysis contract.

### IPD-013 — Planning stop boundary

The first mobile branch milestone contains documents and mockups only. It must not introduce an Xcode project, Swift, Rust engine changes, video/audio behavior, TestFlight configuration, Android work, or web/desktop UI changes.
