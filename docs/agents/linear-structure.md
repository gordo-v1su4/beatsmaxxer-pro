# Linear structure for Beatsmaxxer Pro

A minimal setup when you're new to Linear and the product direction just changed.

## The model (4 levels)

```text
Workspace (v1su4)
  └── Team (V1S)              ← who owns the work
        └── Project (Beatsmaxxer Pro)   ← the product (long-lived)
              └── Milestone (WebGPU Engine Sprint)   ← current phase (weeks)
                    └── Issues (V1S-55 … V1S-61)     ← one task each
```

| Level | When to create | Example |
|-------|----------------|---------|
| **Team** | Once | `V1S` — all your eng work |
| **Project** | One per product | `Beatsmaxxer Pro` |
| **Milestone** | Each new sprint or major pivot | `WebGPU Engine Sprint` |
| **Issue** | Every concrete task | `Research: deepen FreeCut analysis` |

**Do not** create a new project every sprint. Create a **new milestone** inside the same project.

## What to keep on the board

**Active:** only issues in the **current milestone** that are not Done.

**Remove from the board** when a phase is over:

- **Done** issues from old milestones → delete if you won't reference them (or archive team)
- **Canceled** issues → delete (they're noise after a pivot)
- **Unrelated** issues (wrong project) → cancel or move team

Repo handoff for agents stays in [`continuity.md`](./continuity.md) — Linear is for *your* queue, not a full history archive.

## Daily view (bookmark this)

1. **Projects** → **Beatsmaxxer Pro**
2. Filter or group: **Milestone = WebGPU Engine Sprint**
3. Work **Backlog → In Progress → Done** top to bottom

Or: **Issues** → filter **Project = Beatsmaxxer Pro** (what you have now — 7 issues).

## Issue types in this sprint

| Prefix in title | Meaning |
|-----------------|--------|
| `Research:` | Read clones, write `research/webgpu-peers/analyses/*.md` |
| `Implement:` | Code + tests in `svelte/` |

## Priority order (current sprint)

1. V1S-55, V1S-56 (research — blocks implement)
2. V1S-57, V1S-58 (research — parallel)
3. V1S-59 (arm-at-trim)
4. V1S-60 (bind groups)
5. V1S-61 (wgslLib)

## When this sprint ends

1. Mark V1S-55–61 **Done**
2. **Delete** those issues (or leave Done if you want history)
3. Create milestone e.g. `Mobile render scale` or `FX polish`
4. Add new issues under same **Beatsmaxxer Pro** project
5. Update [`continuity.md`](./continuity.md)

## GitHub vs Linear

| Tool | Use for |
|------|---------|
| **Linear** | Your sprint board, priorities, blockers |
| **GitHub Issues** | Agent skills (`/to-tickets`, `ready-for-agent`) — optional |

One source of truth is enough; we use **Linear** for you and **continuity.md** for agents.

## Bulk delete old issues (one-time cleanup)

The Cursor Linear plugin **cannot** delete issues — only you can, in the UI.

1. Open **Issues** (team V1S → All issues)
2. **Clear** the Beatsmaxxer Pro project filter (so you see everything)
3. **Filter** → Status → select **Done** and **Canceled**
4. Select issues **except** V1S-55–61 (Shift+click, or checkboxes on the left)
5. Right-click → **Delete** (confirm — not reversible)

Repeat until only V1S-55–61 remain (or delete Done sprint issues after you finish them).

### Delete old milestones

1. **Projects** → **Beatsmaxxer Pro** → **Milestones**
2. Delete: Completed Foundation, FX Correctness, Mobile Web, Arrangement Reliability, Release Proof, Future Platform
3. Keep: **WebGPU Engine Sprint**
