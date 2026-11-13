# Beatsmaxxer desktop: Sentinel extension branch

Branch: `codex/sentinel-midi-connection`.

This branch preserves the custom Windows desktop app used with the Gods and Gatekeepers Sentinel scene. It adds six selectable MIDI sources, five lighting destination buses, note event previews, adjustable attack filtering / fade, transport position, BPM and localhost OSC output. The shared browser app remains available; sending OSC requires the Tauri desktop shell.

## Two applications

Beatsmaxxer Pro is our Svelte/WebGPU app in a Tauri native shell. Sentinel is the separately installed OODLabs application. These changes extend Beatsmaxxer and add user modules, scripts, fixtures and scene files inside Sentinel; they do not build a replacement Sentinel executable.

The verified local preview executable on the originating computer was `C:/Users/Gordo/.cache/beatsmaxxer-sentinel-target/debug/beatsmaxxer-pro-desktop.exe`, with the Tauri config override in `desktop/sentinel.preview.json` identifying it as `0.2.14-sentinel.1`. The source worktree was `C:/Users/Gordo/Documents/GitWorktrees/beatsmaxxer-sentinel`.

## Rebuild on another Windows computer

Requirements: Bun, Rust with the Windows MSVC build tools, and Microsoft WebView2. Install Sentinel separately through its official distribution.

```powershell
git clone --branch codex/sentinel-midi-connection https://github.com/gordo-v1su4/beatsmaxxer-pro.git
cd beatsmaxxer-pro
.\scripts\build-sentinel-preview.ps1
```

The script installs dependencies, builds the embedded frontend, then creates a standalone debug preview executable using the preview version override. It prints the final path. Add `-Run` to open it, after closing any other Beatsmaxxer window. It does not install or publish a stable updater release.

The private `gordo-v1su4/gods_and_gatekeepers` repository holds the matching lighting project, current shaders / receiver, geometry, and a portable scene backup. Its Sentinel-extension handoff documents the matching source commit and release asset. The old files under `integration/sentinel/` are early experiments, not the current scene package; use the private bundle's receiver and modules for the saved stage.

## Connection contract

The desktop shell sends UDP OSC to `127.0.0.1:9017`. Each packet is a 616-byte bundle: 24 scalar `/bmx/v/0` through `/bmx/v/23` messages, then `/bmx/commit`. It includes session and sequence, song generation and position, effective BPM, beat, playing, energy, playback rate, and five count / phase / envelope triples. There are six user-selectable inputs, but the transport combines them into five destination buses; two inputs targeting the same bus are combined.

Both apps run on the same computer. The saved Sentinel scene includes `BMX_Music`; its live indicator and changing packet count verify reception. The sender saying SENDING only proves that UDP sends succeeded, not that the receiver processed them. Musical media, imported MIDI parts, analysis caches, routing preferences, device selection, app access codes and API credentials are local data, not restored by checking out this branch. Re-import the same media and choose the six inputs on a new machine. Credentials remain in the machine's existing secret / access setup and must not be committed.

The preview still uses the main app's storage identity and stable updater configuration. Do not install a stable update over a Sentinel preview if you need to retain this branch's custom behavior; reopen or rebuild this preview explicitly. This branch does not automatically update every installed desktop app.

## Verification

- Three event cursor / routing unit tests: `cd svelte; bun run test tests/unit/runtime/sentinel-events.test.ts`.
- Native OSC alignment, finite-value rejection and bundle-size test: `cargo test --manifest-path desktop/src-tauri/Cargo.toml --lib sentinel::tests`.
- Production frontend build: `cd svelte; bun run build` with `TAURI_ENV_PLATFORM=1`.
- The captured `0.2.14-sentinel.1` executable was used in the live local integration. Rebuilding on another GPU / computer still requires a local playback and receiver check.
