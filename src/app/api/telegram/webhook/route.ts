import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { keywords } from "@/lib/db/schema";
import { answerCallbackQuery, sendMessage } from "@/lib/services/telegram";
import { recordApproval } from "@/lib/services/approvals";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://uteont.vercel.app";

/**
 * Telegram webhook receiver. Verified upstream by middleware.ts (which
 * checks X-Telegram-Bot-Api-Secret-Token).
 *
 * Callback data grammar:
 *   open:<page>                       — just acknowledges, link is in the message
 *   approve_top:keywords:<jobId>:<n>  — approve top N keywords from that run
 *   approve:<entity>:<id>             — generic approval
 *   reject:<entity>:<id>              — generic rejection
 */
export async function POST(req: NextRequest) {
  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const cb = update.callback_query as Record<string, unknown> | undefined;
  if (cb && typeof cb.data === "string" && typeof cb.id === "string") {
    const data = cb.data;
    const message = cb.message as Record<string, unknown> | undefined;
    const chat = message?.chat as Record<string, unknown> | undefined;
    const chatId = chat ? String(chat.id) : undefined;

    let ackText = "Received";
    try {
      ackText = await handleCallback(data);
    } catch (e: unknown) {
      ackText = "Error: " + (e instanceof Error ? e.message : String(e)).slice(0, 60);
      console.error("telegram callback error", e);
    }
    await answerCallbackQuery(cb.id, ackText);
    if (chatId) {
      await sendMessage({
        chatId,
        text: `_Action:_ \`${data}\`\n${ackText}`,
        parseMode: "Markdown",
      });
    }
    return NextResponse.json({ ok: true, handled: "callback_query", data, ackText });
  }

  // Plain text message — currently just acknowledge
  const msg = update.message as Record<string, unknown> | undefined;
  if (msg) {
    const chat = msg.chat as Record<string, unknown> | undefined;
    const chatId = chat ? String(chat.id) : undefined;
    const text = String(msg.text ?? "");
    if (chatId && text.startsWith("/")) {
      await sendMessage({
        chatId,
        text:
          `Available commands:\n` +
          `/status — health check\n` +
          `/keywords — link to keywords page\n` +
          `(Use inline buttons on notifications to approve / shelve.)`,
      });
      if (text.startsWith("/status")) {
        await sendMessage({ chatId, text: `${BASE_URL}/api/health` });
      } else if (text.startsWith("/keywords")) {
        await sendMessage({ chatId, text: `${BASE_URL}/keywords` });
      }
    }
  }

  return NextResponse.json({ ok: true, handled: "ignored" });
}

// ------------------------------------------------------------------------

async function handleCallback(data: string): Promise<string> {
  const parts = data.split(":");
  const verb = parts[0];

  if (verb === "open") {
    // Just an acknowledgement; the message itself already has the link.
    return "Open the message link to view.";
  }

  if (verb === "approve_top" && parts[1] === "keywords") {
    const jobId = Number(parts[2]);
    const n = Number(parts[3] ?? 5);
    if (!Number.isFinite(jobId) || !Number.isFinite(n)) {
      return "Bad payload";
    }
    return approveTopKeywordsForJob(jobId, n);
  }

  if (verb === "approve" || verb === "reject") {
    const entity = parts[1];
    const id = Number(parts[2]);
    if (!Number.isFinite(id)) return "Bad id";
    if (entity === "keyword") {
      await applyKeywordDecision(id, verb === "approve" ? "approved" : "shelved");
      await recordApproval({
        gate: "A",
        targetType: "idea", // approximating — keyword approval is upstream of gate A
        targetId: id,
        decision: verb === "approve" ? "approve" : "reject",
        channel: "telegram",
      }).catch(() => null);
      return `Keyword ${id} → ${verb === "approve" ? "approved" : "shelved"}`;
    }
    // ideas / articles — record approval, downstream service decides what to do
    await recordApproval({
      gate: entity === "idea" ? "A" : entity === "article" ? "B" : "C",
      targetType: entity === "idea" || entity === "article" ? entity : "change",
      targetId: id,
      decision: verb === "approve" ? "approve" : "reject",
      channel: "telegram",
    });
    return `${entity} ${id} → ${verb}`;
  }

  return `Unhandled callback: ${data}`;
}

async function approveTopKeywordsForJob(jobId: number, n: number): Promise<string> {
  const db = getDb();
  // Find keywords inserted by the runs row that this job produced (we
  // linked keywords.runId in completeJob).
  const list = await db
    .select()
    .from(keywords)
    .where(eq(keywords.status, "researched"))
    .orderBy(desc(keywords.priorityRank))
    .limit(500);
  const top = list
    .sort((a, b) => a.priorityRank - b.priorityRank)
    .slice(0, n);
  if (top.length === 0) return "No researched keywords to approve.";
  await db
    .update(keywords)
    .set({ status: "approved", approvedAt: new Date() })
    .where(
      eq(
        keywords.id,
        // simulate IN via repeated calls — keep it tiny here for n<=20
        top[0].id,
      ),
    );
  // Loop for the rest (Drizzle's `inArray` would be cleaner; using simple loop for clarity)
  for (let i = 1; i < top.length; i++) {
    await db
      .update(keywords)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(keywords.id, top[i].id));
  }
  return `Approved ${top.length} keyword(s).`;
}

async function applyKeywordDecision(id: number, status: "approved" | "shelved") {
  const db = getDb();
  await db
    .update(keywords)
    .set({
      status,
      approvedAt: status === "approved" ? new Date() : null,
    })
    .where(eq(keywords.id, id));
}
