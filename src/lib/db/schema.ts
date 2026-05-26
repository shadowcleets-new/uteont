/**
 * Drizzle ORM schema for UTEONT.
 *
 * Tables:
 *   - runs: every agent execution (telemetry)
 *   - jobs: work queue for the browser worker
 *   - keywords: Research Agent output
 *
 * Future tables (uncomment + migrate as agents land):
 *   - ideas, drafts, performance_metrics, approvals, etc.
 */

import {
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  integer,
  real,
  index,
} from "drizzle-orm/pg-core";

export const runs = pgTable(
  "runs",
  {
    id:          serial("id").primaryKey(),
    subjectKey:  text("subject_key").notNull(),  // 'agent.<key>' | 'infra.<name>'
    category:    text("category").notNull(),     // 'agent' | 'infra'
    action:      text("action").notNull(),       // e.g. 'discover_keywords'
    startedAt:   timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt:  timestamp("finished_at", { withTimezone: true }),
    status:      text("status").notNull().default("running"), // 'running'|'success'|'failure'
    result:      jsonb("result"),
  },
  (t) => ({
    bySubject: index("runs_subject_idx").on(t.subjectKey),
    byStarted: index("runs_started_idx").on(t.startedAt.desc()),
  }),
);

export const jobs = pgTable(
  "jobs",
  {
    id:           serial("id").primaryKey(),
    agentKey:     text("agent_key").notNull(),
    payload:      jsonb("payload").notNull(),
    status:       text("status").notNull().default("queued"), // queued|claimed|done|failed
    claimedBy:    text("claimed_by"),    // worker instance id
    claimedAt:    timestamp("claimed_at", { withTimezone: true }),
    finishedAt:   timestamp("finished_at", { withTimezone: true }),
    result:       jsonb("result"),
    error:        text("error"),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    attempts:     integer("attempts").notNull().default(0),
  },
  (t) => ({
    byStatus:  index("jobs_status_idx").on(t.status),
    byAgent:   index("jobs_agent_idx").on(t.agentKey),
  }),
);

export const keywords = pgTable(
  "keywords",
  {
    id:                    serial("id").primaryKey(),
    keyword:               text("keyword").notNull(),
    searchVolumeEstimate:  integer("search_volume_estimate").notNull(),
    competitionScore:      real("competition_score").notNull(),  // 0..1
    source:                text("source").notNull(),
    priorityRank:          integer("priority_rank").notNull(),
    runId:                 integer("run_id").references(() => runs.id),
    createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byRun:      index("keywords_run_idx").on(t.runId),
    byPriority: index("keywords_priority_idx").on(t.priorityRank),
  }),
);

export type Run = typeof runs.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Keyword = typeof keywords.$inferSelect;
