---
name: verify-migration
description: Prove the live DB schema matches the code after a migration — runs scripts/verify-migration.mjs, which applies pending migrations then asserts every expected table exists. Use after adding a table/migration or when investigating schema drift (GAPS F-034 / LO-41).
disable-model-invocation: true
---

# Verify migration

The live Neon DB has drifted from `drizzle/meta/_journal.json` before (F-034):
`db:migrate` reported success while migrations silently didn't apply. Never
trust a green migrate — verify the actual schema.

## Run

```bash
node --env-file=.env.local scripts/verify-migration.mjs
```

This:
1. Applies pending migrations (idempotent — our migrations use
   `CREATE TABLE IF NOT EXISTS` / `DO $$ EXCEPTION WHEN duplicate_object`).
2. Queries `information_schema.tables` and asserts every table the schema
   defines actually exists.
3. **Fails loud** (non-zero exit) on any missing table.

## When it fails

- A table is missing → the migration didn't apply. Inspect the migration SQL,
  apply it directly against Neon (it's idempotent), and re-run.
- Do NOT hand-edit `drizzle/meta/_journal.json` to paper over drift — fix the
  schema, not the bookkeeping.

## Guardrails

- Migrations `0005`–`0007` and `0010`–`0012` were applied directly (not via the
  journal), so `drizzle-kit migrate` alone under-reports. This script checks the
  real schema, which is the source of truth.
- A `PreToolUse` hook blocks edits to already-applied `drizzle/00NN_*.sql` files
  so an applied migration can't be silently rewritten (which would desync).
