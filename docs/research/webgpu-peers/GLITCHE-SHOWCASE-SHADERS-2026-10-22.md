# Glitché-inspired showcase shader research

Checked: 2026-10-22. Research and design recommendations only. No production shader edits, dependencies, rendered comparisons or performance benchmarks were performed. Scope: stronger visual transformations for the existing video effects, while preserving the chosen Barrel / Fisheye / Inception / VHS replacements for Halation / Anamorphic / Film Grain / Motion Streak, and retaining Punch Zoom / Drift Cam / Rack Focus.

## Reference identity and what is actually established

The developer-owned [Glitché site](https://glitche.com/) and [App Store listing, id634467171, Glitche Ltd.](https://apps.apple.com/us/app/glitch%C3%A9-photo-video-editor/id634467171) establish the reference. The listing describes more than 40 realtime filters covering digital glitches, datamosh glitches and analog artifacts, with control during recording/editing. Its screenshots and the developer's gallery are the visual reference locations; this research did not run the iOS app or verify its complete current named-effect catalog. Do not present Barrel, Fisheye, Inception, pixel sorting or point-cloud rendering as confirmed exact current Glitché menu names on this evidence alone.

The desired interpretation is aggressive, recognizable image restructuring: displaced sections, stretched color runs, folded space, warped lenses and temporal residue. That is a design interpretation of the requested inspiration, not a reproduction of proprietary Glitché shaders. Search also surfaced `glitcheapp.com` and Artfkt's separate product called Glitch; neither is used here as authority for Glitché features.

## Ranked candidates

These are five implementation families, ranked by useful visual impact relative to integration risk. Estimated cost is an engineering inference from the proposed algorithm, not a measured frame-time claim.

### 1. Digital tear / macroblock takeover for the existing Glitch

Build coherent horizontal slices and rectangular block regions whose UVs jump to different image locations. Add occasional channel permutation and retained-frame patches, rather than merely increasing RGB fringe or noise. Keep one seeded pattern for a musical subdivision so the result looks like a designed rupture rather than incoherent per-pixel flicker.

The permissive reference is [KinoGlitch DigitalGlitch.shader](https://github.com/keijiro/KinoGlitch/blob/master/Assets/Kino/Glitch/Shader/DigitalGlitch.shader): it samples a noise texture, thresholds displacement/frame/color masks, displaces source UVs, substitutes a retained trash frame, and shuffles color components. Its [controller](https://github.com/keijiro/KinoGlitch/blob/master/Assets/Kino/Glitch/DigitalGlitch.cs) manages the temporal textures. This is shader-based corruption imagery, not alteration of an encoded bitstream.

- **Amount:** increases affected area, slice offset and block size; use a soft threshold band to avoid a dead first half of the knob. At zero, output must be exactly clean. At medium settings, recognizable pieces of the source should visibly move; at maximum, large regions should be rearranged.
- **Audio:** bass onset triggers the rupture; beat subdivision selects the seed; high-frequency energy can drive a smaller channel split. Release returns toward the clean source. Avoid re-randomizing the pattern on every display frame.
- **Cost:** a spatial variant can fit one fullscreen pass with a small fixed number of source/noise taps. Retained-frame substitution adds a history sample and lifecycle responsibility. Do the spatial variant first so its value is independent of feedback changes.

### 2. VHS as tape instability, not another grain overlay

Combine line jitter, intermittent tracking bands, color/chroma misregistration and occasional vertical roll, with moderate scanlines. Give the frame an identifiable damaged-tape structure even when paused; animated tracking supplies motion when playing. Distinguish VHS from Digital Glitch by continuous/rolling distortion rather than block replacement.

[KinoGlitch AnalogGlitch.shader](https://github.com/keijiro/KinoGlitch/blob/master/Assets/Kino/Glitch/Shader/AnalogGlitch.shader) provides an inspectable reference for scanline jitter, vertical jump, horizontal shake and color drift. Its core output reads two differently displaced source samples. This supplies algorithms, not a complete physical VHS simulation.

- **Amount:** grows tracking-band height, displacement, chroma offset and dropout coverage. Do not implement Amount solely as opacity over a fixed-strength VHS image.
- **Audio:** onset briefly kicks tracking displacement; beat phase controls a rolling band; noise/grain should stay secondary. Use transport time for repeatable playback/export instead of uncontrolled wall-clock randomness.
- **Cost:** low to moderate; a few source taps plus procedural noise. Real chroma blur would increase sampling, so start with controlled channel displacement rather than a large blur kernel.

### 3. The selected Barrel / Fisheye / Inception spatial family

These should read as three different transformations, not three labels for zoom.

- **Barrel:** retain a broad central composition while straight edges curve outward increasingly near the frame edges. Scale the sampling domain so increasing distortion does not expose accidental black borders.
- **Fisheye:** use a pronounced spherical projection with center magnification and strong perimeter compression. A circular lens boundary or edge treatment is an intentional design choice; avoid accidentally clipping footage at ordinary amounts.
- **Inception:** fold the scene into mirrored planes, repeated corridors or rotating nested frames. Use a bounded analytic fold/repeat mapping for the first version; this is our descriptive effect name, not a claim to reproduce any film's proprietary VFX.

Evan Wallace's MIT [glfx.js bulge/pinch implementation](https://github.com/evanw/glfx.js/blob/master/src/filters/warp/bulgepinch.js) is an appropriate radial-warp reference: it exposes center, radius and signed strength with zero as identity. It is not itself a calibrated fisheye camera model. The [MIT glfx.js library](https://github.com/evanw/glfx.js) supplies reusable image-warp groundwork. A mathematical mirrored/folded-UV Inception variant can be authored independently; no proprietary source is needed.

- **Amount:** directly changes curvature, projection exponent or fold depth/spacing. A separate wet/dry crossfade, if present, changes the mixture afterward. For Inception, ramp distortion continuously before discrete repeated structures appear; avoid the impression of a simple fade into a static preset.
- **Audio:** bass drives radial pressure; beat phase gives a controlled lens inhale/exhale; Inception can rotate/fold on bar changes. Keep baseline distortion visible so these remain showcase effects without audio input.
- **Cost:** low for one remapped source tap; bounded multi-plane layering adds a handful of taps. Avoid unbounded recursion, huge loops or expensive blur in this family.

### 4. Feedback melt / compression-style frame damage

Quantize a displacement field into blocks and advect an owned previous-output texture, injecting fresh source pixels gradually. On hits, freeze or increase advection; on a bar boundary, deliberately refresh the source. This gives trails that drag the subject's previous positions across the frame.

[Three.js AfterimageShader](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/shaders/AfterimageShader.js) demonstrates a minimal old/new image combination with damped history. Kino's Digital Glitch above demonstrates selected retained-frame substitution. These are useful building blocks for an original WGSL feedback effect, not interchangeable with real codec datamoshing or optical-flow motion compensation.

- **Amount:** controls displacement magnitude, retention and fresh-image injection, with finite decay. Treat history reset explicitly at enable/disable, source replacement, seek/discontinuity, resize and device loss. At zero, bypass or cleanly refresh history so old footage cannot unexpectedly reappear.
- **Audio:** onset opens damage blocks, sustained bass raises retention, a musical reset periodically restores a clear image. History accumulation should be time-normalized so 30/60/120 Hz do not produce different melt rates.
- **Cost:** moderate and bandwidth-sensitive: current frame plus history read, output write and ping-pong storage. It can need an extra render target/pass depending on existing feedback routing. Do not silently make every spatial effect allocate independent history.

### 5. Actual thresholded pixel sorting as a separate spike

The MIT [ruccho/BitonicPixelSorter](https://github.com/ruccho/BitonicPixelSorter) is a real sorter, with a [WebGPU demo](https://ruccho.com/bps-webgpu/). It finds brightness-threshold spans along rows/columns and sorts their pixel indices using group-shared-memory bitonic comparisons. The implementation has width/shared-memory limits and larger-line variants. Its author's single-GPU timing claim must not become a Beatsmaxxer performance estimate.

- **Amount:** increases eligible span coverage/length or changes the threshold range; use ascending/descending direction as a distinct control. Sorting fewer pixels has a different visual meaning from fading a fixed sorted result over the original.
- **Audio:** kick lowers the eligibility threshold or lengthens spans; snare flips axis/direction at a subdivision; sustained energy expands the sorted area. Avoid rapidly changing thresholds that only produce visual chatter.
- **Cost:** higher integration risk than UV remapping. Requires owned/sampleable source data, compute/storage resources, workgroup memory and synchronization. Prototype at constrained resolution/line length. A streak shader that picks a nearby bright sample can be useful, but label it a smear approximation rather than true pixel sorting.

## Provenance and licensing

| Source | Verified permission | Reuse boundary |
| --- | --- | --- |
| [Keijiro KinoGlitch README/license](https://github.com/keijiro/KinoGlitch#license) and shader headers | MIT-style permission, copyright 2015 Keijiro Takahashi | Preserve copyright and permission text in adaptations/substantial portions. Translate algorithms from Unity shader conventions to WGSL explicitly. |
| [glfx.js LICENSE](https://github.com/evanw/glfx.js/blob/master/LICENSE) | MIT, copyright 2011 Evan Wallace | Preserve notice with adapted radial-warp code. |
| [Three.js LICENSE](https://github.com/mrdoob/three.js/blob/dev/LICENSE) | MIT, three.js authors | Preserve notice for adapted AfterimageShader code. Its header also credits the original inspiration; retain relevant provenance. |
| [BitonicPixelSorter LICENSE](https://github.com/ruccho/BitonicPixelSorter/blob/master/LICENSE) | MIT, copyright 2020 ruccho | Keep its notice and inspect transitive/reference code before carrying any code into production. |
| Glitché website, gallery and App Store screenshots | Proprietary product references; no shader reuse permission established | Use as visual direction only. No extraction or copying of proprietary shaders/assets. |

Search also found newer GLSL shader collections advertising permissive licensing, but they add little beyond the inspected established sources and were not selected as implementation dependencies. Point-cloud/3D reconstruction was not established in the current official Glitché evidence and would require a different rendering design; it is excluded from the immediate shortlist.

## Acceptance before shipping any stronger variant

Preserve the approved replacement names and existing effect identities. Capture clean, 25%, 50% and 100% Amount on the same moving subject and grid footage; verify a visible progression in geometry/coverage, exact zero identity and distinct effect silhouettes. Compare audio-off baseline with controlled kick/snare envelopes. Test external video and cached/owned texture paths, source changes, seeks, 30/60 Hz, feedback reset, preview/export consistency and the full effect catalog. Record GPU time and dropped/stale/black frames; sample counts alone are not performance measurements.

GitHits was used through the existing credential-injecting wrapper for the public `github:keijiro/KinoGlitch` target. Search `DigitalGlitch` returned three provisional hits while indexing; listing located the shader files; focused read `Assets/Kino/Glitch/Shader/DigitalGlitch.shader:34-58` confirmed the threshold/displacement/history/channel behavior. No local paths, private code or secrets were sent as query content. Default-branch URLs are mutable; pin the exact upstream revision and retain notices when implementation begins. Graft located the existing module shader and verification entry points; this note does not claim to have audited their complete implementations.
