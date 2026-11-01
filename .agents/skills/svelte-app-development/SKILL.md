---
name: svelte-app-development
description: Build, design, review, debug, or optimize Svelte 5 and SvelteKit applications using the project's installed versions and design system. Use for Svelte components, runes, UI styling, routing, browser behavior, hydration, accessibility, or frontend performance.
metadata:
  maintained-by: beatsmaxxer-pro
  updated-at: "2026-11-01"
  upstream-audit: scripts/audit-versions.ts
---

# Svelte App Development

Use the repository as the primary specification. Read its agent instructions, package versions, architecture, nearby components, and tests before choosing an API or visual pattern. Project rules and the installed compiler override generic or newer-major guidance.

This is the Beatsmaxxer-specific overlay for the two upstream Svelte skills installed beside it:

- Use `svelte-core-bestpractices` for framework guidance.
- Use `svelte-code-writer` for official documentation lookup and `svelte-autofixer` validation.
- Use this skill for repository conventions, WebGPU/media behavior, browser-specific verification, UI composition, and performance work.

## Start here

1. Load the official `svelte-core-bestpractices` and `svelte-code-writer` skills for any Svelte component or module work.
2. Inspect the project's Svelte, SvelteKit, Vite, TypeScript, and styling dependencies.
3. When freshness matters or the user asks whether the stack is current, run `bun <skill-directory>/scripts/audit-versions.ts` from the project root. Report drift; do not upgrade dependencies without authorization.
4. Read only the reference relevant to the task:
   - Component logic, runes, routing, lifecycle, or code review: [frontend.md](references/frontend.md)
   - Styling, layout, responsive behavior, or accessibility: [ui.md](references/ui.md)
   - Startup, interaction latency, hydration, bundle, or browser performance: [performance.md](references/performance.md)
   - Skill freshness and upstream sources: [maintenance.md](references/maintenance.md)

## Shared rules

- Preserve the user's scope. Do not turn a feature or fix into a framework migration.
- Follow existing component, store, CSS, and design-token patterns before introducing abstractions or libraries.
- Do not require Skeleton Labs, Bits UI, shadcn, or another UI system unless it is already installed or explicitly requested.
- Match browser evidence to the reported platform. Chrome on iPhone uses WebKit; Chromium mobile emulation is not proof of iPhone behavior.
- Measure performance symptoms before optimizing and keep a red-capable regression loop.
- Verify with the narrowest relevant test, then `svelte-check` and a production build in proportion to risk. Visually verify UI work in the requested browser and viewport.

Authoritative upstream references are the official [Svelte docs](https://svelte.dev/docs/svelte), [SvelteKit docs](https://svelte.dev/docs/kit), and the documentation for styling libraries actually installed in the project.
