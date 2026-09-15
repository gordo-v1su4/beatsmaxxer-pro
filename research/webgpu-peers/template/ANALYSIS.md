# {REPO_NAME} — peer analysis

- **URL:** https://github.com/{OWNER}/{REPO}
- **Cloned:** {DATE} (shallow)
- **Stars / activity:** {STARS} · last push {PUSHED_AT}
- **License:** {LICENSE}
- **Analyst:** {NAME}

## Stack

| Layer | Choice |
|-------|--------|
| UI framework | |
| Build | |
| WebGPU | native / helper lib |
| Video source | HTMLVideo / WebCodecs / canvas |
| Audio / rhythm | |
| Other GPU | WebGL fallback? Three.js? |

## Render path

```text
(source) → … → canvas / export
```

Describe passes, ping-pong, compositor, and where WGSL lives.

## Video texture approach

- [ ] `importExternalTexture` per frame
- [ ] `copyExternalImageToTexture` fallback / cache
- [ ] `requestVideoFrameCallback`
- [ ] WebCodecs `VideoFrame` path
- [ ] Bind group strategy (per-frame vs cached)

## Audio / rhythm analysis

- BPM / beat grid source
- Real-time vs offline analysis
- Transport clock model (AudioContext vs rAF)
- Beat-quantized switching (if any)

## Shader packaging

- Monolithic uber-shader vs per-effect modules
- Hot reload / pipeline cache
- Shared WGSL library / snippets
- Uniform contract (audio features exposed to shaders)

## Performance / latency notes

- Documented FPS / ms budgets
- Timestamp queries / profiling hooks
- Multi-video / multi-pass bottlenecks
- Device loss recovery

## Overlap with Beatsmaxxer Pro

| Beatsmaxxer feature | This repo |
|---------------------|-----------|
| 8 stable slot IDs | |
| PGM beat director | |
| `importExternalTexture` + idle copy | |
| Feedback ping-pong | |
| Essentia / Web Audio | |
| SvelteKit | |

## Ideas worth stealing

1.
2.
3.

## Skip / not applicable

- C++ / WASM compile paths
- React-specific UI patterns
- Features we already ship (note file + line if verified)

## Key files to grep

| Path | Why |
|------|-----|
| | |

## References

- README sections
- Issues / docs URLs
