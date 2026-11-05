# Beatsmaxxer Pro platform acceptance

Audit date: 2026-11-05. This is an execution checklist, not a passing test report. Commands and support boundaries were inspected locally and the Mac was inventoried through read-only SSH. No browser, native application or GPU test was started for this document. The separate Beatsmaxxer Native application is outside this checklist.

## Supported surfaces and proof boundaries

| Surface | Current implementation | Required acceptance |
| --- | --- | --- |
| Windows Chrome/Edge web | Shared Svelte/WebGPU engine, browser media/audio | Actual GPU browser, production-build visual evidence, Perform and Timing cadence, audible/manual interactions |
| Mac Chrome web | Same web build; CDP helper detects `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` | Physical Mac browser evidence, adapter/OS/browser/version and memory profile recorded; Windows results do not establish Mac capacity |
| Mac Safari web | Same URL, different engine/media/WebGPU behavior | Separate physical Safari startup, decode, controls and lifecycle checks; Chrome CDP scripts do not certify Safari |
| Windows Tauri | Shared Svelte build in WebView2; Rust platform services and updater | Actual Tauri executable plus native-WebView cadence, media-service flows, build/installer/update/relaunch and physical output checks |
| Mac Tauri | Not a current release target; no macOS release workflow entry | Remains unsupported by current release evidence; a frontend build is not native Mac runtime acceptance |

Sources: [desktop README](../../../desktop/README.md), [release workflow](../../../.github/workflows/release.yml), [Chrome discovery](../../../svelte/scripts/cdp.ts), [desktop smoke](../../../scripts/desktop-smoke.sh). `bun run smoke:desktop` builds a native debug bundle on Windows; on Mac/Linux it only builds the embedded frontend and exits successfully.

## Locate the actual Mac before testing

The current Windows SSH configuration contains `m3` / `m3-ts` and `m3-lan` aliases. The canonical homelab sources are `C:/Users/Gordo/Documents/Github/proxmox-home/docs/endpoint-index.md` (M3 endpoint) and `docs/agent-access-runbook.md`, section **M3 access from Windows**. These document ordinary OpenSSH over Tailscale, with LAN mDNS fallback. Root and this audit independently reached `m3` through batch SSH on November 5. LAN fallback was not tested.

When beginning the Mac lane, use the existing identity and host-key policy with a bounded, read-only probe:

```powershell
ssh -o BatchMode=yes -o ConnectTimeout=10 m3 'whoami; hostname; sw_vers'
# Use this existing alias if the default route is unavailable:
ssh -o BatchMode=yes -o ConnectTimeout=10 m3-lan 'whoami; hostname; sw_vers'
```

Expected documented identity: `robertspaniolo` on `M3.local`. After confirming identity, inspect the existing checkout and tools without changing the remote:

```powershell
ssh -o BatchMode=yes -o ConnectTimeout=10 m3 'cd /Users/robertspaniolo/Documents/GitHub/beatsmaxxer-pro && pwd && git status --short --branch && git worktree list && git rev-parse HEAD && test -x "$HOME/.bun/bin/bun" && test -x /opt/homebrew/bin/ffprobe && test -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"'
```

A missing checkout/tool or denied connection is a discovery result, not permission to install, change SSH/security settings or overwrite remote work. Confirm the actual checkout/branch before preparing an isolated test revision. SSH execution alone does not prove the logged-in desktop, visible browser, audio route or physical observation. Preserve the physical-proof gate until those are established.

### November 5 read-only Mac inventory

| Item | Observed state |
| --- | --- |
| Host | macOS 26.7.2; Apple M3 MacBook Air, 8 CPU / 10 GPU cores, 16 GB shared memory; internal 2560×1664 display |
| Browser | Installed Chrome 156.0.8078.80; Safari 27.2 |
| Session | Console owner `robertspaniolo`; GUI/browser visibility and monitoring route still require verification |
| Checkout | `/Users/robertspaniolo/Documents/GitHub/beatsmaxxer-pro`, one worktree, branch `codex/timing-layout-linear-tasks`, revision `2289354f49ec3559b0cf17471d015fa26c3e1173`, expected GitHub remote |
| Existing changes | Six tracked broken-fixture JSON modifications; untracked `.cursor/hooks/state/`, `opencode.json`, `test_media` symlink to `docs/test_media`; preserve all |
| Tools | Existing `$HOME/.bun/bin/bun` 1.3.14 and `/opt/homebrew/bin/ffprobe` / `ffmpeg` 9.0.2; root and Svelte `node_modules` present |
| Process environment | Noninteractive SSH PATH did not resolve Bun/ffprobe; use explicit process-local PATH rather than installing replacements |
| Ports | No listening processes found on 5174, 5175, 5194 or 9633 at inspection time |
| Memory snapshot | `memory_pressure` reported 77% system-wide free; swap usage about 847 MiB. This is transient discovery, not playback capacity evidence |

