# Pro responsiveness and Mac WebKit capability research

Checked 2026-11-05 against primary sources. Scope: existing Beatsmaxxer Pro Svelte/WebGPU web application and its Tauri shell. This note proposes measurements; it does not establish a new renderer, Safari acceptance or Mac Tauri release support.

## Decision

Keep the shared engine and approved interface while measuring input response, video cadence and workspace ownership separately. The current QA lane has actual Mac Chrome lifecycle evidence; it does not establish Safari/WKWebView compatibility. Before adding Mac packaging, pass an in-process WKWebView capability and real-media render gate on the actual OS/build.

Local evidence: the inspected Mac is an Apple M3 Air with 16 GB shared memory, macOS 26.7.2, Chrome 156.0.8078.80 and installed Safari **27.2**. The Safari version is a local installation observation, not a claim about public Safari release naming or supported WebKit features. Revision `90c92e4` passed three workspace lifecycle cycles plus real tab-background activation in headed Mac Chrome, with twenty observations. The report is `.artifacts/completion-2026-11-05/mac/lifecycle3-background.json`; physical monitoring was not observed and the runner deliberately muted audio. See [platform acceptance](../qa/completion-2026-11-05/platform-acceptance.md).

## Safari versus WKWebView

WebKit's Safari 26 announcement states that WebGPU shipped on macOS, iOS, iPadOS and visionOS. That announcement supports investigating the existing engine on modern Safari; it is not an application-specific twelve-source, memory or codec guarantee. [WebKit Safari 26 features](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/#webgpu)

Tauri on macOS uses the operating system's **WKWebView**, whose WebKit receives OS updates. Installing a Chrome version does not select Tauri's engine. Obtain the system framework version independently of the Safari application's version. [Tauri webview versions](https://v2.tauri.app/reference/webview-versions/)

```sh
/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' \
  /System/Library/Frameworks/WebKit.framework/Resources/Info.plist
```

