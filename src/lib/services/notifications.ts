import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";

export interface QueueNotificationInput {
  channel: "telegram" | "email";
  kind: "approval-request" | "completion" | "error" | "digest";
  subject?: string;
  body: string;
  payload?: Record<string, unknown>;
}

export async function queueNotification(input: QueueNotificationInput) {
  const db = getDb();
  const [row] = await db.insert(notifications).values({
    channel: input.channel,
    kind: input.kind,
    subject: input.subject,
    body: input.body,
    payload: input.payload,
    status: "pending",
  }).returning();
  return row;
}

export async function markSent(id: number) {
  const db = getDb();
  await db.update(notifications)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(notifications.id, id));
}

export async function markFailed(id: number, error: string) {
  const db = getDb();
  await db.update(notifications)
    .set({ status: "failed", error })
    .where(eq(notifications.id, id));
}

export async function listPendingNotifications(limit = 50) {
  const db = getDb();
  return db.select()
    .from(notifications)
    .where(eq(notifications.status, "pending"))
    .orderBy(desc(notifications.id))
    .limit(limit);
}
