/**
 * Drizzle ORM schema for UTEONT — v1 complete backend.
 *
 * Tables:
 *   - cycles          one research-to-publish cycle (goal + status)
 *   - runs            every agent execution (telemetry)
 *   - jobs            queue for the browser worker
 *   - keywords        Research Agent output
 *   - ideas           Idea Generation output (article angles + briefs)
 *   - articles        Drafts + meta + publish state
 *   - approvals       Audit log of human gate decisions
 *   - notifications   Outbound notification log (Telegram, email)
 *   - agent_state     Per-agent KV (current job, cooldowns, etc.)
 *   - kv_settings     Generic app settings KV
 */

import {
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  integer,
  real,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const sites = pgTable(
  "sites",
  {
    id:                serial("id").primaryKey(),
    key:               text("key").notNull(),
    name:              text("name").notNull(),
    domain:            text("domain").notNull(),
    locale:            text("locale").notNull(),
    niche:             text("niche"),
    audience:          text("audience"),
    voiceGuide:        text("voice_guide"),
    contentPillars:    jsonb("content_pillars").$type<string[]>().notNull().default([]),
    bannedPhrases:     jsonb("banned_phrases").$type<string[]>().notNull().default([]),
    defaultCategories: jsonb("default_categories").$type<string[]>().notNull().default([]),
    cmsPlatform:       text("cms_platform").notNull().default("none"),
    sitemapUrl:        text("sitemap_url"),
    gscPropertyId:     text("gsc_property_id"),
    ga4PropertyId:     text("ga4_property_id"),
    status:            text("status").notNull().default("active"),
    createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byKey:    uniqueIndex("sites_key_unique_idx").on(t.key),
    byStatus: index("sites_status_idx").on(t.status),
  }),
);

export const siteIntegrations = pgTable(
  "site_integrations",
  {
    id:              serial("id").primaryKey(),
    siteId:          integer("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    kind:            text("kind").notNull(),
    label:           text("label"),
    config:          text("config").notNull(),   // base64 ciphertext
    configIv:        text("config_iv").notNull(),
    configTag:       text("config_tag").notNull(),
    status:          text("status").notNull().default("unverified"),
    lastVerifiedAt:  timestamp("last_verified_at", { withTimezone: true }),
    lastError:       text("last_error"),
    createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySite: index("site_integrations_site_idx").on(t.siteId),
    byKind: index("site_integrations_kind_idx").on(t.siteId, t.kind),
    byStatus: index("site_integrations_status_idx").on(t.status),
  }),
);

export const cycles = pgTable(
  "cycles",
  {
    id:         serial("id").primaryKey(),
    goal:       text("goal").notNull(),
    seedTerms:  jsonb("seed_terms").$type<string[]>().notNull().default([]),
    status:     text("status").notNull().default("researching"),
      // researching | ideas-ready | drafting | qa | staged | published | archived
    siteId:     integer("site_id").notNull().references(() => sites.id),
    createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStatus: index("cycles_status_idx").on(t.status),
    bySite:   index("cycles_site_idx").on(t.siteId),
  }),
);

export const runs = pgTable(
  "runs",
  {
    id:          serial("id").primaryKey(),
    subjectKey:  text("subject_key").notNull(),
    category:    text("category").notNull(),
    action:      text("action").notNull(),
    cycleId:     integer("cycle_id").references(() => cycles.id),
    jobId:       integer("job_id"),
    siteId:      integer("site_id").notNull().references(() => sites.id),
    startedAt:   timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt:  timestamp("finished_at", { withTimezone: true }),
    status:      text("status").notNull().default("running"),
    result:      jsonb("result").$type<Record<string, unknown>>(),
    error:       text("error"),
  },
  (t) => ({
    bySubject: index("runs_subject_idx").on(t.subjectKey),
    byStarted: index("runs_started_idx").on(t.startedAt.desc()),
    byCycle:   index("runs_cycle_idx").on(t.cycleId),
    bySite:    index("runs_site_idx").on(t.siteId),
  }),
);

export const jobs = pgTable(
  "jobs",
  {
    id:           serial("id").primaryKey(),
    agentKey:     text("agent_key").notNull(),
    cycleId:      integer("cycle_id").references(() => cycles.id),
    payload:      jsonb("payload").notNull(),
    status:       text("status").notNull().default("queued"),
      // queued | claimed | done | failed
    claimedBy:    text("claimed_by"),
    claimedAt:    timestamp("claimed_at", { withTimezone: true }),
    finishedAt:   timestamp("finished_at", { withTimezone: true }),
    result:       jsonb("result"),
    error:        text("error"),
    attempts:     integer("attempts").notNull().default(0),
    maxAttempts:  integer("max_attempts").notNull().default(3),
    priority:     integer("priority").notNull().default(0),
    siteId:       integer("site_id").notNull().references(() => sites.id),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStatus: index("jobs_status_idx").on(t.status),
    byAgent:  index("jobs_agent_idx").on(t.agentKey),
    byCycle:  index("jobs_cycle_idx").on(t.cycleId),
    bySite:   index("jobs_site_idx").on(t.siteId),
  }),
);

