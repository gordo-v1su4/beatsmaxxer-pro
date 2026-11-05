# Mixed-resolution Timing export

Implementation checkpoint: 2026-11-05. This defines the selected policy, CPU regression evidence and the remaining actual-file acceptance. It does not claim that a real mixed-resolution export has passed browser/codec verification yet.

## Delivery contract

Timing export uses one explicit output canvas for the whole take. The default is **1920×1080**, independent of the opening clip, source order, live monitor dimensions and resident preview profile. Callers can pass `ExportOptions.output: {width, height}`; the UI presets are 854×480, 1280×720 and 1920×1080.

Each source fits inside that canvas with preserved aspect ratio, including enlarging smaller sources. Uncovered pixels are cleared to black; sources are not cropped or stretched. Choosing 1080p for a 480p source produces a 1080p file but adds no original detail. Prepared Ramp media retains its prepared-source quality; a larger delivery canvas cannot recreate missing source detail. Original decode, prepared media, resident preview size and output size remain separate concepts.

Sizes are copied at export start and remain fixed even if the caller's object later changes. Validation requires positive even integer dimensions, each axis at most 3840 pixels and at most 3840×2160 total pixels, including portrait output. Invalid output is rejected before capture starts. The browser may still reject a supported-size encoder/configuration; existing finalization fails closed rather than downloading a partial or preview-only substitute.

**Perform remains a realtime recording at current monitor dimensions.** The new output setting belongs to Timing. It must not be presented as a Perform resolution control.

## Active path verified in source

`arrangementExport.ts` records the range/audio, then calls `prepareNativeTimingTake` before `finalizeRecording`. Timing supplies original-source frames at the saved take's requested timestamps. The finalizer passes native `width`/`height` as `processedWidth`/`processedHeight`; the Resolve bundle uses those same sequence dimensions. This is an active path, not an unused helper.

Native decode remains bounded to two live source inputs. Frame samples are released after fitting, and native export/session ownership is released on completion/error. Size validation precedes native-session acquisition.

## CPU regressions

From `svelte/`:

```sh
bun run test tests/unit/export
```

Checkpoint: **58 tests passed across seven export test files**, including:

- 480p-first and 1080p-first orders both produce default 1080p frames.
- Explicit 480p/720p/1080p size remains consistent across all mixed sources and caller mutation.
- Portrait, square, 4:3 and ultrawide contain geometry, black-bar clearing and source-sample release.
- Smaller 4:3 source upscales into a 720p canvas without cropping.
- Invalid/fractional/odd/unbounded dimensions and pathological skinny surfaces fail before decode; bounded portrait delivery succeeds.
- Active arrangement export forwards frozen dimensions to native preparation and native video into finalization, then releases ownership.
- Finalizer conversion receives each selected output size and retains requested timestamps/CFR frame durations through the audio tail.

The initial policy tests ran red against first-source sizing before production changes. These tests mock decode/canvas/encoder boundaries and do not prove codec output, real decoded color/aspect fidelity or audible synchronization.

## Actual mixed-media gate

Run only after the shared GPU slot is available. Preserve the exact source revision and all failed artifacts. Generate test fixtures into ignored `.artifacts/`; never overwrite the existing media library. Use the installed FFmpeg development tool and first confirm the selected encoder exists.

PowerShell fixture example, from repository root:

```powershell
New-Item -ItemType Directory -Force .artifacts/mixed-resolution-export | Out-Null
ffmpeg -hide_banner -encoders
ffmpeg -hide_banner -n -f lavfi -i 'testsrc2=size=854x480:rate=30:duration=2' -an -c:v libx264 -pix_fmt yuv420p -g 30 -movflags +faststart .artifacts/mixed-resolution-export/source-480.mp4
ffmpeg -hide_banner -n -f lavfi -i 'testsrc2=size=1280x720:rate=30:duration=2' -an -c:v libx264 -pix_fmt yuv420p -g 30 -movflags +faststart .artifacts/mixed-resolution-export/source-720.mp4
ffmpeg -hide_banner -n -f lavfi -i 'testsrc2=size=1920x1080:rate=30:duration=2' -an -c:v libx264 -pix_fmt yuv420p -g 30 -movflags +faststart .artifacts/mixed-resolution-export/source-1080.mp4
```

Then drive the actual application import/take/export flow, not `NativeTimingVideo` alone. Use a known clean song, a short fixed range and 30 FPS. Export both source orders (480→720→1080 and 1080→720→480) with the same explicit 1080p output. Export again at 720p and 480p. Capture the selected output UI and native/finalizer diagnostics; save the actual downloaded file, not an object-URL name without its bytes. Repeat a representative case using real motion clips. Export codec/container is capability-dependent; record what was actually produced.

Probe each output, supplying its real downloaded path:

```powershell
ffprobe -v error -count_frames -show_entries stream=index,codec_type,codec_name,width,height,pix_fmt,avg_frame_rate,r_frame_rate,nb_read_frames,sample_rate,channels,duration -show_entries format=format_name,duration -of json .artifacts/mixed-resolution-export/take-1080.webm
ffmpeg -v error -i .artifacts/mixed-resolution-export/take-1080.webm -map 0:v:0 -f framemd5 .artifacts/mixed-resolution-export/take-1080.framemd5
ffmpeg -v error -ss 1 -i .artifacts/mixed-resolution-export/take-1080.webm -frames:v 1 .artifacts/mixed-resolution-export/take-1080-frame.png
```

Required assertions:

1. Both reorderings encode the chosen dimensions and 30 FPS with valid decodable video and the intended audio track. Frame counts/duration fit the selected range and audio-tail policy; reject empty/truncated output.
2. Reopen the downloaded output in a real browser/player. Motion advances before and after every source switch; compare decoded frames against source content/timestamps. A constant-size header alone does not prove the correct clip was rendered.
3. Add 640×480, portrait, square and ultrawide fixtures. Inspect first/last edges and black bars using decoded pixels; no aspect distortion, unintended crop or previous-frame pixels remain in the bars. Keep a known-color border fixture when automating geometry assertions.
4. Re-export a Timing take after reducing resident preload resolution. Output size remains explicit, while actual original-source detail matches the same chosen source. Label prepared-Ramp quality separately.
5. Cancel during capture/finalization; test missing/corrupt/unsupported media and recovery. No partial download, stuck transport/export state or retained native session remains. Repeating the successful export after recovery must work.
6. For Resolve bundles, verify sequence dimensions and reopen/import against the reference video; changing reference canvas dimensions alone is not Resolve interchange acceptance.

The existing `visual-proof-verification.ts` probes source media metadata but does not verify arbitrary exported take files. This gate therefore requires inspecting the actual output bytes and decoded frames. Physical audio quality and sound-to-photon timing remain separate from file timestamp/codec checks.
