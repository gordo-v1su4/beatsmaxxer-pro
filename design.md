# Design — Beatsmaxxer Pro

A locked visual system for the web rack and phone performance shell. It borrows
DesignCode's material depth and restraint without copying its page structure,
content, or violet palette.

## Genre

Atmospheric — a cinematic instrument, not a marketing dashboard.

## Macrostructure family

- App surfaces: Workbench. The existing rack, program monitor, rails, arrangement, and phone stage remain structurally unchanged.
- Overlays: instrument panel. Dialogs and sheets use the same engraved labels, seams, and button voice as the rack.

## Theme

- Near-black neutral paper with three explicit elevation steps.
- Cool-white primary ink and steel-grey secondary ink.
- Hairline top highlights, dark lower seams, and restrained inset shadows create depth.
- Existing teal, green, amber, red, and per-module colours remain functional accents. No violet is introduced.
- Chromatic accents stay below five percent of a viewport outside live video.

## Typography

- UI: the existing condensed system stack, weight 500–600.
- Readouts: the existing monospace stack with tabular figures.
- Brand: the existing system brand stack.
- Labels stay roman, compact, uppercase, and tracked; headings never use italics.

## Spacing and shape

- Preserve every rack dimension and mobile touch target.
- Use the existing compact spacing rhythm and 2–3px hardware radii.
- Buttons and panels may gain optical depth, never extra layout size.

## Motion

- Control feedback: 90–160ms using named transform/opacity/colour easings.
- Panels and overlays: 180–240ms.
- Animate transform and opacity for spatial movement; do not animate layout.
- No bounce, card zoom, animated gradient, or continuous ambient animation.
- Reduced motion removes spatial movement and retains an opacity change of at most 150ms.

## Microinteractions stance

- Resting controls sit slightly proud; active controls press inward by less than one pixel.
- Hover clarifies an edge and label. It never scales a panel.
- Latched state uses the control's semantic accent as a wash and small glow, never a solid fill.
- Focus rings are immediate and clearly visible.
- Live WebGPU surfaces never receive new backdrop filters or animated compositor effects.

## What all surfaces share

- The same surface, edge, ink, focus, easing, duration, and shadow tokens.
- Specular top edge, dark lower seam, concise uppercase label voice, and recessed readouts.
- Complete default, hover, focus-visible, active, disabled, and latched states.

## Per-surface allowances

- Desktop keeps dense pointer-sized controls and fixed rack geometry.
- Mobile keeps 44px touch targets, safe areas, and direct-manipulation controls.
- Module colours and operational status colours override the neutral focus colour when they communicate state.

## Provenance

DesignCode (https://designcode.io/) was used as a public visual reference for
surface depth, button craft, and subtle motion. Its content, imagery, layout,
and violet lighting are not part of this system.

## Acceptance stamp

- Pre-emit critique: Philosophy 5, Hierarchy 5, Execution 4, Specificity 5, Restraint 5, Variety 5.
- Slop test: pass after native desktop, portrait, and landscape review.
- Contrast, responsive width, reduced motion, focus, active, and disabled-state gates: pass for the redesigned shared surfaces.