The next test checkout should be an isolated adjacent worktree at the approved pushed test revision. Inventory and report the dirty source first; leave its tracked fixtures and untracked media/configuration in place. No worktree/fetch/checkout/pull or remote filesystem mutation was performed by this audit. Before running commands on the Mac, add existing tools to that shell only:

```sh
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:$PATH"
```

## Run sequence

Use Bun for all JavaScript commands. Run one GPU workload at a time; finish local compilation before measuring playback. Inspect occupied ports rather than silently changing them. Web development uses 5174, Tauri development 5175, and source-bound production proof uses strict port 5194. Record source revision and tracked/untracked changes before each lane.

### Common browser baseline

Run from the checked-out repository root, on the machine whose GPU will be tested:

```sh
bun run check
bun run test
bun run build
cd svelte
bash scripts/setup-qa-media.sh
cd ..
```

For the complete browser suite, `bun run test:local` manages its development server and runs unit/build/browser checks. Visible Chrome is the default. Its required physical proof artifacts must first be produced and reviewed for the same source revision. A headless run explicitly skips physical proof unless enforced; label it accordingly.

Start the strict web development server in a separate terminal before standalone cadence runners:

```sh
bun run dev
```

Run sequentially from another terminal:

```sh
bun run verify:perform-loop-cadence
bun run verify:timing-cadence
cd svelte
bun run verify:sequencer-cut
bun run verify:sequencer-loop
bun run verify:trigger-commit
bun run verify:arrangement-rec
cd ..
```

Perform defaults to 60 seconds per straight/swing/dotted × linear/random scenario. Timing defaults to 60 seconds per straight/swing/dotted × balanced/random scenario. Reports default to `svelte/.artifacts/perform-loop-cadence.json` and `svelte/.artifacts/timing-cadence.json` because root scripts change into `svelte/`. Use the runners' `*_REPORT` variables for unique files before repeated runs; retain failing reports. Timing supports `TIMING_RESIDENT_PRELOAD=0` to exercise its alternate preparation path, which is a separate case rather than a replacement for resident acceptance.

On Mac, the same commands use installed Chrome. If discovery needs an explicit executable:

```sh
export CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
```

### Physical production-build browser proof

An actual observer must see and hear the headed run. Set observation fields truthfully only for the observed session; these variables are attestations, not performance switches. `ffprobe` and the expected real proof media are required. The capture commands build and serve the production bundle themselves.

POSIX shell, including Mac:

```sh
export HEADLESS=0
export PHYSICAL_BROWSER_OBSERVED=1
export PHYSICAL_BROWSER_OPERATOR='actual observer name'
export PHYSICAL_BROWSER_LAG_OBSERVED=0
bun run capture:visual-proof
cd svelte
bun run capture:eight-video-proof
cd ..
bun run test:local
```

Windows PowerShell uses the same commands after equivalent process environment assignment:

```powershell
$env:HEADLESS = '0'
$env:PHYSICAL_BROWSER_OBSERVED = '1'
$env:PHYSICAL_BROWSER_OPERATOR = 'actual observer name'
$env:PHYSICAL_BROWSER_LAG_OBSERVED = '0'
bun run capture:visual-proof
Push-Location svelte
bun run capture:eight-video-proof
Pop-Location
bun run test:local
```

Visible lag blocks acceptance; record it rather than declaring the zero-lag attestation. The eight-video capture produces machine evidence and requires actual observer attestation of the completed run before its verifier passes. Follow the verifier's actual report contract; do not fabricate a report to unblock it. Keep current reports/screenshots/recording with the revision and physical machine identity.

### Windows Tauri

After browser checks, run:

```powershell
bun run smoke:desktop
```

