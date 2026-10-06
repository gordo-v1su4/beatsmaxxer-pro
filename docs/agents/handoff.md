# Handoff — 2026-10-06

Where the Oct 5 session (V1S-64…68, 171–174, review bot) stopped, and what's next.
Read [`continuity.md`](./continuity.md) for the longer-running lanes.

## How we work (keep doing this)

- **Linear, one issue at a time:** move it to *In Progress* before starting, and on
  finishing move it to *Done* (or *In Review*) with a comment covering what changed,
  what was verified, and what wasn't. Project: Beatsmaxxer Pro (team V1su4).
- **PRs, squash-merged.** Open the PR, **wait for the review bot to finish**
  (Kimi Code `k3`, see `AGENTS.md` → *PR review bot*), fix real findings, reply to
  the ones you decline, then merge. Don't start the next thing until the review is
  resolved.
- **Arrangement work copies Ableton.** LIVE = Session, PLAY = Arrangement playback,
  REC = Arrangement Record, Export = Export Audio/Video.
- **Layout:** previews are always full-card 16:9 and identical; the PGM monitor
  stays ~1.9× a preview (sized from rack width, `21cqw`). Below the minimum size
  the page scrolls; it never squeezes or zooms Perform/Timing.

## Done (all on `main`)

| PR | What | Linear |
|---|---|---|
| #29, #32 | FX shader compiles per effect mode, async (≈22s → ≈3s cold); review fixes | V1S-64 (splash still open) |
| #30, #31, #38 | Section edits, clip scenes (AUTO-CLIPS), LIVE/PLAY/REC, review fixes | V1S-65…68, 171 — Done |
| #33 | Realtime video export (WebM) from the arrangement | V1S-172 — Done |
| #35 | Hand cuts launch-quantize to the next bar; ghost cut drawn ahead | V1S-173 — Done |
| #36, #37 | Rack/Timing previews equal 16:9, PGM dominant, real scroll, compact Inception/Transition | V1S-174 — Done |
| #34, #39 | Review bot: native OCR binary + Kimi Code `k3`, vendored (public repo), hardened | — |

## Next, in order

> **Kimi Code has a 5-hour usage window.** The last #39 verification run (37410304750)
> got `403 You've reached your 5-hour usage limit`. Every step around the model call
> passed (both pinned hashes, token-less fetch, key scrub, upload). Space out review
> runs, and don't re-dispatch a review that's still running.

1. **Review what merged without a finished bot review: #32, #33, #34, #35, #38.**
   The workflow only reviews *open* PRs, so open a temporary **draft** PR whose
   base is a branch at `d97968d` (just before #32) and whose head is current `main`.
   That diff covers all of them. Let the bot finish, collect the findings, then
   close the PR without merging and delete both temp branches.
2. **One cleanup PR** with every real finding from step 1, plus these already
   known ones from the bot on #36/#37:
   - `.mix-strip-rail` (app.css) is missing `.rack-section-rail`'s
     `box-shadow: inset -1px 0 0 rgba(255,255,255,0.018)`; better, share one rail
     class between `MixSection.svelte` and `Section.svelte`.
   - `.rack-workspace .rack-main { container-type: inline-size }` sits inside the
     `min-width: 961px` media query, so below 961px `MainViewer`'s `21cqw` falls
     back to the viewport width. Move it out of the query.
   - `.app-viewport` on desktop: add `scrollbar-gutter: stable` so the scrollbar
     appearing doesn't shift the surface 8px.
   - `ModuleControls.svelte` ~L121: the PACK loop comment still says
     "these sit in `repeat(8, 1fr)`". Now `auto-fill, minmax(34px, 1fr)`.
   - (#36's "desktop can't scroll" finding was already fixed by #37.)
3. **Port #39's workflow hardening upstream** to
   `proxmox-home/.github/workflows/ocr-review-reusable.yml` (or ask Codex): pinned
   `OCR_BIN_SHA256` + `OCR_POST_SHA256`, fail-closed key scrub before artifact
   upload, `persist-credentials: false`, `if-no-files-found: warn`, drop the unused
   `exit_code` output. Then re-sync this repo's vendored copy from it.
4. **Timeline coordinates** (arrangement): the ruler, sections and cuts are on the
   beat-grid axis (bar 1 = 0), while the playhead, seek, loop and recorded marks use
   file time. On songs with a lead-in they're offset by `beatGrid[0]`. Section-edit
   boundary snapping has the same root cause (deferred bot finding on #30). A task
   chip was spawned for this; see `timelineScale.ts` /
   `tests/unit/arrangement/timeline-grid-issue10.test.ts` first.

## Not verified live (check on the desktop)

PLAY override → BACK TO ARRANGEMENT; REC writing cuts (replace vs OVERDUB);
AUTO-CLIPS recall across a section boundary; a full EXPORT (short LOOP → play the
file); the ghost cut on a queued PGM pick; the splash animation during the (now
async) shader compile. The preview pane can't run the playback loop.

## Ideas waiting on Gordo (not yet Linear issues)

- REC "paints in" like Ableton: empty until recorded, a red region growing with the
  playhead with ticks inside, the take becoming a movable clip.
- Effect automation lanes (envelopes per MIX/P0–P3 that the playhead follows).
- V1S-171 leftover: show the LIVE/PLAY/REC mode in PERFORM.
- V1S-172 follow-ups: 1080p/720p export size (offscreen target); Tauri save path;
  MP4 where MediaRecorder can't.
- V1S-64: splash redesign (Gordo's design).

## Review-bot findings declined on #39 (with replies on the PR)

`BASE_REF` "injection" (quoted expansion, not exploitable); `resolveOutdated: 'true'`
(the helper expects a string); `issues: write` for the sticky summary (it posts fine
with `pull-requests: write`); re-review on push (by design: manual dispatch);
scrubbing encoded forms of the key (overkill for this threat).
