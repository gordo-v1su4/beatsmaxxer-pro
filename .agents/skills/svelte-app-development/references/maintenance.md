# Maintenance and provenance

This skill is repository-owned and version-controlled. It replaces unmanaged local `svelte-frontend` and `svelte-ui-design` copies that had no source revision metadata. Framework guidance comes from the official Svelte skills installed from `sveltejs/ai-tools`; this overlay contains only Beatsmaxxer-specific policy.

## Freshness policy

- Run `scripts/audit-versions.ts` when the user asks about freshness, before a framework migration, or when this file's review date is more than 30 days old.
- Refresh the two official skills with `bunx skills update svelte-code-writer svelte-core-bestpractices --project --yes`. If the updater reports the nested upstream skills as deleted, reinstall them from `https://github.com/sveltejs/ai-tools/tree/main/tools/skills` instead of accepting deletion.
- Use package registry versions only to report drift. Do not upgrade the application or rewrite the skill automatically.
- Review official Svelte and SvelteKit migration guides before changing major-version advice.
- Keep generic rules version-aware; do not hardcode future or experimental APIs as universal requirements.
- Update `reviewed` below whenever sources and behavior are manually reviewed.

```yaml
reviewed: 2026-11-01
verified_latest:
  svelte: 5.57.3
  '@sveltejs/kit': 3.1.1
  '@sveltejs/vite-plugin-svelte': 7.3.1
  svelte-check: 4.7.7
sources:
  - https://svelte.dev/docs/ai/skills
  - https://github.com/sveltejs/ai-tools/tree/main/tools/skills
  - https://svelte.dev/docs/svelte
  - https://svelte.dev/docs/kit
  - https://www.npmjs.com/package/svelte
  - https://www.npmjs.com/package/@sveltejs/kit
```