export const keywords = pgTable(
  "keywords",
  {
    id:                    serial("id").primaryKey(),
    cycleId:               integer("cycle_id").references(() => cycles.id),
    keyword:               text("keyword").notNull(),
    searchVolumeEstimate:  integer("search_volume_estimate").notNull(),
    competitionScore:      real("competition_score").notNull(),
    source:                text("source").notNull(),
    priorityRank:          integer("priority_rank").notNull(),
    status:                text("status").notNull().default("researched"),
      // researched | approved | in-progress | published | shelved
    shelvedReason:         text("shelved_reason"),
    approvedAt:            timestamp("approved_at", { withTimezone: true }),
    runId:                 integer("run_id").references(() => runs.id),
    siteId:                integer("site_id").notNull().references(() => sites.id),
    createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byCycle:    index("keywords_cycle_idx").on(t.cycleId),
    byStatus:   index("keywords_status_idx").on(t.status),
    byPriority: index("keywords_priority_idx").on(t.priorityRank),
    bySite:     index("keywords_site_idx").on(t.siteId),
  }),
);

/**
 * Closed-loop negative feedback: phrases the operator rejected (shelved
 * keyword, manual add on /exclusions). Suppressed from future runs both
 * at prompt time (payload.exclusions) and at ingestion time (lexical
 * filter in persistResearchKeywords). A unique index on
 * (site_id, LOWER(phrase)) — declared in migration 0011, expression
 * indexes live in SQL — collapses case variants so captures are
 * idempotent.
 */
export const keywordExclusions = pgTable(
  "keyword_exclusions",
  {
    id:        serial("id").primaryKey(),
    siteId:    integer("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    phrase:    text("phrase").notNull(),
    reason:    text("reason"),
    source:    text("source").notNull().default("keyword"),  // keyword | idea | article | manual
    sourceId:  integer("source_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySite: index("keyword_exclusions_site_idx").on(t.siteId),
  }),
);

export const ideas = pgTable(
  "ideas",
  {
    id:           serial("id").primaryKey(),
    keywordId:    integer("keyword_id").references(() => keywords.id),
    cycleId:      integer("cycle_id").references(() => cycles.id),
    angle:        text("angle").notNull(),
    brief:        text("brief").notNull(),
    intent:       text("intent"),  // informational | transactional | navigational | commercial
    status:       text("status").notNull().default("proposed"),
      // proposed | approved | rejected | drafting | done
    rejectReason: text("reject_reason"),
    runId:        integer("run_id").references(() => runs.id),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt:    timestamp("decided_at", { withTimezone: true }),
  },
  (t) => ({
    byCycle:   index("ideas_cycle_idx").on(t.cycleId),
    byKeyword: index("ideas_keyword_idx").on(t.keywordId),
    byStatus:  index("ideas_status_idx").on(t.status),
  }),
);

export const articles = pgTable(
  "articles",
  {
    id:               serial("id").primaryKey(),
    ideaId:           integer("idea_id").references(() => ideas.id),
    cycleId:          integer("cycle_id").references(() => cycles.id),
    title:            text("title").notNull(),
    slug:             text("slug").notNull(),
    body:             text("body").notNull(),
    metaTitle:        text("meta_title"),
    metaDescription:  text("meta_description"),
    qaScore:          integer("qa_score"),
    qaReport:         jsonb("qa_report"),
    seoScore:         integer("seo_score"),
    seoReport:        jsonb("seo_report"),
    status:           text("status").notNull().default("draft"),
      // draft | qa-passed | approved | staged | published | rejected
    publishedAt:      timestamp("published_at", { withTimezone: true }),
    cmsUrl:           text("cms_url"),
    runId:            integer("run_id").references(() => runs.id),
    siteId:           integer("site_id").notNull().references(() => sites.id),
    createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byCycle:   index("articles_cycle_idx").on(t.cycleId),
    byStatus:  index("articles_status_idx").on(t.status),
    bySlug:    index("articles_slug_idx").on(t.slug),
    bySite:    index("articles_site_idx").on(t.siteId),
  }),
);

