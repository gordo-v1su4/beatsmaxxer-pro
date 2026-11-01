# Svelte UI reference

## Design-system boundary

- Inspect global tokens, scoped styles, shared controls, icons, screenshots, and adjacent components before editing.
- Reuse the product's type, spacing, color, border, focus, and interaction language.
- Use only component libraries already installed unless the user asks to add one.
- Use Tailwind utilities only when Tailwind is installed and the surrounding code uses them. Existing component classes or scoped CSS may be the better local fit.
- Avoid hardcoded screenshot reconstruction; encode reusable layout rules and meaningful tokens.
- Match the project's class-composition style. Strings, arrays/objects, `class:` directives, and `style:` custom properties are valid when supported by the installed compiler.

## Interaction and accessibility

- Start with semantic HTML and native behavior.
- Preserve keyboard access, visible focus, labels, roles, disabled states, and reduced-motion behavior.
- Maintain adequate contrast and do not communicate state with color alone.
- Keep phone touch targets usable and account for safe-area insets.
- Verify native controls in the actual browser; select menus and other platform UI vary by engine.

## Responsive composition

- Design for the product's actual surfaces rather than generic breakpoints.
- Preserve intentional desktop geometry while providing a dedicated mobile composition when shrinking would make controls unusable.
- Preserve media aspect ratios. Prefer scrolling or an alternate layout to vertical or horizontal distortion.
- Avoid layout shifts, unnecessary mounts, oversized initial images, and main-thread animations. Prefer transform/opacity motion.

## Verification

Inspect the rendered result before and after the edit. Verify the target viewport/browser and one adjacent size likely to regress. Use accessibility state plus a visual screenshot; neither is sufficient alone.

Official references:

- https://svelte.dev/docs/svelte
- https://tailwindcss.com/docs (only when Tailwind is installed)
- https://www.w3.org/WAI/ARIA/apg/
