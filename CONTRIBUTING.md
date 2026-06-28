# Contributing to UTEONT

## Secret-redaction checklist (read before every commit)

Secret hygiene is the project's recurring weak point (see `GAPS_REPORT.md`:
F-006/7/8, F-031, SEC-1, SEC-2). Before you commit:

- [ ] **No real secrets in the diff.** API keys, DB URLs, tokens, passwords, and
  the `CONNECTION_ENCRYPTION_KEY` never belong in tracked files. Use env vars.
- [ ] **`.env.local` stays untracked.** It is git-ignored — keep it that way. Point
  it at a throwaway/dev database, not production.
- [ ] **No captures with credentials.** Browser/automation captures (e.g.
  `.playwright-mcp/`) can record a typed password — they are git-ignored; don't
  force-add them.
- [ ] **Pre-commit scan is active.** Run `npm run prepare` once after cloning so
  the `.husky/pre-commit` gitleaks scan is wired up. Install
  [gitleaks](https://github.com/gitleaks/gitleaks) for local protection (CI
  scans regardless).
- [ ] **If a secret ever leaked, rotate it.** Removing it from the diff is not
  enough once it has been committed or shared — rotate the credential.

## Workflow

- Branch off `main`; keep history linear (squash-merge feature branches).
- `npm test` (Vitest) and `npx tsc --noEmit` must pass before you push.
- Worker changes: `cd worker && python -m pytest` must pass.
- DB schema changes: generate a migration with `npm run db:generate` and note in
  the PR that the operator must apply it (`npm run db:push`) — never assume the
  live schema auto-updates.
