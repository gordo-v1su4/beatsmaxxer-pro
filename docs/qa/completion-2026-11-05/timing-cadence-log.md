# Timing cadence execution log

The first November 5 full Windows attempt started from `9d2be16` with the
default six 60-second cases and unchanged 150 ms thresholds. During the run,
export source changes triggered development HMR. The run was stopped and is
invalid as candidate acceptance, including its completed partial cases.

Preserved partial evidence:
`svelte/.artifacts/completion-timing-cadence-9d2be16.json` (`complete:false`).
Do not count this as a passing full Timing report. The next full attempt must
use a recorded, stable candidate with no source edits/builds during sampling.
