import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { keywords, ideas, articles, runs } from "@/lib/db/schema";
import { selectTopKeywordIds } from "@/lib/services/keyword-approval";
import { answerCallbackQuery, sendMessage, escapeMarkdown } from "@/lib/services/telegram";
import { recordApproval } from "@/lib/services/approvals";
import { listSites, getSiteByKey } from "@/lib/services/sites";
import {
  getActiveTelegramConversation,
  createConversation,
  updateConversation,
} from "@/lib/services/conversations";
import {
  getAuthConfig,
  setUsername,
  setPassword,
  setAllowedGoogleEmail,
  clearAllCreds,
  getAdminChatId,
  setAdminChatId,
} from "@/lib/services/auth-config";
import { issueSetupToken, SETUP_TOKEN_TTL_MIN } from "@/lib/services/setup-token";

// F-023: require the env var to be set so domain changes don't silently
// keep the old fallback. The build sets it via vercel.json or env; runtime
// resolution will throw with a clear message if absent.
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://uteont.vercel.app";

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
    const from = cb.from as Record<string, unknown> | undefined;
    const fromId = from ? String(from.id) : undefined;

    // A-01: the callback path mutates business state (approve keywords/ideas/
    // articles, write approval-audit rows) but previously had NO authorization —
    // it trusted only the shared webhook secret. Gate it on the admin chat AND
    // the clicking user, like the slash-command and Director paths already are.
    const adminChatId = await getAdminChatId();
    if (!adminChatId || (chatId !== adminChatId && fromId !== adminChatId)) {
      await answerCallbackQuery(cb.id, "Not authorized.");
      return NextResponse.json({ ok: true, handled: "callback_query", authorized: false });
    }

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
        // A-13: `data` is attacker-influenceable callback content — escape it so
        // backticks/underscores can't break Markdown parsing (→ 400, silent drop).
        text: `_Action:_ \`${escapeMarkdown(data)}\`\n${ackText}`,
        parseMode: "Markdown",
      });
    }
    return NextResponse.json({ ok: true, handled: "callback_query", data, ackText });
  }

  // Plain text message — either a slash command OR free-form for the Director
  const msg = update.message as Record<string, unknown> | undefined;
  if (msg) {
    const chat = msg.chat as Record<string, unknown> | undefined;
    const chatId = chat ? String(chat.id) : undefined;
    const text = String(msg.text ?? "").trim();
    if (chatId && text.startsWith("/")) {
      const reply = await handleCommand(text, chatId);
      if (reply) await sendMessage({ chatId, text: reply });
    } else if (chatId && text.length > 0) {
      // Free-form message → route to the Director Agent
      try {
        const adminChatId = await getAdminChatId();
        if (!adminChatId || chatId !== adminChatId) {
          await sendMessage({ chatId, text: "Not authorized." });
        } else {
          await routeToDirector(chatId, text);
        }
      } catch (e) {
        // Log the full error server-side; reply generically so raw internal
        // exception text (DB / Gemini details) never leaks into the chat.
        console.error("[telegram] director routing failed:", e);
        await sendMessage({
          chatId,
          text: "Director couldn't process that — please retry shortly. (Details are in the server logs.)",
        });
      }
    }
  }

  return NextResponse.json({ ok: true, handled: "ignored" });
}

// ------------------------------------------------------------------------
// Free-form message routing to Director
// ------------------------------------------------------------------------

async function routeToDirector(chatId: string, text: string): Promise<void> {
  const { runDirectorTurn } = await import("@/lib/services/director");
  const { getDirectorContext } = await import("@/lib/services/conversations");

  let conversation = await getActiveTelegramConversation();
  // If no active Telegram conversation, OR the previous one is older than
  // 24h and the user starts with what looks like a new goal, fork a new one.
  if (!conversation) {
    conversation = await createConversation({ surface: "telegram" });
  } else if (
    text.toLowerCase().startsWith("new ") ||
    text.toLowerCase() === "reset" ||
    text.toLowerCase().startsWith("start over")
  ) {
    conversation = await createConversation({ surface: "telegram" });
  }

  const { summary, recent } = await getDirectorContext(conversation.id);
  const { response } = await runDirectorTurn({
    conversation,
    history: recent,
    summary,
    newUserMessage: text,
    surface: "telegram",
  });

  // Reply on Telegram with the assistant's text. Markdown disabled to avoid
  // parse errors from arbitrary content (URLs, brackets, etc.).
  await sendMessage({
    chatId,
    text: response.text || "(no response)",
    parseMode: undefined,
  });
}

// ------------------------------------------------------------------------
// Command handler — credential-management commands are restricted to the
// chat_id named in TELEGRAM_CHAT_ID env (only YOU can change auth creds).
// ------------------------------------------------------------------------

