# DaVinci Resolve interchange for Timing takes

Research: 2026-10-18. **Prototype implemented; short Resolve import/render verified. Full arrangement acceptance remains open.**

## Decision

Prototype **DaVinci Resolve / Final Cut XML (`.fcpxml`)** for editable Timing-only takes. Keep the ordinary full-resolution video export as the visual reference and fallback. FCPXML describes source assets, timeline cuts and an explicit output-time → source-time map; this fits sampler jumps, holds and forward/reverse movement better than a cut-only EDL. Apple documents the mapping independently of any particular editor. Resolve's actual interpretation must pass the import gate below. [Apple timeMap](https://developer.apple.com/documentation/professional-video-applications/timemap), [Apple mapping example](https://developer.apple.com/library/archive/documentation/Miscellaneous/Conceptual/LegacyDTDsFinalCutPro/FCPXMLDTDv1.1/FCPXMLDTDv1.1.html), [Blackmagic XML conforming guide, lesson 4](https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-17-Colorist-Guide.pdf)

This is a named dialect and version, not a universal XML file. Do not advertise support for every NLE. Pin a DTD version and tested Resolve build before shipping. The reviewed Apple DTD is 1.10; schema validity alone does not guarantee a successful import. The old mapping example demonstrates reverse playback, not current Resolve compatibility. [Apple DTD](https://developer.apple.com/documentation/professional-video-applications/document-type-definition)

| Format | Fit for this feature |
| --- | --- |
| FCPXML | First prototype: explicit retime points, rational times, assets and per-asset formats. Validate Resolve's supported subset. |
| FCP 7 XML / XMEML (`.xml`) | Separate legacy dialect, not another extension for FCPXML. Defer unless another target requires it. Apple maintains a distinct archived specification. [XMEML reference](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/FinalCutPro_XML/Topics/Topics.html) |
| OpenTimelineIO (`.otio`) | Strong alternative for cuts/metadata. Resolve officially supports import/export; `.otio` references external media, while `.otioz` bundles complete media. Standard `LinearTimeWarp` and `FreezeFrame` represent constant speed and hold; do not assume an arbitrary ramp in custom metadata will execute in Resolve. [Blackmagic OTIO guide, pp. 10–11](https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_18.5_New_Features_Guide.pdf), [OTIO schema](https://opentimelineio.readthedocs.io/en/latest/api/python/opentimelineio.schema.html) |
| EDL | Optional simple-cut fallback, not the fidelity target for nonlinear sampling. Blackmagic documents EDL as a more restrictive conform route than XML; that historical comparison is not proof of modern retime fidelity. [Blackmagic conform reference](https://documents.blackmagicdesign.com/UserManuals/DaVinci_Resolve_11_Reference_Manual.pdf) |

Resolve has free and Studio editions; do not describe Resolve itself as open source. OTIO is the open-source interchange project. [Blackmagic product page](https://www.blackmagicdesign.com/products/davinciresolve), [OTIO overview](https://opentimelineio.readthedocs.io/en/latest/index.html)

## Original media and relinking

Browser-selected `File` objects provide filenames, not the real absolute disk paths. The fake path from an input is not usable by an NLE. A blob URL also cannot serve as a portable reference outside the running browser. [MDN file input](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file), [MDN File.name](https://developer.mozilla.org/en-US/docs/Web/API/File/name)

Proposed export: one timeline plus a source manifest using stable asset IDs, original filenames, dimensions, duration, sample timestamps/rate, file size and optionally content hashes. Write escaped relative media URLs, for example `./Media/clip01.mp4`; provide instructions to point Resolve at the existing originals. Do not copy or rename originals silently. Apple permits relative URLs and offline assets; Blackmagic's conforming workflow locates missing media by selecting its folder. Relative-reference behavior in Resolve still needs testing. Duplicate basenames must produce an ambiguity warning and require explicit source selection, rather than silently choosing the wrong file. [Apple media-rep](https://developer.apple.com/documentation/professional-video-applications/media-rep), [Blackmagic XML relinking, pp. 108–109](https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-17-Colorist-Guide.pdf)

Cached preview frames never become the referenced export asset. Prepared/interpolated media is a separate source: if a ramp uses generated frames, referencing the camera original cannot recreate those generated pixels. Offer the prepared file or mark that section for baking. This is an implementation constraint, not a claimed interchange feature.

## Timing contract and limitations

Use the **same deterministic source-time evaluator as native video export**, not a second interpretation of chance, notes or loop behavior. Record/export resolved choices, including Random's seed, section snapshots, Finish Loop versus Restart and manual cuts. The current integration seam is `prepareNativeTimingTake` in `svelte/src/lib/export/nativeTimingTake.ts:16–49`; it recalls the take at the requested song position, selects PGM, and samples its original source through the native export session. Extract a pure mapping seam when implementing interchange; avoid running transport for an XML download.

Proposed mapping rules:

- Fix the destination FPS and export range. Represent output boundaries as integer destination-frame indices, and serialize times as rational seconds. Store each source's own timebase and start timecode separately; 24 and 24000/1001 are different. FCPXML uses rational seconds and per-format frame durations. [Apple DTD](https://developer.apple.com/documentation/professional-video-applications/document-type-definition)
- Use half-open internal ranges `[start, end)` and check the last visible frame explicitly. Native VFR inputs require the actual sample timestamp table rather than `frame = seconds × nominal FPS`. Reject unsupported inputs or bake them; do not silently reinterpret them as CFR.
- Split at source changes, sampler jumps, wrap/loop seams, trigger interruptions and discontinuities. Each loop iteration is another timeline use of the same original, not duplicated video data. Constant holds repeat one source frame; reverse has descending source time. Use explicit linear points for constant-speed runs. Use enough points for a ramp to preserve the evaluated destination-frame mapping; avoid editor smoothing that changes the curve. Apple's timeMap interpolates specified points. [Apple timeMap example](https://developer.apple.com/library/archive/documentation/Miscellaneous/Conceptual/LegacyDTDsFinalCutPro/FCPXMLDTDv1.1/FCPXMLDTDv1.1.html)
- Declare frame sampling deliberately. Apple distinguishes floor, nearest-neighbor, blending and optical-flow modes; requesting a mode in XML is not evidence that Resolve reproduces it. Compare exact source-frame choices against the native reference, especially reverse endpoints and mixed rates. [Apple frame sampling](https://developer.apple.com/documentation/professional-video-applications/frame-sampling)
- Preserve the song separately on an audio track. If tempo/pitch processing must match the browser, export that processed audio rather than assuming the NLE recreates the same DSP.

Custom WebGPU shaders are not portable editor effects. **Timing-only** interchange can preserve the cuts and source mapping without those shaders. A look including shaders needs native-resolution baked media, optionally split at edit boundaries with handles, plus a timeline referencing those renders. Do not silently omit the look or claim an editable shader translation. Likewise, NLE optical flow is not guaranteed to reproduce prepared interpolation.

## Implementation and acceptance plan

1. Extract a pure resolved-take map shared by video export and interchange. Unit-test song/range offsets, frame boundaries, source identity, no gaps/overlap, holds, reverse, loops, continuous/triggered sequences, both retrigger modes, seeded randomness, speed ramps and 23.976/24/30/60/mixed rates.
2. Generate a small FCPXML fixture from actual 720p clips. Validate it against the pinned Apple DTD; XML-escape names and encode URLs. Include a source manifest, processed song audio when needed, and the corresponding native video reference.
3. Import through Resolve's timeline import into a disposable project. Record the exact build/platform. Test both media beside the XML and offline import followed by relinking to a different original-media folder. Check filename collisions and unavailable/unsupported media explicitly.
4. Inspect cut count, ranges, FPS, resolution and source references; render the imported timeline and compare every output-frame source identity/PTS with the native reference. Check hold/reverse first and last frames, jump seams, ramp endpoints, sync at start/end and both Finish Loop/Restart sections. Use real media, no rainbow/checker acceptance fixture.
5. Ship only the verified subset. Any unsupported retime/effect must offer an explicit bake/fallback or block with a specific explanation. If FCPXML retimes fail, evaluate OTIO constant-speed segments with the same acceptance gate; do not assume a format change solves interpretation differences.

No Resolve import or render comparison was performed during this research. Blackmagic's current support index lists newer manuals, but the large current reference PDF could not be read through the web tool; the linked conform and OTIO documents are dated primary sources and do not establish compatibility with every current build. [Blackmagic support](https://www.blackmagicdesign.com/support)

## Desktop import evidence, 2026-10-18

Implemented a Timing-only FCPXML 1.7 prototype and tested in installed Resolve 21.1.1.10, isolated project `Beatsmaxxer Timing QA 2026-10-18`. A 72-frame 720p/24 fixture uses the real Redline original, reverse, hold, 2x forward and a discontinuous jump. Direct retimed asset-clips imported with source in-points reset: all 72 output frames were wrong. Explicit nested media ranges preserve in-points. The corrected output matches all 72 expected source frames: 71 by 160x90 image matching, the remaining near-identical adjacent pair disambiguated at 1280x720 (expected frame 65 MSE 10.893, adjacent 64 MSE 11.465). Exact integer frame rates now use rational `1/fps` values.

Resolve did not automatically find relative media URLs beside the XML; selecting the original-media folder relinked successfully. The diagnostic v4 fixture uses absolute URLs solely to avoid repeating that dialog. Product exports remain portable relative references. Full app-generated bundle, both retrigger modes, long arrangement, fractional/VFR sources and prepared media still require import acceptance. Prototype status remains explicit in the UI.

Evidence (git-ignored): `svelte/.artifacts/v1s-251/resolve-import/retime-smoke-v4.fcpxml`, `retime-smoke-v4-render.mov`, `smoke-v4-comparison.json`, `full-source.raw`, `full-output.raw`. The thumbnail JSON alone reports one ambiguous mismatch; full-resolution verification resolves it. No claim of universal NLE compatibility.


## Full two-mode app bundle acceptance

The actual app UI exported the portable take across SECTION 1 / VERSE 1 / VERSE 2 with Finish Loop and Restart snapshots. ZIP: `beatsmaxxer-2026-10-19-01-30-28-resolve.zip`. Its XML passes Apple's FCPXML 1.7 DTD. Imported the unmodified relative-path XML in Resolve 21.1.1.10 and selected the QA media folder. All 11 video assets (six originals and five included 96fps prepared files) plus song audio linked. Resolve rendered 982 frames, 1280x720/24, 40.917333 seconds. The browser reference contains the same 982 frames at 40.917 seconds. Mean normalized grayscale MSE against the reference is 2.629, max15.573 (160x90, encoding differences expected). Song versus rendered AAC correlation is0.99996296 with zero measured offset at8kHz, across a +/-50ms search. This is a tested 40.9-second range, not full-song or arbitrary-media certification.

Evidence: `svelte/.artifacts/v1s-251/two-mode-resolve/` includes reference, Resolve render, unmodified XML, source manifest, per-frame reference comparison, audio comparison and native Resolve screenshot. The failed initial 0.542-second bundle used an incorrectly selected range and is not acceptance evidence. Selection buttons can be covered at their center by inline section editors; use the exposed lower section background for multi-select.
