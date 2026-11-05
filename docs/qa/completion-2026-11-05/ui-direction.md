# Web app workflow and control direction

Date: 2026-11-05. Status: source audit and proposed implementation slices;
no browser visual acceptance has been performed for this proposal.

## Product job

Start with a musical result. Load the reviewed song/clip workflow, see the clips
respond to the music, choose a named variation, then adjust one or two controls.
Keep detailed editing available without requiring someone to understand every
parameter before the first useful playback. The web app is the implementation
target. Native/standalone product experiments are excluded.

Keep the existing cinematic instrument identity: live PGM, stable rack previews,
condensed system UI, near-black surfaces, hardware seams and functional module
accents. The visual result is the memorable element. A landing-page hero,
marketing cards, decorative gradients or another UI library would obscure it.

## Verified source findings

- `svelte/src/lib/components/TopBar.svelte:79-84,478-510` already contains complete
  Perform and Timing demos, workflow save/load, verified progress and retry.
  Promote those real paths rather than inventing another demo loader.
- `svelte/src/lib/stores/rackUi.ts:46-50` starts in Perform. Arrange retains its
  playback workspace. `TopBar.svelte:521-531` deliberately blocks switching
  Perform/Timing while playing; Arrange may be opened during playback. Do not
  imply seamless renderer switching until it is implemented and measured.
- `components/rack/MixSection.svelte:6-10,29-49` has preset titles and active-value
  detection, but displays numbered 16px buttons with titles only on hover.
  `modules/presets.ts` already supplies useful names and parameter sets.
- `CompactModule.svelte:69-81,133-144,266-299` already has compact control specs,
  presets, bypass and collapse. `EffectModule.svelte:193-204` composes the deeper
  controls and the same mix strip. Full collapse currently means preview-only,
  which also removes the easy preset/mix entry point.
- `timing/TimingCard.svelte:28-52` selects an editor source; selection and on-air
  are distinct. `timing/TimingPanel.svelte:23-55,75-82,104-145` edits that source,
  supports follow-on-air, Global/Modular scope and effect-specific controls.
- Timing shape choices already have small curve thumbnails. Timesampler presets
  are still numbered; some editorial controls render at 7–8px, with a 6px ramp
  shape name (`TimingPanel.svelte:145,162-173`).
- `routes/+page.svelte:409-445` keeps the rack mounted while Arrange replaces its
  visible surface. Stable media and canvas identity is an acceptance constraint,
  not a reason to unmount the entire playback engine to simplify the UI.

## First reviewable slice: named musical presets, visible state

Implement the shared preset presentation before rearranging the application.
This is a small, useful PR with immediate visible improvement in both workspaces.

1. Add a shared preset selector used by `rack/MixSection.svelte` and the
   Timesampler area of `timing/TimingPanel.svelte`. Show the selected preset's
   meaningful title instead of just 1/2/3. Keep the existing module-local preset
   sets and update callbacks. A native select or anchored instrument-style menu
   can fit the narrow rack; use the existing menu/focus language.
2. Display `Custom` when current values no longer match a preset. Match against
   exactly the keys that preset owns; an unrelated density/trigger edit must not
   falsely mark the preset changed. Use existing tolerance where appropriate.
3. Keep Mix visible beside the selector. Do not add a fictitious universal
   Intensity macro: different modules own different primary parameters.
4. Applying a preset is one atomic parameter change and one undo step. It must
   leave the local clip, decoder, slot, source routing and canvas intact. Do not
   start playback or switch workspace as a side effect.
5. Give selected presets a persistent name and clear selected/custom state.
   Announce changes politely to assistive technology; do not put per-frame beat
   or meter updates into a live region.

This improves discoverability without claiming that existing presets are
musically accepted. Audition each exposed preset against the same song phrase
and readable moving clip; revise indistinguishable settings in a separately
tested change. With Mix at zero, explain that effects are dry rather than
silently overriding a user's intentional setting.

## Next slice: primary controls and progressive detail

Add a primary control state distinct from preview-only collapse. The useful
resting card retains clip preview/name, on-air or selected state, named preset,
Mix, Bypass and an obvious `Edit controls` action. Show at most two module-specific
primary controls selected from the existing compact control contract. Detailed
knobs, MIDI patching and secondary modes belong in an explicitly opened editor.

