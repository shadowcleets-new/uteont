import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { approvals } from "@/lib/db/schema";

export interface RecordApprovalInput {
  gate: "A" | "B" | "C" | "D" | "E";
  targetType: "idea" | "article" | "change";
  targetId: number;
  decision: "approve" | "reject" | "edit";
  note?: string;
  channel?: "web" | "telegram";
}

export async function recordApproval(input: RecordApprovalInput) {
  const db = getDb();
  const [row] = await db
    .insert(approvals)
    .values({
      gate: input.gate,
      targetType: input.targetType,
      targetId: input.targetId,
      decision: input.decision,
      note: input.note,
      channel: input.channel ?? "web",
    })
    .returning();
  return row;
}

export async function listApprovals(limit = 100) {
  const db = getDb();
  return db.select().from(approvals).orderBy(desc(approvals.id)).limit(limit);
}