export const approvals = pgTable(
  "approvals",
  {
    id:           serial("id").primaryKey(),
    gate:         text("gate").notNull(),
      // A: idea-selection | B: content | C: production | D: major-changes | E: outreach
    targetType:   text("target_type").notNull(), // 'idea' | 'article' | 'change'
    targetId:     integer("target_id").notNull(),
    decision:     text("decision").notNull(),    // 'approve' | 'reject' | 'edit'
    note:         text("note"),
    decidedBy:    text("decided_by").notNull().default("user"),
    decidedAt:    timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    channel:      text("channel").notNull().default("web"), // 'web' | 'telegram'
  },
  (t) => ({
    byGate:   index("approvals_gate_idx").on(t.gate),
    byTarget: index("approvals_target_idx").on(t.targetType, t.targetId),
  }),
);

export const notifications = pgTable(
  "notifications",
  {
    id:          serial("id").primaryKey(),
    channel:     text("channel").notNull(),  // 'telegram' | 'email'
    kind:        text("kind").notNull(),     // 'approval-request' | 'completion' | 'error' | 'digest'
    subject:     text("subject"),
    body:        text("body").notNull(),
    payload:     jsonb("payload"),
    status:      text("status").notNull().default("pending"),
      // pending | sent | failed
    sentAt:      timestamp("sent_at", { withTimezone: true }),
    error:       text("error"),
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStatus: index("notifications_status_idx").on(t.status),
    byKind:   index("notifications_kind_idx").on(t.kind),
  }),
);

