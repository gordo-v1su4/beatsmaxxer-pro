# Third-party notices

Beatsmaxxer Pro is MIT-licensed (see [`LICENSE`](./LICENSE)). It ships the
following third-party software, each under its own license.

## SoundTouchJS — MPL-2.0

Real-time pitch and tempo processing (KEY / PITCH / TEMPO).

- Packages: `@soundtouchjs/audio-worklet`, `@soundtouchjs/core`,
  `@soundtouchjs/worklet-base`, `@soundtouchjs/interpolation-strategy-lanczos` (2.1.0)
- Author: Steve "Cutter" Blades — https://github.com/cutterbl/SoundTouchJS
- Based on the SoundTouch C++ library by Olli Parviainen — https://www.surina.net/soundtouch/
- License: Mozilla Public License 2.0 — https://www.mozilla.org/en-US/MPL/2.0/

[`svelte/static/soundtouch-processor.js`](./svelte/static/soundtouch-processor.js)
is an **unmodified** copy of the package's built AudioWorklet processor
(`@soundtouchjs/audio-worklet/.dist/soundtouch-processor.js`). Its source is
available at the repository above. The rest of this repository only calls the
library through its public API and is not covered by the MPL.

## Mediabunny — MPL-2.0

MP4 demuxing. Author: Vanilagy — https://github.com/Vanilagy/mediabunny.
Used unmodified from npm. License: https://www.mozilla.org/en-US/MPL/2.0/

## Lucide — ISC

Icons via `@lucide/svelte`. https://github.com/lucide-icons/lucide

## Tauri plugins — MIT or Apache-2.0

`@tauri-apps/plugin-process`, `@tauri-apps/plugin-updater` and the Tauri 2
desktop shell. https://github.com/tauri-apps/tauri

## Fonts — SIL Open Font License 1.1

Anton, Archivo Black, Audiowide, Bungee and Russo One, bundled in
[`svelte/static/fonts/`](./svelte/static/fonts/) with each font's license file
alongside it.
