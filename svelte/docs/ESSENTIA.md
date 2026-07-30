# Essentia rhythm analysis

## Development

The Svelte dev server proxies analysis requests through Vite:

- Browser calls `/__api/analyze/rhythm` (and `/__api/analyze/fast`)
- Vite rewrites to `https://essentia.v1su4.dev` (see `svelte/vite.config.ts`)

No extra setup is required for local dev beyond `bun run dev`.

## Production (Vercel)

Set this environment variable on the Vercel project:

```bash
VITE_ESSENTIA_API_BASE_URL=https://essentia.v1su4.dev
```

The static build calls Essentia directly over HTTPS (the dev `/__api` proxy is not available in production).

Optional:

```bash
VITE_ESSENTIA_ANALYSIS_ENGINE=aubio
```

## QA media

```bash
cd svelte
bash scripts/setup-qa-media.sh   # copies bundled test clips (cloud-safe)
bun run dev
# open http://localhost:5174/?qa=1&qaAutoplay=1
```

## Acceptance gates

```bash
cd svelte
bun run verify:playback    # JSON + PNG in .artifacts/
bun run verify:interaction
bun run verify:stutter
bun run verify:all         # unit tests + build + all browser gates
```

Browser scripts expose `window.__BSP_QA__.snapshot()` for CDP probes.
