# Web playback verification — October 22, 2026

Local development candidate, in-app Chromium browser, public Redline Perform
workflow, twelve loaded slots, RANDOM cuts every beat, 270p sampler preload.
These are local measurements, not evidence of a deployed production fix.

## Results so far

- [Baseline, 60 seconds](baseline-60s.json): TimeSampler used live decoder seeks;
  its maximum observed source-frame gap was 683.6 ms. Ordinary slots also
  exceeded the 150 ms threshold. The whole-rack check failed.
- [Resident sampler, 120 seconds](resident-sampler-120s.json): TimeSampler used
  the GPU frame bank, with a maximum 150 ms gap and two prepared original-frame
  banks using 319,334,400 bytes. All twelve slots changed source three times.
  Other slots still had long gaps, up to 1,150.1 ms for Transition. The whole-rack
  check still failed. The sampling windows differ; this is not a controlled
  aggregate performance comparison.
- The largest ordinary-source gaps clustered around transport seconds 75–76,
  after a bank return. Main-loop rAF maximum gap was 133.4 ms, so a completely
  blocked main loop does not explain the full source-frame delay.
- [Fresh corrected-showcase run, 120 seconds](showcase-120s.json): twelve slots,
  three actual source swaps each, one-beat random cuts. Maximum ordinary gaps
  were 300–566.8 ms; SpeedRamp reached 633.3 ms and resident TimeSampler
  199.9 ms. The unchanged whole-rack thresholds still failed. rAF maximum gap
  was 166.7 ms. Test playback was stopped after sampling.

The desktop-only guard around PerformTimeSamplerFrames was removed so the web
uses the same GPU-resident original-frame sampler. Inactive Timing was confirmed
inactive with zero pending banks in both runs. This does not yet prove the web
playback issue resolved.

## Showcase correction

Fresh defaults and demo section banks no longer select Motion Streak, Halation,
Anamorphic or Film Grain. The showcase includes VHS, Barrel, Specialty Lens and
Inception. Existing operator-authored workflows remain explicit saved choices.
VHS can occupy either row; the QA MIDI fixture now targets VHS instead of the
no-longer-default Handheld slot.

VHS has a distinct broadcast calibration subject. Barrel and Lens use soft,
analytically feathered reference lines; their real effect shaders distort those
subjects. Both complete idle and video shader variants compiled without GPU
errors after the change. A derivative-based attempt was rejected by WGSL
uniform-control-flow validation and was replaced before saving these results.

![Updated graphic previews](showcase-previews.png)

Unit suite: 1,094 passed, eight skipped. Production build passed. The demo
integration test also checks all section banks and stored replay snapshots for
twelve unique effects and the four showcase replacements. Browser acceptance,
published-site verification and release propagation remain open.

## Next diagnosis

Ranked hypotheses to isolate before further playback edits:

1. Concurrent incoming decoder warmup competes with the outgoing bank, creating
   decoder/presentation backlog around handoffs.
2. Other open app tabs retain decoder/render work and affect the measured tab.
3. GPU presentation/shader load contributes to main-loop gaps but does not by
   itself account for the longer source-frame gaps above.

Repeat with only the measured app active, compare a no-swap interval against
bank crossings, and record candidate/outgoing decoder lifetimes. LINEAR and
RANDOM should then be compared under the same prepared-bank workload.