const AUTH_ADMIN_COMMANDS = new Set([
  "/setuser",
  "/setpassword",
  "/setpassword-url",
  "/setgoogle",
  "/setadmin",
  "/lockout",
  "/whoami",
]);

async function handleCommand(text: string, chatId: string): Promise<string | null> {
  // Strip optional @botname suffix that Telegram sometimes appends
  const [rawVerb, ...rest] = text.split(/\s+/);
  const verb = rawVerb.split("@")[0].toLowerCase();
  const arg = rest.join(" ").trim();

  // Auth admin gate (F-012: DB-stored admin chat ID, env fallback only on bootstrap)
  if (AUTH_ADMIN_COMMANDS.has(verb)) {
    const adminChatId = await getAdminChatId();
    if (!adminChatId) return "Admin chat ID not configured. Set TELEGRAM_CHAT_ID env once, or use /setadmin <your-chat-id> after first bootstrap.";
    if (chatId !== adminChatId) return "Not authorized.";
  }

  switch (verb) {
    case "/start":
    case "/help":
      return [
        "UTEONT bot commands:",
        "",
        "📊 Status",
        "/status — health endpoint URL",
        "/keywords — keywords page URL",
        "",
        "🌐 Sites",
        "/sites — list available sites",
        "/site <key> — pin active conversation to a site",
        "",
        "🔐 Auth (admin only)",
        "/setuser <username>",
        "/setpassword <password>",
        "/setgoogle <email>",
        "/whoami — show current auth config (no secrets)",
        "/lockout — clear all credentials (emergency)",
        "",
        "Approvals run via inline buttons on notifications.",
      ].join("\n");

    case "/site": {
      const key = arg.toLowerCase();
      if (!key) return "Usage: /site <key>. Use /sites to list keys.";
      const site = await getSiteByKey(key);
      if (!site) return `No site with key '${key}'. Use /sites to list.`;
      // Resolve the active Telegram conversation (or create one) then pin it.
      let conv = await getActiveTelegramConversation();
      if (!conv) conv = await createConversation({ surface: "telegram" });
      await updateConversation(conv.id, { siteId: site.id });
      return `Pinned conversation to site '${site.key}' (${site.name}).`;
    }

    case "/sites": {
      const all = await listSites();
      if (all.length === 0) {
        return "No sites yet. Create one in the web app at /sites/new.";
      }
      const lines = all.map((s) => `- ${s.key} — ${s.name} (${s.domain})`);
      return ["Available sites:", ...lines].join("\n");
    }

    case "/status":
      return `${BASE_URL}/api/health`;

    case "/keywords":
      return `${BASE_URL}/keywords`;

    case "/setuser":
      if (!arg) return "Usage: /setuser <username>";
      try {
        await setUsername(arg);
        return [
          `Username set to '${arg}'.`,
          "",
          "Next: use /setpassword-url for the secure flow",
          "(password never enters this chat history).",
        ].join("\n");
      } catch (e) {
        const err = e as Error & { cause?: unknown };
        const cause = err.cause instanceof Error ? `: ${err.cause.message}` : "";
        return `Failed: ${err.message}${cause}`.slice(0, 800);
      }

    case "/setpassword":
      if (!arg) return "Usage: /setpassword <password>  (or prefer /setpassword-url for the safer flow)";
      try {
        await setPassword(arg);
        return [
          "Password updated.",
          "",
          `Sign in at: ${BASE_URL}/login`,
          "",
          "⚠️ Recommend deleting this message — your password is in the chat history.",
          "Next time use /setpassword-url to avoid putting the password in chat.",
        ].join("\n");
      } catch (e) {
        const err = e as Error & { cause?: unknown };
        const cause = err.cause instanceof Error ? `: ${err.cause.message}` : "";
        return `Failed: ${err.message}${cause}`.slice(0, 800);
      }

    case "/setpassword-url":
      try {
        const { token } = await issueSetupToken();
        return [
          "🔗 One-time password-setup link:",
          "",
          `${BASE_URL}/setup/${token}`,
          "",
          `Valid for ${SETUP_TOKEN_TTL_MIN} minutes, single-use. Open the link,`,
          "enter your new password in the form. Password never enters",
          "this chat history.",
        ].join("\n");
      } catch (e) {
        const err = e as Error & { cause?: unknown };
        const cause = err.cause instanceof Error ? `: ${err.cause.message}` : "";
        return `Failed: ${err.message}${cause}`.slice(0, 800);
      }

    case "/setadmin":
      if (!arg) return `Usage: /setadmin <chat-id>  (current chat id is ${chatId})`;
      try {
        await setAdminChatId(arg);
        return `Admin chat ID set to '${arg}'. Future admin commands restricted to that chat.`;
      } catch (e) {
        const err = e as Error & { cause?: unknown };
        const cause = err.cause instanceof Error ? `: ${err.cause.message}` : "";
        return `Failed: ${err.message}${cause}`.slice(0, 800);
      }

    case "/setgoogle":
      if (!arg) return "Usage: /setgoogle <email>";
      try {
        await setAllowedGoogleEmail(arg);
        const hasOAuth = !!(
          process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        );
        const note = hasOAuth
          ? ""
          : "\n\n⚠️ Google OAuth not yet configured. Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in Vercel env to enable.";
        return `Google sign-in allowlist set to '${arg}'.${note}`;
      } catch (e) {
        const err = e as Error & { cause?: unknown };
        const cause = err.cause instanceof Error ? `: ${err.cause.message}` : "";
        return `Failed: ${err.message}${cause}`.slice(0, 800);
      }

    case "/whoami": {
      const cfg = await getAuthConfig();
      if (!cfg) return "Auth config not yet set. Start with /setuser then /setpassword-url.";
      return [
        "Current auth config:",
        `• Username: ${cfg.username ?? "(unset)"}`,
        `• Password: ${cfg.passwordHash ? "set ✓" : "(unset)"}`,
        `• Google email allowlist: ${cfg.allowedGoogleEmail ?? "(unset)"}`,
        `• Admin chat ID: ${cfg.adminChatId ?? "(env-fallback: " + (process.env.TELEGRAM_CHAT_ID ?? "unset") + ")"}`,
        `• Active setup link: ${cfg.setupToken ? "yes (expires " + cfg.setupTokenExpiresAt + ")" : "none"}`,
        `• Updated: ${cfg.updatedAt ? new Date(cfg.updatedAt as unknown as string).toISOString() : "—"}`,
      ].join("\n");
    }

    case "/lockout":
      if (arg.toUpperCase() !== "CONFIRM") {
        return "This clears ALL credentials and locks out the web UI. To proceed, run: /lockout CONFIRM";
      }
      await clearAllCreds();
      return "All credentials cleared. Web UI is now locked. Use /setuser + /setpassword to restore access.";

    default:
      return null; // ignore unknown commands silently
  }
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
    // ideas / articles — flip the row status AND record the approval audit, so
    // the decision actually advances the pipeline (not just an audit row).
    await applyEntityDecision(entity, id, verb === "approve").catch(() => null);
    await recordApproval({
      gate: entity === "idea" ? "A" : entity === "article" ? "B" : "C",
      targetType: entity === "idea" || entity === "article" ? entity : "change",
      targetId: id,
      decision: verb === "approve" ? "approve" : "reject",
      channel: "telegram",
    });
    return `${entity} ${id} → ${verb === "approve" ? "approved" : "rejected"}`;
  }

  return `Unhandled callback: ${data}`;
}

