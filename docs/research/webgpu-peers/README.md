# WebGPU peer research

What public WebGPU + video projects do, and what Beatsmaxxer took from them.
Product context: [`CONTEXT.md`](../../../CONTEXT.md) and
[`docs/agents/continuity.md`](../../agents/continuity.md).

**Verdict (2026-09-11): stay on web.** WebGPU + HTMLVideo/WebCodecs ingest is
proven; the live advantage is our own locked-grid clock on top of it. Native
(wgpu, libmpv) is a latency ceiling to measure against, not a rewrite target.
See [`STACK-SCORECARD.md`](./STACK-SCORECARD.md).

## Contents

| Doc | Use |
|-----|-----|
| [`STACK-SCORECARD.md`](./STACK-SCORECARD.md) | Peer scorecard for live stutter/speed remap, and what to steal next (XinChao-Cut seek settlement) |
| [`PLATFORMS.md`](./PLATFORMS.md) | Desktop app, web app and mobile web: what differs, what is shared |
| [`DESKTOP-WINDOWS-RESEARCH.md`](./DESKTOP-WINDOWS-RESEARCH.md) | Why the Windows app is a Rust shell around the same WebGPU engine |
| [`MOBILE-BROWSER-RESEARCH.md`](./MOBILE-BROWSER-RESEARCH.md) | Phone Chrome: lifecycle, HTTPS, device loss, thermal |
| [`analyses/`](./analyses/) | Per-repo dissections with file:line citations (FreeCut, Beatform, Ghost Arcade, Spektral, samples) |
| [`template/ANALYSIS.md`](./template/ANALYSIS.md) | Template for a new analysis |

Shipped from this research: arm-at-trim + rVFC (`VideoPool`), bind-group
frequency split (`BindGroupCache`), `wgslLib` with golden tests.

## Peer clones

Clones are local-only (`repos/` is gitignored); commit what you learn to
`analyses/`, never the clones.

```powershell
.\docs\research\webgpu-peers\clone-peers.ps1            # clone
.\docs\research\webgpu-peers\clone-peers.ps1 -Refresh   # re-fetch
```

```bash
bash docs/research/webgpu-peers/clone-peers.sh
```

GitHits from the repo root: `.\scripts\githits.ps1 example "<query>" -l typescript`
(token from BWS `GITHITS_API_TOKEN`).
