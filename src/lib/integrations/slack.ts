/**
 * Slack incoming-webhook notifier. The webhook URL is stored per-site in the
 * `slack` integration config (encrypted). Pure payload builder + a defensive
 * sender that refuses anything that isn't a Slack webhook URL.
 */

export function slackPayload(text: string): { text: string } {
  return { text };
}

export function isSlackWebhook(url: string): boolean {
  return /^https:\/\/hooks\.slack\.com\/services\//.test(url);
}

export async function sendSlackWebhook(webhookUrl: string, text: string): Promise<boolean> {
  if (!isSlackWebhook(webhookUrl)) return false;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackPayload(text)),
    });
    return res.ok;
  } catch {
    return false;
  }
}