Upstream WebKit's current preference definition makes WebGPU's default conditional on `ENABLE(WEBGPU_BY_DEFAULT)` and disables it in Lockdown Mode. The corresponding current platform source enables that macro for a Mac **WebKit build** whose minimum required macOS version is at least 26. These are **upstream source/build conditions**, not proof of the shipped framework's effective preference in a particular Tauri binary. Changing a Tauri application's deployment target is not evidence that the OS framework was rebuilt with that condition. Record the actual runtime result rather than assuming an SDK/runtime version or Safari success is sufficient. [WebKit preference definition](https://github.com/WebKit/WebKit/blob/main/Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml), [WebKit platform build condition](https://github.com/WebKit/WebKit/blob/main/Source/WTF/wtf/PlatformEnable.h)

A WebKit maintainer explicitly explained in an older iOS 18 issue that Safari feature flags do not govern WKWebViews in other apps. Treat that as evidence about preference isolation, not as a current macOS support verdict. Enabling an experimental Safari flag is therefore not an acceptance strategy for a Tauri distribution. [WebKit issue 284621](https://bugs.webkit.org/show_bug.cgi?id=284621)

### Capability gate before Mac Tauri packaging

WebGPU requires a secure context and exposes adapter/device acquisition rather than guaranteeing an adapter whenever the property exists. Optional features/limits must be inspected and requested explicitly. [WebGPU specification](https://www.w3.org/TR/webgpu/)

Proposed sequence, to run inside the **actual built WKWebView**:

1. Record app revision, OS/framework version, `location.origin`, `isSecureContext`, `navigator.gpu`, adapter availability, limits/features and device-creation outcome. Use the same required limits as Pro rather than an unrelated demo.
2. Compile the entire Pro effect catalog with its existing compatible WebGPU fallbacks; render/read back a small known-color correctness probe. Missing effects or failed compilation blocks readiness.
3. Decode a real accepted clip, verify nonzero dimensions and matching presented-frame timestamps, then run the real HTMLVideo → GPU upload/presentation path. Test both first frame and looping replacement, including color/orientation.
4. Run actual Perform/Timing workspace switching, audio gesture/resume, file selection, export and hidden/restored lifecycle. Record the 16 GB device's chosen preload profile and resource plateau.
5. Only after those pass, validate packaging/signing/update/file-access behaviors separately. Current Pro release configuration still targets Windows; the repository's Mac `smoke:desktop` branch only checks the frontend.

Steps 2–5 are application acceptance proposals inferred from Pro's engine and support boundaries, not promises made by WebKit/Tauri. The existing repo pointers are [desktop README](../../desktop/README.md), [desktop smoke script](../../scripts/desktop-smoke.sh), [release workflow](../../.github/workflows/release.yml) and [shared GPU device lifecycle](../../svelte/src/lib/rendering/webgpu/SharedGpuDevice.ts).

## Input response needs a different measurement from video smoothness

INP measures interaction-to-next-paint for clicks, taps and keyboard interactions. Its field guidance is p75 at or below 200 ms; that general website threshold is not a desirable knob-drag/video-performance latency target. Hovering, zooming and scrolling are outside INP. [INP definition and thresholds](https://web.dev/articles/inp)

Event Timing exposes start, handler-start/end and duration, with interaction IDs for related events. Its current draft excludes continuous events such as pointer movement, wheel and drag. Therefore knob drags and timeline scrubbing need a separate sampled continuous-interaction measure; their click/keyboard affordances can still use Event Timing. The draft's precision/threshold behavior also means these measurements cannot claim sub-millisecond physical latency. [Event Timing draft](https://w3c.github.io/event-timing/)

Decompose discrete interactions into input delay, handler processing and presentation delay; correlate slow interactions with the surrounding rendering work before changing code. Main-thread contention can delay an otherwise short event handler. [Chrome INP diagnosis guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/performance/identify-inp-causes)

Long Animation Frames (LoAF) identify rendering updates delayed beyond 50 ms and expose script/rendering attribution. Several short tasks can collectively cause a bad frame. LoAF duration excludes presentation time; it is not GPU pass time. Feature-detect `long-animation-frame` using `PerformanceObserver.supportedEntryTypes`, stream observations and keep bounded summaries. Missing API support must be reported as unavailable, never zero blocking. [Chrome LoAF documentation](https://developer.chrome.com/docs/web-platform/long-animation-frames)

### Proposed bounded instrumentation

Add a QA-only observer with explicit start/stop/dispose and a capped ring buffer. Capture supported entry types, Event Timing records grouped by interaction ID, and overlapping LoAF script/render intervals. Store summaries locally with revision, source/profile/viewport, active workspace and exact action. This is proposed instrumentation, not code installed by this note.

For continuous interactions, mark trusted input receipt, state application, and the first render carrying that state revision. Record latest-input age and frame gaps while dragging. Treat an rAF callback or GPU submission marker as software-stage timing; neither is proof of physical screen update. Correlate with actual visible movement and existing source-frame observations before claiming improvement.

Exercise the same fixed action script while stopped, playing twelve Perform slots, playing prepared Timing, opening Arrange, loading clips and returning from background. Include preset changes, source cuts, knob drags and timeline scrub. Keep pixel fidelity and musical scheduling in the acceptance matrix so a lower workload or skipped effect cannot masquerade as a speed gain.

Recommended result columns are action, input delay p95/p99, handler duration, software render-ack delay, LoAF count/worst blocking duration, source-cadence worst gap, decoded drops, resident bytes/pending jobs and supported/missing timing APIs. Use comparable runs on Windows Chrome, Mac Chrome, Safari and WebView2; WKWebView joins only after its capability gate. Establish product-specific thresholds from baseline and perceptual checks rather than adopting the 200 ms web score as a live-performance SLA.

## Remaining evidence

- Mac Chrome's passing lifecycle gate establishes observed clock continuity, renderer ownership and exposed resource convergence for that run. It does not measure input latency, effect fidelity, audible quality or physical sound-to-photon.
- Safari 27.2 was inventoried but not driven or measured by this research. Safari and WKWebView capability gates remain unverified.
- LoAF/Event Timing support must be recorded in each tested engine. The instrumentation proposal must retain equivalent software-stage measurements where those APIs are absent.
- Optional GPU timestamp profiling can complement CPU/input telemetry, but requires the adapter/device feature and separate instrumentation overhead checks; preserve the nonprofiling path. [WebGPU timestamp-query feature](https://www.w3.org/TR/webgpu/#timestamp-query)
