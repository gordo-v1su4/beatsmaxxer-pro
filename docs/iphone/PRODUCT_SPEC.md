# iPhone Product Specification

## 1. Product promise

Beat Surfer Pro turns an iPhone into a tactile music-video performance instrument. The creator chooses the source material and performs the edit. The app makes those actions musical, repeatable, and exportable without turning the phone into a miniature desktop editor.

The MVP is successful when an invited tester can create a project, prepare one song and eight clips, perform a three-minute take, replay it, and export a synchronized 1080p video without developer help.

## 2. Core user loop

1. Create a local project.
2. Import one song from Files or the media library.
3. Analyze the song locally; correct BPM or downbeat if necessary.
4. Import up to eight video clips.
5. Trim clips and let the app prepare performance proxies.
6. Arrange eight effect slots.
7. Enter Live, start the song, and perform quantized cuts and effects.
8. Record the performance as a take.
9. Replay the take using proxies.
10. Render from original media and save or share the final video.

## 3. Information architecture

### Project-level navigation

The persistent bottom navigation contains four destinations:

- **Prepare** — song, analysis, clip readiness, trimming, and rack setup.
- **Live** — portrait or landscape performance view.
- **Takes** — recorded performances with replay, rename, delete, and export.
- **Export** — selected take, output settings, progress, and completed output.

Project creation, media pickers, settings, diagnostics, and destructive confirmations appear as sheets or full-screen flows. Live never displays a desktop sidebar or a general-purpose timeline.

### Supported reference frames

The layout is specified against these logical point sizes:

| Class | Portrait | Landscape | Purpose |
| --- | --- | --- | --- |
| Compact baseline | 390×844 | 844×390 | Primary design and touch-density target |
| Modern standard | 393×852 | 852×393 | Regression target |
| Large phone | 430×932 | 932×430 | Expansion target without oversized controls |

All dimensions exclude device-specific safe-area insets unless explicitly stated. No essential control may be hidden behind the Dynamic Island, home indicator, or rounded corners.

## 4. Project creation and import

### New Project

The first screen contains a single primary action, **New Project**, below the Beat Surfer Pro wordmark and recent projects. Empty state copy is: “Build a video set, perform it to the beat, then export the take.”

Creating a project immediately assigns an editable name such as `Untitled Set 1`. The user is not required to create an account or choose export settings.

### Import sequence

The import flow is progressive rather than a blocking wizard:

1. A **Choose Song** card explains that clip audio will not be used in the MVP.
2. After the song is selected, an analysis row begins showing stage and percentage.
3. An **Add Clips** area presents eight ordered slots and accepts Photos or Files.
4. The user may enter Prepare once one clip is ready; other work continues visibly.

Every asset shows exactly one of these states:

- Empty
- Copying
- Inspecting
- Creating proxy
- Ready
- Needs attention
- Failed

Failures include a plain-language reason and a direct corrective action. Permission denial offers the alternative importer. Insufficient storage reports the required and currently available space before copying begins.

## 5. Prepare screen

### Portrait geometry

At 390×844 points:

- Safe-area-aware header: 44 points.
- Song and analysis panel: 112 points.
- Clip preparation grid: two columns by four rows, 82 points per row including spacing.
- Rack summary: collapsed 56-point row.
- Bottom navigation: 56 points plus bottom safe area.

The screen scrolls because preparation is not performance-critical. Song status remains pinned below the header only while analysis is active.

### Song panel

Shows song title, total duration, analysis stage, BPM, confidence, and an **Adjust** action. Status copy is restricted to:

- Preparing audio
- Finding tempo
- Finding beats
- Building sections
- Ready · {BPM} BPM
- Needs adjustment
- Failed · Set manually

The adjustment sheet contains tap tempo, numeric BPM, and downbeat-offset controls. Saving an adjustment immediately marks the analysis as manually corrected.

### Clip rows

Each clip row contains thumbnail, slot number, source duration, trim duration, preparation state, and an overflow menu. The whole row opens the clip editor. Replace and remove live in the overflow menu and require confirmation only when a recorded take references the clip.

## 6. Portrait Live screen

Portrait Live is fully operable without scrolling.

### Vertical allocation at 390×844

| Region | Height | Contents |
| --- | ---: | --- |
| Header | 44 pt | Project name, analysis/health indicator, menu |
| PGM | 207 pt | 16:9 program output, current and queued overlays |
| Transport | 48 pt | Play, time, BPM, quantization, record |
| Clip rack | 112 pt | Eight pads in a 4×2 grid |
| Effect focus | 164 pt | Slot strip, selected effect, primary control |
| Bottom navigation | 56 pt | Prepare, Live, Takes, Export |

Remaining height absorbs safe-area insets and 8–12-point separations. The PGM may shrink to 198 points on the compact baseline but never below a 16:9 presentation width.

### PGM overlays

