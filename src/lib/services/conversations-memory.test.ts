import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { conversations, messages } from "@/lib/db/schema";
import {
  createConversation,
  appendMessage,
  getDirectorContext,
  setConversationSummary,
} from "./conversations";

let convId: number | null = null;

afterEach(async () => {
  if (convId != null) {
    const db = getDb();
    try {
      await db.delete(messages).where(eq(messages.conversationId, convId));
      await db.delete(conversations).where(eq(conversations.id, convId));
    } catch {
      /* ignore cleanup errors */
    }
    convId = null;
  }
});

describe("director context (live DB)", () => {
  it("returns the whole thread with no summary, then windows after a summary is set", { timeout: 15000 }, async () => {
    const conv = await createConversation({ title: "__test_mem" });
    convId = conv.id;
    await appendMessage({ conversationId: conv.id, role: "user", content: "one" });
    const m2 = await appendMessage({ conversationId: conv.id, role: "assistant", content: "two" });
    await appendMessage({ conversationId: conv.id, role: "user", content: "three" });

    const c0 = await getDirectorContext(conv.id);
    expect(c0.summary).toBeNull();
    expect(c0.recent.map((m) => m.content)).toEqual(["one", "two", "three"]);

    // Fold everything up to m2 into a summary; only later messages stay verbatim.
    await setConversationSummary(conv.id, "recap so far", m2.id);
    const c1 = await getDirectorContext(conv.id);
    expect(c1.summary).toBe("recap so far");
    expect(c1.recent.map((m) => m.content)).toEqual(["three"]);
  });
});