For development-native cadence, set remote debugging before launch and keep the actual Tauri window visible:

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9633'
bun run dev:desktop
```

Load twelve representative clips and start Perform playback in that native window. In a second PowerShell terminal at repository root:

```powershell
$env:DESKTOP_SAMPLE_MS = '120000'
$env:DESKTOP_ALLOW_SCENE_CHANGES = '1'
$env:DESKTOP_REPORT = '.artifacts/desktop-playback-120s.json'
bun svelte/scripts/verify-desktop-playback.ts
```

Repeat with a unique report and `DESKTOP_SAMPLE_MS='600000'` for a ten-minute sample after the short run succeeds. The verifier attaches to the Tauri origin and requires active transport, twelve loaded decoders and Perform. It measures source-frame cadence, sampler identity/residency, scene replacements and decode drops. Timing needs its own selected-frame checks; this command deliberately rejects Timing. Do not count a normal Chrome instance as native evidence.

For release acceptance, repeat against the exact built/installed candidate with its build identity recorded. Verify complete demo loading, private media unlock/preparation, clean install, signed update, installation and relaunch separately. A successful debug build does not prove these flows.

## Required interaction and media matrix

Run on Windows browser, physical Mac browser and Windows Tauri with representative movement, not just static frames:

- Timing first visit and prepared demo: song/analysis/MIDI available, musical event/burst visible, presets immediately change both controls and rendered result; preserve the approved entry flow while auditing.
- Perform ↔ Timing during playback and during incomplete preparation: one authoritative transport, expected PGM selection, cancelled unfinished inactive-workspace work, bounded retained caches, no duplicate render/upload loops.
- Knob drag, preset changes, source selection, repeated clip replacement and arrangement boundaries while music continues; record input response and visible content separately from callback cadence.
- 480p, 720p and 1080p; landscape/portrait/square; representative codec/container and frame rates. Record accepted, transformed or rejected media behavior, aspect fit, original dimensions, preview/internal scale and export dimensions. Unsupported media must produce an actionable result rather than a silent black frame.
- Memory pressure and repeated load/remove cycles: allocated bank bytes, decoder count, pending uploads, startup/preload time and stable resource plateau. Repeat on the Mac's actual memory/GPU capacity.
- Browser tab hide/show, navigation return, Tauri minimize/restore, resize/fullscreen, GPU device-loss recovery and audio-route changes; confirm transport/resource behavior after return.
- Export and reopen a representative take: original-resolution visual result, correct timing/audio and actual editor interchange where claimed.

Before accepting audible quality, play a known clean reference through the actual monitoring route. Automated cadence runners default to volume zero and cannot attest audible timing or quality.

## Measurements and limitations

Record OS, GPU adapter/backend, browser/WebView2 version, refresh rate, viewport, device pixel ratio, source format/FPS, preview/preload profile, active sources/effects, beat feel, cut order, sample duration and source revision. Keep startup, cut latency, source-frame cadence, input response, decoded drops, memory, CPU encoding time and GPU execution time distinct. Report p95/p99 and worst gaps when the existing harness supports them; API-call duration is not a GPU timestamp. Browser submission is not physical scanout; sound-to-photon remains unmeasured unless separately instrumented.

The [playback benchmark](../../research/playback-benchmark.md) compares VideoPool/TimeSampler strategies using a common presenter and excludes production rack effects/AppLoop/PgmDirector. It is diagnostic evidence, not a substitute for the full application matrix. Historical 540p laptop preload measured 6.50 GiB versus 11.55 GiB at 720p, but [Timing verification](../../timing-workspace/VERIFICATION.md) explicitly says the M3 16 GB device was not directly tested and excludes browser/driver overhead from those figures.

V1S-347's November 1 completion and PR #53 supersede the October 22 unresolved snapshot. Re-run current-source cadence gates for release evidence instead of reopening the issue solely from old reports. Preserve historical failures as evidence of what the tests must catch.

## Desktop output experiment boundary

The shared WebGPU device is memoized within one page/global (`SharedGpuDevice.ts`). A second canvas in that page is the initial experiment for reusing the PGM resource without CPU readback. A separate Tauri WebView/window does not automatically inherit its device or textures; current native capabilities cover only `main`. External projection requires explicit frame ownership/transfer, independent refresh pacing, close/reopen/device-loss handling and verification that output/preview stalls do not block audio. Keep the existing engine and visual direction while proving this path; measure its added cost before expanding output features.

## Completion record

For each row, attach the exact revision, command/settings, machine and report/visual artifact, then mark **passed**, **failed** or **unverified**. Review score and CI remain additional merge conditions. Missing physical Mac, installed-desktop or visual/audio evidence stays unverified even when unit tests, frontend builds and code review pass.