The PGM displays only performance-critical information:

- `PGM` and active clip number in the upper left.
- Queued clip and execution boundary in the upper right.
- Beat-phase bar along the lower edge.
- Red `REC` indicator while recording a take.
- One-line warning for a delayed source, interruption, thermal reduction, or missing media.

Overlays disappear in clean-preview mode. PGM is the only continuously moving preview visible on the screen.

### Transport

- Play/pause is the leading 48×48-point control.
- Time is shown as `elapsed / 3:00` maximum.
- Quantization cycles through `¼`, `½`, `1`, and `2` beats.
- Record is available only when the project is ready and the song is at its start or stopped.
- Stopping a recording opens the name/save sheet; it does not immediately begin export.

### Clip rack

Eight clip pads form a 4×2 grid. At the baseline width each pad is approximately 84×48 points with 6-point gaps. Pads use a still thumbnail, slot number, and symbolic state:

- **Current:** solid on-air border plus `PGM` label.
- **Queued:** pulsing outline plus target boundary.
- **Warming:** small progress arc.
- **Ready:** neutral border.
- **Processing/failed/empty:** explicit icon and label rather than a thumbnail-only cue.

The app does not decode eight moving pad previews. This is an intentional mobile performance compromise.

### Effect focus

An eight-item horizontal rack strip sits above the selected effect control. Four Beat effects and four Look effects are separated by labels, not separate pages. The selected effect exposes:

- Name and bypass state.
- One large primary parameter.
- Up to two compact secondary values.
- Reset and preset actions.

The mobile MVP effect set is Transition, Speedramp, Tapdelay, Motion Streak, Punch Zoom, Film Grain, Light Leak, and VHS/CAM.

## 7. Landscape Live screen

Landscape is the preferred two-handed performance view.

### Geometry at 844×390

- Left 62%: PGM, preserving the source aspect ratio inside its region.
- Right 38%: clip rack in a 4×2 grid above selected-effect control.
- Bottom 52 points: transport spanning both regions.
- Top overlays: project/engine health and a compact menu; no bottom navigation.

At 932×430, additional width expands PGM rather than increasing pad count. The right control area is capped so clip pads remain reachable without excessive hand travel.

Rotating into or out of landscape cannot stop playback, clear recording state, reset an effect, or lose a queued cut.

## 8. Takes and export

### Takes

Each take row shows name, duration, date, completion/recovery state, and whether it has a completed export. Selecting a take opens proxy replay with Rename, Export, Duplicate as New Take, and Delete.

An interrupted take is labeled **Recovered** and may be replayed until its last complete action. The app never silently presents an interrupted take as complete.

### Export

MVP settings are deliberately fixed:

- 1080p
- 30 fps
- SDR
- H.264 video
- AAC stereo song audio
- Source aspect ratio selected from 16:9, 9:16, or 1:1 at project creation

Export shows percentage, current stage, elapsed time, and estimated remaining time. Cancel requires confirmation and removes only the incomplete output. Completion offers Save to Photos, Save to Files, and Share.

## 9. Gesture contract

| Gesture | Result | Accessible equivalent |
| --- | --- | --- |
| Tap inactive ready clip | Queue at selected quantization | Pad button action |
| Tap queued clip | Cancel queue | Cancel Queue menu action |
| Swipe clip upward | Immediate cut | Immediate Cut menu action |
| Long-press clip | Open clip actions | More button |
| Tap effect | Toggle latch | Effect button |
| Hold effect | Momentary activation | Momentary switch in effect sheet |
| Vertical drag on control | Adjust primary value | Slider and stepper |
| Double-tap control | Reset default | Reset button |
| Long-press control | Fine adjustment | Fine mode button |
| Horizontal swipe on rack | Change selected slot | Previous/next buttons |
| Two-finger tap PGM | Toggle clean preview | Clean Preview menu item |

Light haptic means an action was queued. Strong haptic means a cut executed. Warning haptic means an action failed or was delayed. Haptics supplement visible state and never carry meaning alone.

## 10. Accessibility and interaction rules

- Minimum hit target: 44×44 points; performance pads target 48 points or larger.
- Text supports Dynamic Type through the accessibility large category on non-Live screens.
- Live uses bounded scaling so the fixed performance layout remains intact; full values remain available to VoiceOver.
- State never depends on color alone.
- VoiceOver reads slot, clip name, readiness, current/queued state, and available action.
- Reduced Motion disables pulsing and animated effect decoration while retaining beat progress.
- Every gesture has a visible equivalent.
- Destructive actions use native confirmation language naming the affected project, clip, take, or export.

## 11. Explicit non-goals

The MVP is not a timeline editor, DAW, camera app, social network, cloud library, automatic montage generator, or desktop remote control. It contains no live camera, clip-audio mixer, text/title editor, keyframe editor, 4K/HDR export, Android implementation, or web redesign.
