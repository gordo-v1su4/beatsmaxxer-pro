# Svelte frontend reference

## Version boundary

Inspect `package.json` and the lockfile first. SvelteKit 2 and 3 differ; do not apply a migration guide or newer-major API to an older installed major. Preserve the project's adapter and configuration layout.

## Svelte 5

- Use runes in files already using runes. Do not mechanically migrate legacy components during unrelated work.
- Use `$state` only for values whose changes update UI or reactive logic. Prefer `$state.raw` for large values replaced wholesale.
- Use `$derived` or `$derived.by` for computed values. Use `$effect` for external synchronization, not ordinary derivation. Avoid state-update loops and return resource cleanup.
- Effects run only in the browser. Use explicit browser guards at module boundaries that otherwise execute during SSR.
- Declare props with `$props()` and derive values that depend on props.
- Use event attributes such as `onclick`, callback props for component events, and snippets with `{@render}` where the file uses modern syntax.
- The declaration tag is `{@const value = expression}`. Confirm placement with the installed compiler and `svelte-check`.
- Key `{#each}` blocks when stable identity affects DOM or component preservation.
- Prefer `<svelte:window>` and `<svelte:document>` for declarative listeners; use `onMount` for asynchronous or imperative resource ownership.

## SvelteKit

- Keep browser-only APIs out of server execution.
- Let route boundaries provide code splitting. Dynamically import substantial optional code when measurement shows it affects startup.
- Use navigation and preload APIs from the installed SvelteKit major.
- Do not remove `svelte.config.*`, change adapters, or move configuration merely because a newer release supports another layout.

## Review checklist

- Props remain reactive when they change.
- Derived values are not implemented as effect-driven assignments.
- Effects and subscriptions clean up owned resources.
- Lists preserve identity where required.
- Server rendering does not eagerly touch `window`, `document`, media, GPU, or storage APIs.
- Component boundaries reduce complexity or work; they are not abstraction for its own sake.

Official references:

- https://svelte.dev/docs/svelte
- https://svelte.dev/docs/svelte/compiler-errors
- https://svelte.dev/docs/kit
- https://svelte.dev/docs/kit/migrating
