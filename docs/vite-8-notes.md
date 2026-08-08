# Vite 8 Notes

Last verified: 2026-03-24

## Status

- This repo is already on `vite@8.0.2`.
- The official Vite releases page shows `v8.0.2` as the latest stable release as of 2026-03-24.
- We should keep using Bun for local workflow in this repo.

## Official References

- [Getting Started](https://vite.dev/guide/)
- [Config Reference](https://vite.dev/config/)
- [Shared Config Options](https://vite.dev/config/shared-options)
- [Build Guide](https://vite.dev/guide/build)
- [Migration from Vite 7](https://vite.dev/guide/migration)
- [Breaking Changes / future flags](https://vite.dev/changes/)
- [Vite Releases](https://github.com/vitejs/vite/releases)

## What Changed In Vite 8

- The default production browser target moved forward to the current Baseline Widely Available set: Chrome 111+, Edge 111+, Firefox 114+, and Safari 16.4+.
- Vite 8 now uses Rolldown and Oxc internally instead of the old esbuild plus Rollup path for key internals.
- Compatibility shims still exist, but `optimizeDeps.esbuildOptions` is deprecated in favor of `optimizeDeps.rolldownOptions`.
- The top-level `esbuild` option is deprecated in favor of `oxc`.
- Vite exposes a `future` config section so projects can opt into upcoming breaking changes earlier and reduce pain on the next major upgrade.

## What Matters For This Repo

- Our current `vite.config.ts` is simple and does not use deprecated `esbuild` or `optimizeDeps.esbuildOptions` fields, so there is no direct migration work required there.
- The app is a browser-only React client, so the updated default browser baseline is likely acceptable unless we explicitly need older Safari or Firefox support.
- The project uses `vite-plugin-singlefile`, which matters because single-file build plugins often touch bundler internals more closely than standard app configs.

## Repo Follow-Up

- `vite-plugin-singlefile` has been bumped from `2.3.0` to `2.3.2`.
- That newer release declares Vite 8 support in its peer dependency range.
- After any future Vite major bump, this plugin should be one of the first things we re-check because it sits directly on the build pipeline.
- `bun run build` still succeeds on Vite 8, but it emits an `inlineDynamicImports` deprecation warning that is not coming from our own checked-in config.

## Suggested Next Checks

- If we want early warning on upcoming Vite 9 changes, consider selectively enabling `future` warnings in `vite.config.ts`.
- If we keep seeing build-time deprecation warnings, trace them through the active plugin stack before changing app code.
- If package metadata cleanup matters, rename the package from `react-vite-tailwind` to `beatsmaxxer-pro` in `package.json`.
