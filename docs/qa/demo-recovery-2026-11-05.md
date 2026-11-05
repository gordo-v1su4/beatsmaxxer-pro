# Demo recovery review follow-up — November 5, 2026

Existing PR #52; current main2b531ff merged into its branch before the fixes.

The review regressions were reproduced before implementation: eight focused JS tests failed, including
an interrupted catalog body after successful headers and permanent native failures. A later independent
review found established-connection loss before response headers was still classified as permanent.
A real TCP server that accepted then closed reproduced that failure; the same native test passes after correction.

The catalog now retries the complete download, cancels unsuccessful response bodies, and parses/validates
only after a complete transfer. Permanent HTTP/configuration failures stop immediately. Native binary success
remains raw bytes; serializable native errors carry retryability and optional HTTP status. Older binaries'
unclassified failures remain permanent rather than blindly retrying configuration errors.
UI errors use recovery wording and retain their original cause. Manifest approval remains strict.
Routes, origin restrictions, cookie ownership, upload permissions and request size limits are unchanged.

Verified on Windows:

- `bun run --cwd svelte test tests/unit/qa/demo-catalog.test.ts tests/unit/platform/hosted-api.test.ts tests/unit/qa/demo-workflow.test.ts tests/unit/arrangement/workflow-file.test.ts`:39passed.
- `cargo test --manifest-path desktop/src-tauri/Cargo.toml --lib hosted_api::tests -- --test-threads=1`:5passed,1ignored live-service test.
- `bun run check`:0errors,0warnings.
- The native tests exercise real local HTTP302/404/429/503 and a connection interrupted before headers,
  plus serialized error metadata and the existing protected route/session behavior.

This is regression and native compilation evidence, not a newly installed hotfix or a proven explanation
for the original installed0.2.13 startup failure. Current CI/review and the affected release/runtime gates remain required.
