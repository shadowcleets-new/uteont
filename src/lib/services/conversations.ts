import { and, asc, desc, eq, gt, ilike, inArray, ne, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { conversations, messages, sites } from "@/lib/db/schema";
import type { Conversation, Message, Site } from "@/lib/db/schema";

export interface CreateConversationInput {
  title?: string | null;
  goal?: string | null;
  surface?: "web" | "telegram" | "both";
  siteId?: number | null;
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
      siteId: input.siteId ?? null,
    })
    .returning();
  return row;
}

export async function getConversationWithSite(
  conversationId: number,
): Promise<{ conversation: Conversation; site: Site | null }> {
  const db = getDb();
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conv) throw new Error(`Conversation ${conversationId} not found`);
  if (!conv.siteId) return { conversation: conv, site: null };
  const [site] = await db
    .select()
    .from(sites)
    .where(eq(sites.id, conv.siteId))
    .limit(1);
  return { conversation: conv, site: site ?? null };
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
  opts: { offset?: number; includeArchived?: boolean } = {},
): Promise<Conversation[]> {
  const db = getDb();
  return db
    .select()
    .from(conversations)
    .where(opts.includeArchived ? undefined : ne(conversations.status, "archived"))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit)
    .offset(opts.offset ?? 0);
}

export async function updateConversation(
  id: number,
  patch: Partial<
    Pick<Conversation, "title" | "goal" | "status" | "planApproved" | "surface" | "siteId">
  >,
): Promise<void> {
  const db = getDb();
  // Note: lastMessageAt is intentionally NOT touched here — it tracks message
  // activity (set by appendMessage), so rename/archive must not re-sort the rail.
  await db
    .update(conversations)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(conversations.id, id));
}

/** Permanently delete a conversation and all of its messages. */
export async function deleteConversation(id: number): Promise<void> {
  const db = getDb();
  await db.delete(messages).where(eq(messages.conversationId, id)); // children first (FK)
  await db.delete(conversations).where(eq(conversations.id, id));
}

/**
 * Full-history search: conversations whose title OR any message content matches
 * `query` (case-insensitive substring), newest first. Excludes archived.
 */
export async function searchConversations(query: string, limit = 30): Promise<Conversation[]> {
  const q = query.trim();
  if (!q) return [];
  const db = getDb();
  // Escape LIKE wildcards so a literal % or _ in the query isn't treated as one.
  const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

  // Conversation ids that have a matching message.
  let msgConvIds: number[] = [];
  try {
    const rows = await db
      .selectDistinct({ cid: messages.conversationId })
      .from(messages)
      .where(ilike(messages.content, pattern))
      .limit(300);
    msgConvIds = rows.map((r) => r.cid);
  } catch {
    msgConvIds = [];
  }

  const matchTitleOrMessage = msgConvIds.length
    ? or(ilike(conversations.title, pattern), inArray(conversations.id, msgConvIds))
    : ilike(conversations.title, pattern);

  return db
    .select()
    .from(conversations)
    .where(and(ne(conversations.status, "archived"), matchTitleOrMessage))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit);
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

export interface DirectorContext {
  /** Running summary of messages already folded out of the window, or null. */
  summary: string | null;
  /** Messages newer than the summary pointer (oldest-first), sent verbatim. */
  recent: Message[];
}

/**
 * Context for one Director turn: the rolling summary + only the messages not yet
 * folded into it (id > summaryUpToId). This is what keeps per-turn token cost
 * flat regardless of how long the conversation is — replaces sending up to 60
 * raw rows every turn.
 */
export async function getDirectorContext(conversationId: number): Promise<DirectorContext> {
  const db = getDb();
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  const summaryUpToId = conv?.summaryUpToId ?? 0;
  const recent = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), gt(messages.id, summaryUpToId)))
    .orderBy(asc(messages.id))
    .limit(40);
  return { summary: conv?.summary ?? null, recent };
}

/** Persist a freshly compacted summary + advance the window pointer. */
export async function setConversationSummary(
  conversationId: number,
  summary: string,
  summaryUpToId: number,
): Promise<void> {
  const db = getDb();
  await db
    .update(conversations)
    .set({ summary, summaryUpToId, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}
