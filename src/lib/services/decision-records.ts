/**
 * DecisionRecord persistence + a pure confidence formatter. Reads are defensive
 * (empty until the migration is applied), so the explainability page degrades to
 * empty rather than erroring while the table doesn't exist yet.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { decisionRecords, type DecisionRecord } from "@/lib/db/schema";

export interface EvidenceItem {
  label: string;
  value?: string;
  source?: string;
}

export interface RecordDecisionInput {
  siteId?: number | null;
  subjectKey: string;
  kind: string;
  title: string;
  rationale?: string;
  confidence?: number;
  evidence?: EvidenceItem[];
  inputs?: Record<string, unknown>;
  runId?: number | null;
}

export async function recordDecision(input: RecordDecisionInput): Promise<DecisionRecord | null> {
  try {
    const db = getDb();
    const [row] = await db
      .insert(decisionRecords)
      .values({
        siteId: input.siteId ?? null,
        subjectKey: input.subjectKey,
        kind: input.kind,
        title: input.title,
        rationale: input.rationale ?? null,
        confidence: input.confidence ?? null,
        evidence: input.evidence ?? null,
        inputs: input.inputs ?? null,
        runId: input.runId ?? null,
      })
      .returning();
    return row;
  } catch (e) {
    console.warn("recordDecision failed (table may not exist yet)", e);
    return null;
  }
}

export async function listDecisions(opts: { siteId?: number; kind?: string } = {}): Promise<DecisionRecord[]> {
  try {
    const db = getDb();
    const conds = [];
    if (opts.siteId) conds.push(eq(decisionRecords.siteId, opts.siteId));
    if (opts.kind) conds.push(eq(decisionRecords.kind, opts.kind));
    const where = conds.length ? and(...conds) : undefined;
    return await db.select().from(decisionRecords).where(where).orderBy(desc(decisionRecords.id)).limit(100);
  } catch (e) {
    console.warn("listDecisions failed (table may not exist yet)", e);
    return [];
  }
}

/** Pure: turn a 0..1 confidence into a clamped percent + a band label. */
export function confidenceLabel(c?: number | null): { label: string; pct: number } {
  if (c == null || !Number.isFinite(c)) return { label: "—", pct: 0 };
  const pct = Math.round(Math.max(0, Math.min(1, c)) * 100);
  const label = pct >= 75 ? "high" : pct >= 50 ? "moderate" : "low";
  return { label, pct };
}
