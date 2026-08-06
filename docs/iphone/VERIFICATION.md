# Planning-Package Verification

Verified on 2026-08-05 from branch `codex/iphone-app`, based on `main` commit `9ffd58a`.

## Interactive wireframe

The self-contained wireframe was served locally and exercised in Chromium using Playwright CLI.

### Layout matrix

Seven screen modes were checked at three phone classes, for 21 combinations:

- Projects
- Create and Import
- Prepare
- Portrait Live
- Landscape Live
- Takes
- Export

Reference sizes:

- 390×844 portrait / 844×390 landscape
- 393×852 portrait / 852×393 landscape
- 430×932 portrait / 932×430 landscape

Result:

- 21/21 combinations had no horizontal overflow.
- Both Live views had no vertical overflow at every size.
- Every visible button was at least 44×44 CSS pixels in its unscaled phone coordinate system.
- Browser console contained zero errors and zero warnings after the favicon fix.
- Live faders rendered with a 3-pixel track and a narrow 5×13 rectangular thumb; visible Prepare scrollbars used rectangular thumbs.

### Simulated journey

The browser automation completed this state sequence:

1. Projects → New Project opened Create and Import.
2. Choose Song changed status to `Analyzing`.
3. Add from Photos changed the count to `6 / 8`.
4. Advancing analysis reached `Ready · 124 BPM`.
5. Tapping clip 04 queued `04`.
6. Starting transport executed the queued cut and changed PGM to `04`.
7. Record Take exposed the recording state and stopped cleanly.
8. Render Video progressed to completion and exposed Photos, Files, and Share.

No real media, analysis, recording, or export was invoked.

## Static concepts

The three built-in image-generation results were inspected for hierarchy, state, number of clip slots, phone orientation, and legibility, then copied into the repository.

| File | Pixels | Purpose |
| --- | ---: | --- |
| `mockups/portrait-live.png` | 853×1844 | Portrait performance visual direction |
| `mockups/landscape-live.png` | 1796×876 | Landscape performance visual direction |
| `mockups/prepare-import.png` | 853×1844 | Preparation and import visual direction |

The static concepts were regenerated with the current Beat Surfer desktop screenshot as the primary style reference and the corrected wireframe views as geometry references. They were checked for the same technical rack language, hard-edged controls, eight default effect colors, rectangular fader treatment, and absence of generic rounded iOS music-app chrome.

Generated imagery is non-authoritative for fine typography and geometry. The interactive wireframe and `PRODUCT_SPEC.md` govern implementation.

## Documentation and scope

- All relative Markdown links resolved.
- `git diff --check` passed.
- All planned tracked changes are under `docs/iphone/`.
- No Xcode project, Swift, Rust engine, media implementation, web UI, desktop UI, dependency, or deployment file was introduced.