Preserve a separate preview-only performance mode for experienced users. Opening
details must not change effect values or enable a module. Closing details must
not dispose media, reset feedback, or remove a running effect. Keep the existing
card preview mounted and keyed by stable slot identity; conditionally mount
detail controls only. Do not duplicate a module's controls in multiple active
editors or create another animation loop for preset thumbnails.

Timing already has a shared selected-deck editor. Its first row should expose
effect, named preset, cycle/division and Mix only where those concepts apply.
Keep Global/Per video scope and the edited source name visible. Put trigger
qualification, random cycle choices, sample slicing and curve editing under
clearly labelled `Edit timing` and `Trigger settings` disclosures. Keep
preparation failure/retry and transport blockers visible even when details close.

## Workflow entry and navigation slice

For a fresh empty session, provide a small in-workspace start strip above the
source rack: `Try Timing demo` and `Use my song and clips`. The first reuses the
complete Timing workflow, shows real verification/preparation progress and
leaves a clear Play action once ready. Never replace an existing session merely
because it is quiet, stopped or has no playing clip. Restore the previous
workspace and take for returning users.

Use concise workspace descriptions at selection: Timing — match motion to music;
Perform — play with visual effects; Arrange — edit the recorded take. Retain the
canonical workspace names. Show Arrange's active playback workspace so editing
the timeline does not look like selecting another engine. Explain the current
stop-before-switch requirement inline when blocked, rather than disabling a tab
with a tooltip as the only explanation.

Reduce top-bar competition by keeping transport, song identity/status, workspace
selection and one workflow action in the primary row. Put tempo/pitch/key, file
operations, service settings and less-frequent display options in existing
labelled menus. Preparation status and actionable errors remain discoverable
without opening those menus. Deep controls can move; playback ownership cannot.

## Tokens and implementation boundaries

Reuse `app.css:85-120`: surface panel #111316, raised #181b1f, edge #30353c,
primary ink #edf0f3, secondary ink #8d96a2 and focus #7fe3d4. Continue the
existing condensed system UI and tabular readouts. Preserve `design.md`'s
instrument treatment and module accents; avoid blanket font/color changes.
Increase legibility in the new preset/editor surfaces with focused token rules
instead of scaling the entire rack down to fit. Respect reduced motion.

Use the installed Svelte 5 version and existing stores/callbacks. Derive selected
preset/custom state; do not mirror it through effects into another source of
truth. Keep new disclosure state local unless multiple surfaces genuinely share
it. Run the project Svelte autofixer on changed components, then targeted tests,
`bun run check` and the production build. No new control library is needed.

## Browser acceptance for each slice

- Capture before/after in the native in-app browser at 1920×1080 and 1366×768,
  then check the dedicated mobile shell at a representative phone width. Show
  selected, hover, focus, disabled, custom, preparation and error states.
- Load complete Timing demo from a fresh session; reach ready state, then Play.
  A named preset must visibly change the agreed phrase without another setup
  step. Show first useful interaction and preparation progress separately.
- Exercise all named presets with mouse and keyboard. Verify focus survives
  selection/disclosure and Escape returns to its invoker. Primary interactive
  labels must be readable without tooltips; mobile actions retain 44px targets.
- Change a parameter, observe Custom, undo once and recover prior values/name.
  Global and Per video edits must affect exactly the advertised scope.
- Toggle detail/preview modes during playback. Record media/canvas identities,
  PGM continuity, dropped frames, GPU errors and input-to-render latency. No
  decoder reload, black frame or audio interruption is acceptable.
- Perform↔Timing switching follows the current stop gate; Arrange round trips
  preserve playback workspace, song position, clip selection and take. Browser
  background/foreground must not duplicate loops or replay a long catch-up burst.
- Save/load a workflow and reload the browser: clip references, presets, custom
  values and restored workspace survive according to the existing file contract.
- Do not declare responsiveness improved from fewer visible controls alone.
  Compare event-to-render and frame-time distributions with the same media,
  browser, GPU and viewport. Keep physical audiovisual review alongside telemetry.

## Decision checkpoint

The first slice is ready for implementation without a new visual identity.
Changing the fresh-session default to Timing, automatic best-fit media quality,
and seamless active renderer switching are separate behavior changes with their
own acceptance gates. The large-screen source audit is not visual sign-off.
