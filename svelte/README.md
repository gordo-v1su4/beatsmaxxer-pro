# Beat Surfer Pro — Svelte + WebGPU

Browser-only rewrite of Beat Surfer Pro using SvelteKit 5 and WebGPU as the sole render engine.

## Commands

```bash
bun install
bun run dev      # http://localhost:5174
bun run build    # single-file production build → build/
bun run check    # svelte-check
bun run test     # vitest
```

From repo root:

```bash
bun run dev:svelte
```

## QA mode

```
http://localhost:5174/?qa=test-media&qaAutoplay=1
```

Requires QA fixtures symlinked at `tests/fixtures/media/` (shared with parent repo).

## Module drag & drop

See [`docs/MODULES.md`](docs/MODULES.md) for how to register new effects and use the FX LIB palette.

- **FX LIB** (left column): module catalog — drag onto rack slots
- **Rack headers** (⠿): drag to reorder/swap within or across rows
- **Future**: add modules to `catalog.ts` only; they appear in palette before assignment

- **UI:** Svelte 5 stores + components in `src/lib/components/`
- **Render:** Single `WebGpuEngine` rAF loop — no Three.js, no dual paths
- **Media:** WebCodecs decode + hot-deck lifecycle in `src/lib/media/` and `src/lib/runtime/decks/`
- **Audio:** Ported `AudioEngine` in `src/lib/audio/`
- **Contracts:** `src/lib/engine/contracts.ts` — interface boundary for all modules

## Cutover checklist

- [ ] All 8 modules render WebGPU previews
- [ ] PGM cuts ≤16ms with prepared hot-deck handles
- [ ] 0 white flashes in 38s RAND 1BT QA run
- [ ] Single-file build deploys standalone
