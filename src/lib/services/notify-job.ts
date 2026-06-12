/**
 * Per-agent Telegram notification builders + dispatchers.
 * Called by jobs.ts completeJob / failJob.
 *
 * No-op when TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID aren't configured —
 * services/telegram.ts.sendMessage already handles that gracefully.
 */

import { sendMessage, escapeMarkdown, type InlineButton } from "./telegram";
import { queueNotification, markFailed, markSent } from "./notifications";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://uteont.vercel.app";

interface BuiltMessage {
  text: string;
  buttons?: InlineButton[][];
}

export async function notifyJobSuccess(
  agentKey: string,
  jobId: number,
  result: Record<string, unknown>,
): Promise<void> {
  const built = buildSuccessMessage(agentKey, jobId, result);
  await dispatch("completion", `${agentKey} completed`, built, { agentKey, jobId });
}

export async function notifyJobFailure(
  agentKey: string,
  jobId: number,
  error: string,
): Promise<void> {
  const text =
    `❌ *${escapeMarkdown(agentKey)}* failed\n\n` +
    `Error: \`${escapeMarkdown(error.slice(0, 250))}\`\n\n` +
    `[View runs](${BASE_URL}/runs?subject=${encodeURIComponent("agent." + agentKey)})`;
  await dispatch(
    "error",
    `${agentKey} failed`,
    { text },
    { agentKey, jobId, error },
  );
}

async function dispatch(
  kind: "completion" | "error",
  subject: string,
  built: BuiltMessage,
  payload: Record<string, unknown>,
): Promise<void> {
  let notifId: number | null = null;
  try {
    const notif = await queueNotification({
      channel: "telegram",
      kind,
      subject,
      body: built.text,
      payload,
    });
    notifId = notif.id;
  } catch (e) {
    // DB unreachable — still try to send; just lose the audit row
    console.warn("notify: queue failed", e);
  }

  let ok = false;
  try {
    ok = await sendMessage({
      text: built.text,
      buttons: built.buttons,
      parseMode: "Markdown",
    });
  } catch (e) {
    console.error("notify: sendMessage threw", e);
  }

  if (notifId !== null) {
    try {
      if (ok) await markSent(notifId);
      else await markFailed(notifId, "sendMessage returned false");
    } catch (e) {
      console.warn("notify: mark status failed", e);
    }
  }
}

// --- per-agent message templates ----------------------------------------

function buildSuccessMessage(
  agentKey: string,
  jobId: number,
  result: Record<string, unknown>,
): BuiltMessage {
  switch (agentKey) {
    case "research": {
      const count = Number(result.keyword_count ?? 0);
      const topList = Array.isArray(result.top_keywords)
        ? (result.top_keywords as unknown[]).slice(0, 3).map(String)
        : [];
      const top = topList.length ? `\nTop: _${escapeMarkdown(topList.join(", "))}_` : "";
      return {
        text:
          `🔍 *Research completed* (job ${jobId})\n\n` +
          `${count} keywords found.${top}\n\n` +
          `[Review on dashboard](${BASE_URL}/keywords)`,
        buttons: [
          [
            { text: "Open keywords", callbackData: `open:keywords` },
            { text: "Approve top 5", callbackData: `approve_top:keywords:${jobId}:5` },
          ],
        ],
      };
    }
    case "idea-generation": {
      const ideas = Array.isArray(result.ideas) ? (result.ideas as unknown[]) : [];
      return {
        text:
          `💡 *Idea Generation completed* (job ${jobId})\n\n` +
          `${ideas.length} article ideas drafted.\n\n` +
          `[Review and approve](${BASE_URL}/runs?subject=${encodeURIComponent("agent.idea-generation")})`,
        buttons: [[{ text: "Open ideas", callbackData: `open:ideas` }]],
      };
    }
    case "content-writing": {
      const title = String(result.title ?? "(untitled)");
      const wc = Number(result.wordCount ?? 0);
      return {
        text:
          `✍️ *Article drafted* (job ${jobId})\n\n` +
          `Title: *${escapeMarkdown(title)}*\nWords: ${wc}\n\n` +
          `[Review draft](${BASE_URL}/runs?subject=${encodeURIComponent("agent.content-writing")})`,
        buttons: [[{ text: "Open drafts", callbackData: `open:articles` }]],
      };
    }
    case "backlink": {
      const site = String(result.target_site ?? "(unknown)");
      return {
        text:
          `📨 *Outreach draft ready* (job ${jobId})\n\n` +
          `For: ${escapeMarkdown(site)}\n\n` +
          `[Review outreach](${BASE_URL}/runs?subject=${encodeURIComponent("agent.backlink")})`,
        buttons: [[{ text: "Open outreach", callbackData: `open:outreach` }]],
      };
    }
    case "qa": {
      const score = Number(result.score ?? 0);
      const approved = Boolean(result.approved);
      const emoji = approved ? "✅" : "⚠️";
      return {
        text:
          `${emoji} *QA completed* (job ${jobId})\n\n` +
          `Score: ${score}/100 · approved: ${approved}\n\n` +
          `[View run](${BASE_URL}/runs?subject=${encodeURIComponent("agent.qa")})`,
      };
    }
    case "seo-optimization": {
      const score = Number(result.score ?? 0);
      const issues = Array.isArray(result.issues) ? (result.issues as unknown[]).length : 0;
      return {
        text:
          `🔧 *SEO Optimization completed* (job ${jobId})\n\n` +
          `Score: ${score}/100 · ${issues} issue(s)\n\n` +
          `[View run](${BASE_URL}/runs?subject=${encodeURIComponent("agent.seo-optimization")})`,
      };
    }
    default:
      return {
        text:
          `✅ *${escapeMarkdown(agentKey)}* completed (job ${jobId})\n\n` +
          `[View runs](${BASE_URL}/runs)`,
      };
  }
}
