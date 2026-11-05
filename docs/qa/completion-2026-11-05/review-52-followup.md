# Demo recovery PR review follow-up

Workstream: V1S-430. Existing [PR #52](https://github.com/gordo-v1su4/beatsmaxxer-pro/pull/52).
The existing branch is checked out in a separate review worktree; current main was merged into it without conflicts.
The primary performance-baseline worktree remains on codex/completion-verification.

The October22 Greptile4/5 review identified two valid missing cases:

- A response-body network interruption happens after fetch has succeeded, so the old response.json call lies outside retries.
- The native binary IPC bridge rejects configuration and HTTP failures as strings; the retry caller cannot distinguish permanent failures.

The applicable repository reviewer also flagged abandoned response bodies and raw network messages reaching users.
Known fixes are being batched: include complete body download in each network attempt, parse/validate once outside retries,
cancel unsuccessful response bodies, preserve native retryability/status metadata, and show a concise recovery message with original cause retained.
This does not broaden route access or change the native cookie/session bridge.

Regression tests reproduced the missing cases before implementation. Fixes are pushed on the existing PR as4e825bf.
FocusedJS:39passed. NativeWindowsRust:5passed,1ignored live test. Typecheck:0errors/0warnings.
Independent review caught an additional pre-header transport interruption; an actualTCPserver reproduced it, and the corrected classifier passes.
CurrentCI and Greptile checks succeeded; score/reviewed-head verification and the repository reviewer remain merge gates.

Use the existing PR, retain its original installed-app failure evidence, and obtain current checks/reviews before merge.
An older installed binary will keep its behavior until the separately verified signed release/update is installed.