export const agentState = pgTable("agent_state", {
  agentKey:     text("agent_key").primaryKey(),
  paused:       boolean("paused").notNull().default(false),
  pauseReason:  text("pause_reason"),
  cooldownUntil:timestamp("cooldown_until", { withTimezone: true }),
  lastRunAt:    timestamp("last_run_at", { withTimezone: true }),
  config:       jsonb("config"),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kvSettings = pgTable("kv_settings", {
  key:        text("key").primaryKey(),
  value:      jsonb("value").notNull(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Single-row table (id=1 always). Holds the user-facing auth credentials
// so they can be rotated via Telegram commands without redeploys.
// All fields nullable: empty DB → no login possible (set via Telegram first).
export const authConfig = pgTable("auth_config", {
  id:                  serial("id").primaryKey(),
  username:            text("username"),
  passwordHash:        text("password_hash"),
  allowedGoogleEmail:  text("allowed_google_email"),
  // Admin chat ID for Telegram bot commands. Takes precedence over the
  // TELEGRAM_CHAT_ID env var so it can be rotated without a redeploy.
  adminChatId:         text("admin_chat_id"),
  // One-time URL flow for setting password without putting it in chat.
  // /setpassword-url generates a token + expiry; /setup/<token> consumes it.
  setupToken:          text("setup_token"),
  setupTokenExpiresAt: timestamp("setup_token_expires_at", { withTimezone: true }),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Audit + rate-limit source. Every credentials sign-in attempt
// (success or fail) writes a row. A new attempt is rejected if
// >= N failures in the trailing M minutes from any source.
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id:         serial("id").primaryKey(),
    username:   text("username").notNull(),
    success:    boolean("success").notNull(),
    ipAddress:  text("ip_address"),
    userAgent:  text("user_agent"),
    createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byCreated: index("login_attempts_created_idx").on(t.createdAt),
    byUsername: index("login_attempts_username_idx").on(t.username),
  }),
);

/**
 * P1 — Director Agent tables.
 * One conversation = one chat thread with the Director. Persists across
 * web + Telegram surfaces so the user can pick up where they left off.
 */
export const conversations = pgTable(
  "conversations",
  {
    id:            serial("id").primaryKey(),
    title:         text("title"),
    goal:          text("goal"),          // the parsed end-goal from the user's initial message
    status:        text("status").notNull().default("active"),  // active | paused | completed | archived
    planApproved:  boolean("plan_approved").notNull().default(false),
    surface:       text("surface").notNull().default("web"),  // web | telegram | both
    siteId:        integer("site_id").references(() => sites.id),
    summary:       text("summary"),                                       // rolling summary of messages folded out of the window
    summaryUpToId: integer("summary_up_to_id").notNull().default(0),       // highest message id covered by `summary`
    createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStatus:        index("conversations_status_idx").on(t.status),
    byLastMessage:   index("conversations_last_message_idx").on(t.lastMessageAt),
    bySite:          index("conversations_site_idx").on(t.siteId),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id:             serial("id").primaryKey(),
    conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    role:           text("role").notNull(),  // user | assistant | system | tool
    content:        text("content").notNull(),
    /**
     * For assistant messages: { intent, actions: [{ tool, args, jobId }], plan? }
     * For tool messages:      { tool, jobId, result }
     * For system messages:    { kind: 'job-completed' | 'job-failed' | ..., jobId, result }
     */
    payload:        jsonb("payload"),
    surface:        text("surface").notNull().default("web"),  // web | telegram
    createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byConversation: index("messages_conversation_idx").on(t.conversationId),
    byCreated:      index("messages_created_idx").on(t.createdAt),
  }),
);

/**
 * Cost-efficiency: result dedup cache. A finished agent result is keyed by a
 * deterministic hash of (agentKey, siteId, site-profile signature, payload).
 * A future enqueue with the same key replays the stored result instead of
 * running the worker again. TTL is per-agent (see services/result-cache.ts).
 */
export const resultCache = pgTable(
  "result_cache",
  {
    id:          serial("id").primaryKey(),
    dedupeKey:   text("dedupe_key").notNull(),
    agentKey:    text("agent_key").notNull(),
    siteId:      integer("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    result:      jsonb("result").$type<Record<string, unknown>>().notNull(),
    sourceRunId: integer("source_run_id"),
    sourceJobId: integer("source_job_id"),
    hitCount:    integer("hit_count").notNull().default(0),
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt:   timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    byKey:     uniqueIndex("result_cache_dedupe_key_unique_idx").on(t.dedupeKey),
    byAgent:   index("result_cache_agent_site_idx").on(t.agentKey, t.siteId),
    byExpires: index("result_cache_expires_idx").on(t.expiresAt),
  }),
);

/**
 * #2 Target Control Panel: an absolute, time-boxed objective per site
 * (baseline -> goal by a deadline). `metric` selects how the current value is
 * measured (a computed pipeline metric, or 'manual'); the trajectory engine
 * (services/target-progress.ts) turns it into the progress vector.
 */
export const targets = pgTable(
  "targets",
  {
    id:            serial("id").primaryKey(),
    siteId:        integer("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    title:         text("title").notNull(),
    metric:        text("metric").notNull(),
      // articles_published | articles_total | keywords_approved | runs_succeeded | manual
    direction:     text("direction").notNull().default("increase"), // increase | decrease
    baselineValue: real("baseline_value").notNull(),
    goalValue:     real("goal_value").notNull(),
    manualCurrent: real("manual_current"), // current value when metric='manual'
    startAt:       timestamp("start_at", { withTimezone: true }).notNull().defaultNow(),
    deadlineAt:    timestamp("deadline_at", { withTimezone: true }).notNull(),
    status:        text("status").notNull().default("active"),
      // active | hit | missed | paused | archived
    createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySite:   index("targets_site_idx").on(t.siteId),
    byStatus: index("targets_status_idx").on(t.status),
  }),
);

/**
 * target_snapshots — a time series of a target's measured value, so the control
 * panel can draw a real trajectory (slope, plateau, slip) from observed points
 * instead of a baseline→current straight line. Captured opportunistically when
 * targets are read (debounced).
 */
export const targetSnapshots = pgTable(
  "target_snapshots",
  {
    id:         serial("id").primaryKey(),
    targetId:   integer("target_id").notNull().references(() => targets.id, { onDelete: "cascade" }),
    value:      real("value").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTarget: index("target_snapshots_target_idx").on(t.targetId),
  }),
);

/**
 * checkpoints — the human-in-the-loop approval QUEUE (distinct from `approvals`,
 * which is the decided-audit log). A checkpoint is a pending proposed action an
 * agent wants a human to approve, carrying its blast radius (how many items it
 * touches) so the UI can apply graduated friction. Decided checkpoints also
 * write an `approvals` audit row.
 */
export const checkpoints = pgTable(
  "checkpoints",
  {
    id:          serial("id").primaryKey(),
    siteId:      integer("site_id").references(() => sites.id, { onDelete: "cascade" }),
    gate:        text("gate").notNull(),        // A | B | C | D | E
    title:       text("title").notNull(),
    summary:     text("summary"),
    payload:     jsonb("payload").$type<Record<string, unknown>>(),
    blastRadius: integer("blast_radius").notNull().default(0), // # items affected
    status:      text("status").notNull().default("pending"),
      // pending | approved | rejected | edited | deferred | escalated
    decision:    text("decision"),              // the verb chosen
    note:        text("note"),
    decidedBy:   text("decided_by"),
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt:   timestamp("decided_at", { withTimezone: true }),
  },
  (t) => ({
    byStatus: index("checkpoints_status_idx").on(t.status),
    bySite:   index("checkpoints_site_idx").on(t.siteId),
  }),
);

/**
 * decision_records — explainability provenance (the design's DecisionRecord).
 * Each row captures WHY an agent/Director made a choice: the rationale, a
 * confidence, the evidence considered, and the inputs — so "why this keyword?"
 * has an auditable answer.
 */
export const decisionRecords = pgTable(
  "decision_records",
  {
    id:         serial("id").primaryKey(),
    siteId:     integer("site_id").references(() => sites.id, { onDelete: "cascade" }),
    subjectKey: text("subject_key").notNull(),  // "agent.<key>" | "director"
    kind:       text("kind").notNull(),         // keyword | action | recommendation | plan
    title:      text("title").notNull(),
    rationale:  text("rationale"),
    confidence: real("confidence"),             // 0..1
    evidence:   jsonb("evidence").$type<Array<{ label: string; value?: string; source?: string }>>(),
    inputs:     jsonb("inputs").$type<Record<string, unknown>>(),
    runId:      integer("run_id"),
    createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byKind: index("decision_records_kind_idx").on(t.kind),
    bySite: index("decision_records_site_idx").on(t.siteId),
  }),
);

export type Site = typeof sites.$inferSelect;
export type SiteIntegration = typeof siteIntegrations.$inferSelect;
export type Cycle = typeof cycles.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Keyword = typeof keywords.$inferSelect;
export type KeywordExclusion = typeof keywordExclusions.$inferSelect;
export type Idea = typeof ideas.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AgentState = typeof agentState.$inferSelect;
export type KvSetting = typeof kvSettings.$inferSelect;
export type AuthConfig = typeof authConfig.$inferSelect;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
/**
 * critiques — Critic Agent (#12) verdicts. The Critic reviews a producing
 * agent's terminal output against the end goal and returns a binary verdict
 * (serves|fails) plus, on fail, one actionable recommendation. iteration caps
 * the review loop (ship-with-warning after MAX). strictness records the mode
 * the verdict was rendered under.
 */
export const critiques = pgTable(
  "critiques",
  {
    id:             serial("id").primaryKey(),
    siteId:         integer("site_id").references(() => sites.id, { onDelete: "cascade" }),
    agentKey:       text("agent_key").notNull(),    // the agent whose output was reviewed
    jobId:          integer("job_id"),
    runId:          integer("run_id"),
    endGoal:        text("end_goal"),
    verdict:        text("verdict").notNull(),       // serves | fails
    recommendation: text("recommendation"),          // single fix when verdict=fails
    iteration:      integer("iteration").notNull().default(1),
    strictness:     text("strictness").notNull().default("standard"), // loose|standard|pedantic
    createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byAgent: index("critiques_agent_idx").on(t.agentKey),
    bySite:  index("critiques_site_idx").on(t.siteId),
    byJob:   index("critiques_job_idx").on(t.jobId),
  }),
);

