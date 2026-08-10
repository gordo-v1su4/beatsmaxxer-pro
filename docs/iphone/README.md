# Beat Surfer Pro for iPhone

This directory is the planning and visualization package for a native iPhone version of Beat Surfer Pro. It deliberately contains no production iOS application, Xcode project, Rust media-engine implementation, or changes to the existing web and desktop products.

## Locked product direction

Beat Surfer Pro for iPhone is a live music-video performance instrument. A creator imports one song and up to eight video clips, performs beat-quantized cuts and effects, records those decisions, and replays the take for a polished export.

The first complete release is a private TestFlight build. It supports performances and exports up to three minutes, uses portrait screens for preparation, and provides both portrait and landscape Live views. Automatic Beatleap-style editing, Android, cloud accounts, and the public App Store release are later phases.

The interface remains unmistakably Beat Surfer: near-black technical racks, compact uppercase and monospaced labels, grid previews, hard rectangular modules, the existing eight effect colors, and narrow rectangular fader/switch/scroll handles. It is a phone re-layout of the current product, not a generic rounded iOS music app.

## Package index

- [Product specification](./PRODUCT_SPEC.md) — screens, dimensions, states, gestures, and copy.
- [Architecture](./ARCHITECTURE.md) — native boundaries, media flow, clocks, contracts, persistence, and export.
- [Backlog](./BACKLOG.md) — ordered epics and bounded implementation stories.
- [Test plan](./TEST_PLAN.md) — automated, visual, physical-device, and release acceptance gates.
- [Planning-package verification](./VERIFICATION.md) — browser, layout, interaction, image, link, and scope results.
- [Decisions](./DECISIONS.md) — locked choices and the reasons behind them.
- [Mockup prompts](./MOCKUP_PROMPTS.md) — reproducible prompts used for polished visual concepts.
- [Task-packet template](./task-packets/README.md) — the required handoff format for small implementation tasks.

## View the interactive wireframe

Open [mockups/iphone-wireframe.html](./mockups/iphone-wireframe.html) in a modern browser. It is a self-contained, local document and makes no network requests.

The top controls switch between:

- Project creation and media import
- Portrait Prepare
- Portrait Live
- Landscape Live
- Takes
- Export

Within the Live views, the clip pads, queued clip, quantization, transport, effect selection, effect amount, and record-take controls simulate the principal states. No real audio, video, analysis, recording, or exporting occurs.

## Polished concepts

- [Portrait Live](./mockups/portrait-live.png)
- [Landscape Live](./mockups/landscape-live.png)
- [Prepare and Import](./mockups/prepare-import.png)

These images establish visual direction only. Exact labels, geometry, state behavior, and accessibility requirements are governed by `PRODUCT_SPEC.md` and the interactive wireframe.

## Approval boundary

Approval of this package authorizes a later implementation phase; it does not itself authorize production app work. The first implementation task must still confirm the branch, supported iPhone, Xcode version, signing identity, and the zero-copy media spike described in the backlog.
