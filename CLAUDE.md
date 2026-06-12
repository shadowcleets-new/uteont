@AGENTS.md

## Git Hygiene & Branching Protocol

- **Branching strategy:** single, clean feature-branch model off a single canonical trunk (`main`). Never create ad-hoc sub-branches or arbitrary local forks. Do not let the trunk diverge between local and `origin` — if `git status` shows local `main` ahead of `origin/main` by surprise, stop and reconcile before doing anything else.
- **Clean workspace rule:** keep the workspace free of untracked temporary files. Delete or `.gitignore` build artifacts immediately.
- **Commit discipline:** clear, descriptive messages matching the active milestone (e.g. `feat(milestone-1): implement collapsible sidebar navigation`).
- **PR strategy:** squash-merge feature branches back into the trunk to keep history readable and linear. Delete the branch after merge.
- **Worktrees:** this repo uses git worktrees under `.claude/worktrees/`. A branch checked out in a worktree cannot be deleted or reset until its worktree is removed (`git worktree remove`). Audit `git worktree list` before any branch surgery.

## Dynamic Context & State Management (`.claude/active_context.md`)

To minimize token consumption and maximize contextual accuracy, maintain a single dynamic state document at `.claude/active_context.md`. Read and update it at the start and end of every development cycle.

### Context document structure
1. **Current Focus** — a single sentence stating the immediate task.
2. **Current Milestone Status** — a high-level view of the roadmap.
3. **Active Working Context** — key configs, active files, known roadblocks.
4. **Next Immediate Steps** — the exact 3 actions to perform next.

### Execution rules
- **Before starting work:** read `.claude/active_context.md` to locate active working files without scanning the whole repo.
- **After completing a task:** write the updated state, active files, and milestone progression back.
- **Keep it brief:** ≤100 lines. Delete completed historical logs to prevent token bloat.
