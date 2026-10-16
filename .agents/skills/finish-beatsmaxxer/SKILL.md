---
name: finish-beatsmaxxer
description: Resume and finish the Beatsmaxxer Pro Linear delivery goal, including public demo workflows, documentation, browser acceptance, deployment and the final loaded-app Brag video. Use when asked to continue the Beatsmaxxer completion goal or finish its Linear queue.
---

# Finish Beatsmaxxer

Complete the current Linear scope with working production behavior and evidence. The live board owns task status; this skill owns the delivery process.

## Resume

1. Read the active goal and inspect Git branch, worktrees, dirty files, listeners and deployment revision. Preserve existing changes. Read the workspace AGENTS.md, `docs/agents/continuity.md` and, before deployment, `docs/deploy-app-vm.md`. Use Graft for code discovery and callers before structural changes.
2. Refresh every non-completed issue in the Beatsmaxxer Pro Linear project, then read their full descriptions and relations. Start with parent **V1S-258**, its children and linked **V1S-252/253/254**. Reconcile previous acceptance evidence against current code instead of restarting completed work.
3. Treat explicitly deferred Backlog work separately: **V1S-251** (future Timesampler) and **V1S-255** (desktop media API) remain deferred unless the user expands scope. If a new issue changes that boundary, resolve it from the latest human instruction.
4. Record the current issue as In Progress. Work through dependencies, update evidence on that issue, then select the next ready item. Keep the goal active while implementation, verification, reviews, deployment or final media remains unfinished.

## Product acceptance

- **Public workflows:** keep WORKFLOW publicly available for the current demo period. Its media must resolve in production; removing a DEV condition alone is insufficient because the existing saved presets depend on dev-only media routes.
- **Anonymous demo:** the owner approved trying curated workflows without a code. New song/clip/Timing imports request the existing code on demand; cancel preserves the demo. Keep private upload/analysis/job APIs protected. Only allowlisted verified ready demo results may use the public read lane. The owner waived Kimi for PR #45 only; do not generalize that waiver to future PRs.
- **Finished demo:** one action loads matching audio, clips, timing/MIDI, settings, sections and recorded cuts. At least two distinct reusable clip banks repeat across verse/chorus assignments and visibly swap during PLAY. Explain deck slots such as A1 separately from banks.
- **Save/load:** build on arrangement persistence. Round-trip sections, cuts, settings, banks and assignments; make media references and relinking clear. Invalid imports preserve the current work.
- **Entry:** real visitors stay at READY / 100% until activating a blinking semantic ENTER button. Verify cached and cold navigation, keyboard/touch, reduced motion and no click-through. Preserve explicit QA bypass and developer HMR behavior.
- **Docs:** use the diagram-design skill and Pindeck's new `src/components/docs/` implementation as the reference. Prefer filled surfaces without outlined cards, concise topic navigation, accurate Timing curves and readable diagrams. Leave header button thickness unchanged; the reported workspace shift was withdrawn.

## Verify and release

Use Bun and the required Svelte skills. Run checks appropriate to the change, then prove affected user flows in the browser. The existing server GPU acceptance environment is preferred for media/performance runs; confirm live availability before reuse and avoid disturbing another project's local GPU workload.

Only Ramp requires verified >=96 FPS preparation. Originals/Stutter retain their native video path. Reuse content-hash/provenance-verified artifacts. Verify full-song Perform REC/PLAY/export and Timing demo replay/export with all intended sources, section bank swaps, portable save/load and rapid rack-swap stress. Inspect the exported file's frames and audio; a successful download is insufficient.

Keep the entire completion scope on one working branch. The owner requires **one final PR**, opened only after implementation and final acceptance evidence are complete. Branch pushes and test/preview publishing are authorized along the way; preserve main for the final reviewed merge. Include all final tests and evidence in that one PR.

Before finalization, inspect intended diffs, secrets and tests, stage only intended files and follow current repository review requirements. Wait for required PR reviews and address real findings before merge. Use the documented managed deployment path and verify the exact public revision plus the affected production flows. Linear Done requires that issue's acceptance evidence; preserve any unresolved gaps explicitly.

## Final Brag capture

Run only after the working app and demo are accepted. Discover the installed `brag` or `brag-slim` skill and read its complete workflow before execution. The October 15 installation was under `~/.claude/plugins/cache/brag/brag/0.4.0/skills/`; rediscover if that version moves. `/brag` uses Hyperframes; `/brag-slim` is the lighter self-contained route. Choose the available route suitable for the request, without inventing unavailable tooling.

Load real clips and the finished arrangement before capturing. Show the app doing its job: entry, load demo, musical picture changes, repeated bank assignments and a finished result. A launch video is separate from performance evidence; include only measured claims. Preserve existing `brag-output*` directories and use a fresh timestamped output. Inspect settled frames, transitions, audio and the rendered video; deliver the video, poster and share copy required by the selected skill.

Finish the goal only when all in-scope Linear acceptance, production release and final capture deliverables are complete. Report the exact remaining blocker if a required external condition prevents progress.
