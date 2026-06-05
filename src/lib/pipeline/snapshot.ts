import { and, count, desc, eq, inArray, like } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  cycles,
  ideas,
  keywords,
  articles,
  runs,
} from "@/lib/db/schema";
import {
  derivePipelineState,
  type PipelineSnapshot,
  type PipelineState,
} from "./state";

const RESEARCH_SUBJECTS = ["agent.research"];
const IDEA_SUBJECTS = ["agent.idea-generation"];
const WRITING_SUBJECTS = ["agent.content-writing"];
const QA_SUBJECTS = ["agent.qa"];
const SEO_SUBJECTS = ["agent.seo-optimization"];

async function anyRunning(
  cycleId: number,
  subjects: string[],
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(runs)
    .where(
      and(
        eq(runs.cycleId, cycleId),
        eq(runs.status, "running"),
        inArray(runs.subjectKey, subjects),
      ),
    );
  return Number(row?.n ?? 0) > 0;
}

async function anyFailing(
  cycleId: number,
  subjects: string[],
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(runs)
    .where(
      and(
        eq(runs.cycleId, cycleId),
        eq(runs.status, "failure"),
        inArray(runs.subjectKey, subjects),
      ),
    );
  return Number(row?.n ?? 0) > 0;
}

/**
 * Builds the DB-backed snapshot that feeds `derivePipelineState`. Each
 * count is one round-trip — keeping them flat means a slow link fails
 * fast on a single bucket instead of cascading.
 */
export async function getPipelineSnapshot(
  cycleId: number,
): Promise<PipelineSnapshot> {
  const db = getDb();
  const [cycleRow] = await db
    .select()
    .from(cycles)
    .where(eq(cycles.id, cycleId))
    .limit(1);

  if (!cycleRow) {
    return {
      cycleCreated: false,
      keywords: { researched: 0, total: 0, failing: false },
      ideas: { proposed: 0, approved: 0, total: 0, failing: false },
      articles: {
        draft: 0,
        qaPassed: 0,
        approvedOrLater: 0,
        total: 0,
        failing: false,
      },
      running: {
        research: false,
        idea: false,
        writing: false,
        qa: false,
        seo: false,
      },
    };
  }

  const [
    kwAll,
    kwResearched,
    ideaAll,
    ideaProposed,
    ideaApproved,
    artAll,
    artDraft,
    artQaPassed,
    artApproved,
    artStaged,
    artPublished,
    runResearch,
    runIdea,
    runWriting,
    runQa,
    runSeo,
    failResearch,
    failIdea,
    failWriting,
    lastError,
  ] = await Promise.all([
    db.select({ n: count() }).from(keywords).where(eq(keywords.cycleId, cycleId)),
    db
      .select({ n: count() })
      .from(keywords)
      .where(
        and(
          eq(keywords.cycleId, cycleId),
          inArray(keywords.status, [
            "researched",
            "approved",
            "in-progress",
            "published",
          ]),
        ),
      ),
    db.select({ n: count() }).from(ideas).where(eq(ideas.cycleId, cycleId)),
    db
      .select({ n: count() })
      .from(ideas)
      .where(and(eq(ideas.cycleId, cycleId), eq(ideas.status, "proposed"))),
    db
      .select({ n: count() })
      .from(ideas)
      .where(and(eq(ideas.cycleId, cycleId), eq(ideas.status, "approved"))),
    db.select({ n: count() }).from(articles).where(eq(articles.cycleId, cycleId)),
    db
      .select({ n: count() })
      .from(articles)
      .where(and(eq(articles.cycleId, cycleId), eq(articles.status, "draft"))),
    db
      .select({ n: count() })
      .from(articles)
      .where(
        and(eq(articles.cycleId, cycleId), eq(articles.status, "qa-passed")),
      ),
    db
      .select({ n: count() })
      .from(articles)
      .where(
        and(eq(articles.cycleId, cycleId), eq(articles.status, "approved")),
      ),
    db
      .select({ n: count() })
      .from(articles)
      .where(and(eq(articles.cycleId, cycleId), eq(articles.status, "staged"))),
    db
      .select({ n: count() })
      .from(articles)
      .where(
        and(eq(articles.cycleId, cycleId), eq(articles.status, "published")),
      ),
    anyRunning(cycleId, RESEARCH_SUBJECTS),
    anyRunning(cycleId, IDEA_SUBJECTS),
    anyRunning(cycleId, WRITING_SUBJECTS),
    anyRunning(cycleId, QA_SUBJECTS),
    anyRunning(cycleId, SEO_SUBJECTS),
    anyFailing(cycleId, RESEARCH_SUBJECTS),
    anyFailing(cycleId, IDEA_SUBJECTS),
    anyFailing(cycleId, WRITING_SUBJECTS),
    db
      .select({ error: runs.error })
      .from(runs)
      .where(and(eq(runs.cycleId, cycleId), eq(runs.status, "failure")))
      .orderBy(desc(runs.id))
      .limit(1),
  ]);

  const articlesTotal = Number(artAll[0]?.n ?? 0);
  const approvedOrLater =
    Number(artApproved[0]?.n ?? 0) +
    Number(artStaged[0]?.n ?? 0) +
    Number(artPublished[0]?.n ?? 0);
  const articlesFailing = failWriting;

  return {
    cycleCreated: true,
    keywords: {
      researched: Number(kwResearched[0]?.n ?? 0),
      total: Number(kwAll[0]?.n ?? 0),
      failing: failResearch,
    },
    ideas: {
      proposed: Number(ideaProposed[0]?.n ?? 0),
      approved: Number(ideaApproved[0]?.n ?? 0),
      total: Number(ideaAll[0]?.n ?? 0),
      failing: failIdea,
    },
    articles: {
      draft: Number(artDraft[0]?.n ?? 0),
      qaPassed: Number(artQaPassed[0]?.n ?? 0),
      approvedOrLater,
      total: articlesTotal,
      failing: articlesFailing,
    },
    running: {
      research: runResearch,
      idea: runIdea,
      writing: runWriting,
      qa: runQa,
      seo: runSeo,
    },
    lastError: lastError[0]?.error ?? null,
  };
}

export async function getPipelineState(
  cycleId: number,
): Promise<PipelineState> {
  const snap = await getPipelineSnapshot(cycleId);
  return derivePipelineState(snap);
}

/**
 * Returns the most-recently-touched cycle's id, or null when no cycles
 * exist. Used by the pipeline status page when the URL doesn't carry an
 * explicit ?cycleId=.
 */
export async function getMostRecentCycleId(): Promise<number | null> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ id: cycles.id })
      .from(cycles)
      .orderBy(desc(cycles.id))
      .limit(1);
    return row?.id ?? null;
  } catch (e) {
    console.warn("[pipeline.getMostRecentCycleId] DB error:", e);
    return null;
  }
}

// `like` is imported to keep the module dep-symmetric for future
// subject-pattern queries; reference it so eslint doesn't warn on unused
// imports during the lint step.
void like;
