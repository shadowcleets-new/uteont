import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { articles, ideas, type Article, type Idea } from "@/lib/db/schema";

export type ApprovalKind = "idea" | "article";

export interface PendingApproval {
  kind: ApprovalKind;
  id: number;
  title: string;
  body: string;
  status: string;
  meta: {
    cycleId: number | null;
    siteId: number | null;
    keywordId?: number | null;
    slug?: string | null;
    qaScore?: number | null;
    seoScore?: number | null;
    intent?: string | null;
    createdAt: string | null;
    updatedAt?: string | null;
  };
}

function ideaToPending(row: Idea): PendingApproval {
  return {
    kind: "idea",
    id: row.id,
    title: row.angle,
    body: row.brief,
    status: row.status,
    meta: {
      cycleId: row.cycleId,
      siteId: row.siteId,
      keywordId: row.keywordId,
      intent: row.intent,
      createdAt: row.createdAt
        ? new Date(row.createdAt as unknown as string).toISOString()
        : null,
    },
  };
}

function articleToPending(row: Article): PendingApproval {
  return {
    kind: "article",
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status,
    meta: {
      cycleId: row.cycleId,
      siteId: row.siteId,
      slug: row.slug,
      qaScore: row.qaScore,
      seoScore: row.seoScore,
      createdAt: row.createdAt
        ? new Date(row.createdAt as unknown as string).toISOString()
        : null,
      updatedAt: row.updatedAt
        ? new Date(row.updatedAt as unknown as string).toISOString()
        : null,
    },
  };
}

/**
 * Articles in qa-passed + Ideas in proposed — both waiting on a human
 * gate decision. Articles surface first because they're closer to
 * publication and have a higher unblock value.
 */
export async function listPendingApprovals(): Promise<PendingApproval[]> {
  try {
    const db = getDb();
    const [arts, ids] = await Promise.all([
      db
        .select()
        .from(articles)
        .where(eq(articles.status, "qa-passed"))
        .orderBy(desc(articles.id))
        .limit(200),
      db
        .select()
        .from(ideas)
        .where(eq(ideas.status, "proposed"))
        .orderBy(desc(ideas.id))
        .limit(200),
    ]);
    return [...arts.map(articleToPending), ...ids.map(ideaToPending)];
  } catch (e) {
    console.warn("[approvals-queue.listPendingApprovals] DB error:", e);
    return [];
  }
}