/**
 * tactics — Tactics Scraper Agent (#13) knowledge rows. Each row is a
 * marketing/SEO tactic distilled from a source (subreddit, HN, forum, blog, X,
 * or a NotebookLM-derived video summary). Other agents read these during
 * planning to ground recommendations in current community practice.
 */
export const tactics = pgTable(
  "tactics",
  {
    id:         serial("id").primaryKey(),
    siteId:     integer("site_id").references(() => sites.id, { onDelete: "cascade" }),
    sourceUrl:  text("source_url").notNull(),
    sourceType: text("source_type").notNull(),  // reddit|hn|forum|blog|x|other|notebooklm-derived
    title:      text("title").notNull(),
    body:       text("body").notNull(),
    tags:       jsonb("tags").$type<string[]>(),
    score:      real("score"),                  // source signal (upvotes, etc.) when available
    addedBy:    text("added_by"),               // agent | operator
    scrapedAt:  timestamp("scraped_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySource: index("tactics_source_idx").on(t.sourceType),
    bySite:   index("tactics_site_idx").on(t.siteId),
  }),
);

export type Message = typeof messages.$inferSelect;
export type ResultCache = typeof resultCache.$inferSelect;
export type Target = typeof targets.$inferSelect;
export type TargetSnapshot = typeof targetSnapshots.$inferSelect;
export type Checkpoint = typeof checkpoints.$inferSelect;
export type DecisionRecord = typeof decisionRecords.$inferSelect;
export type Critique = typeof critiques.$inferSelect;
export type Tactic = typeof tactics.$inferSelect;