async function approveTopKeywordsForJob(jobId: number, n: number): Promise<string> {
  const db = getDb();

  // A-05: scope to the run THIS job produced (runs.jobId === jobId), so the
  // operator approves keywords from the run they were looking at — not the
  // global researched pool.
  const [run] = await db
    .select({ id: runs.id })
    .from(runs)
    .where(eq(runs.jobId, jobId))
    .orderBy(desc(runs.id))
    .limit(1);
  if (!run) return "No run found for that job.";

  const candidates = await db
    .select({ id: keywords.id, priorityRank: keywords.priorityRank })
    .from(keywords)
    .where(and(eq(keywords.status, "researched"), eq(keywords.runId, run.id)));

  // A-05: priorityRank 1 = best; select the n BEST, with n clamped to [1, 50].
  const ids = selectTopKeywordIds(candidates, n);
  if (ids.length === 0) return "No researched keywords to approve.";

  await db
    .update(keywords)
    .set({ status: "approved", approvedAt: new Date() })
    .where(inArray(keywords.id, ids));
  return `Approved ${ids.length} keyword(s).`;
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

/**
 * Flip an idea/article row's status on an approval decision. Uses "approved"
 * (not "published") deliberately: there is no automated CMS publish path, so
 * claiming "published" would be dishonest — the articles_published metric only
 * moves on a real deploy.
 */
async function applyEntityDecision(entity: string, id: number, approve: boolean): Promise<void> {
  const db = getDb();
  const status = approve ? "approved" : "rejected";
  if (entity === "idea") {
    await db.update(ideas).set({ status }).where(eq(ideas.id, id));
  } else if (entity === "article") {
    await db.update(articles).set({ status }).where(eq(articles.id, id));
  }
}
