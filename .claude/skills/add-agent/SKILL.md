---
name: add-agent
description: Scaffold a new UTEONT pipeline agent across every file the multi-file pattern touches (registry, runner or worker handler, run-inputs, completeJob persist branch, sidebar). Use when adding an agent like Critic, Tactics Scraper, or a future producer.
disable-model-invocation: true
---

# Add a UTEONT agent

UTEONT agents are wired across several files in a fixed pattern. Miss one and
the agent half-works (shows in the registry but never runs, or runs but its
output is never persisted). Follow this checklist exactly.

## 1. Decide the runtime

- **`fn`** — deterministic or Gemini-backed, runs inline on Vercel. Most new
  agents. No worker host needed.
- **`worker`** — long-running / Playwright / Reddit-PRAW. Needs the Railway
  worker + a Python module.

## 2. Register it — `src/lib/agents/registry.ts`

Append to `AGENTS`:
```ts
{ key: "my-agent", name: "My Agent", sidebarLabel: "17. My Agent",
  description: "One sentence on what it does + any creds it needs.",
  runtime: "fn", implemented: true },
```

## 3a. fn runtime → `src/lib/agent-runners/`

- Create `src/lib/agent-runners/my-agent.ts` exporting the runner logic. Keep
  the **pure** logic separate from any fetch/Gemini call so it can be unit
  tested (see qa.ts, content-brief.ts, critic.ts).
- Register it in `src/lib/agent-runners/index.ts` `INLINE_RUNNERS`:
  ```ts
  "my-agent": async ({ payload }) => {
    const result = await runMyAgent(payload);
    return { result: result as unknown as Record<string, unknown> };
  },
  ```

## 3b. worker runtime → `worker/`

- Create `worker/agents/my_agent/` (mirror `tactics_scraper_agent`): an entry
  fn `run(payload) -> dict`, degrade gracefully on missing creds.
- Register the handler in `worker/worker.py`: add `handle_my_agent` and an
  entry in `HANDLERS`.
- If it persists typed rows, add a table + migration (step 5) and a persist
  branch in `applyJobResult` (step 4).

## 4. Persist output — `src/lib/services/jobs.ts` (`applyJobResult`)

If the agent produces rows (keywords/ideas/articles/tactics/critiques), add a
branch in the agent-persist switch:
```ts
} else if (input.agentKey === "my-agent") {
  const { persistMine } = await import("./mine");
  await persistMine(input.siteId, fromResult(input.result));
}
```

## 5. Table + migration (only if it persists typed rows)

- Add the `pgTable` to `src/lib/db/schema.ts` (+ `export type`).
- Author an **idempotent** migration by hand (`CREATE TABLE IF NOT EXISTS`,
  `DO $$ ... EXCEPTION WHEN duplicate_object`) — see `0011`, `0012`. Do NOT run
  `drizzle-kit migrate` blind (journal drift; use the `verify-migration` skill).

## 6. Run inputs — `src/lib/agents/run-inputs.ts`

Add the agent's `AGENT_INPUTS` entry (the fields its Run form shows). Mark a
field `required: true` only if the agent can't run without it.

## 7. Verify

`npx tsc --noEmit && npx eslint <touched files> && npm test <new tests>` and a
`next build`. For worker code, `python -m py_compile worker/...`.
