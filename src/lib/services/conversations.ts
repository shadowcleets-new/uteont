import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { conversations, messages } from "@/lib/db/schema";
import type { Conversation, Message } from "@/lib/db/schema";

export interface CreateConversationInput {
  title?: string | null;
  goal?: string | null;
  surface?: "web" | "telegram" | "both";
}

export async function createConversation(
  input: CreateConversationInput = {},
): Promise<Conversation> {
  const db = getDb();
  const [row] = await db
    .insert(conversations)
    .values({
      title: input.title ?? null,
      goal: input.goal ?? null,
      surface: input.surface ?? "web",
    })
    .returning();
  return row;
}

export async function getConversation(
  id: number,
): Promise<Conversation | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  return row ?? null;
}

export async function getActiveTelegramConversation(): Promise<Conversation | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.status, "active"), eq(conversations.surface, "telegram")))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  return row ?? null;
}

export async function listConversations(
  limit = 50,
): Promise<Conversation[]> {
  const db = getDb();
  return db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit);
}

export async function updateConversation(
  id: number,
  patch: Partial<
    Pick<Conversation, "title" | "goal" | "status" | "planApproved" | "surface">
  >,
): Promise<void> {
  const db = getDb();
  await db
    .update(conversations)
    .set({ ...patch, updatedAt: new Date(), lastMessageAt: new Date() })
    .where(eq(conversations.id, id));
}

export interface AppendMessageInput {
  conversationId: number;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  payload?: Record<string, unknown> | null;
  surface?: "web" | "telegram";
}

export async function appendMessage(
  input: AppendMessageInput,
): Promise<Message> {
  const db = getDb();
  const [row] = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      payload: (input.payload as never) ?? null,
      surface: input.surface ?? "web",
    })
    .returning();
  await db
    .update(conversations)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(conversations.id, input.conversationId));
  return row;
}

export async function getMessages(
  conversationId: number,
  limit = 50,
): Promise<Message[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse(); // oldest first
}
