/**
 * Best-effort Slack notifications for a site. Reads the site's slack integration
 * (decrypting the webhook URL), and posts. No-ops silently if there's no slack
 * integration or the encryption key is absent — never throws on the caller.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { siteIntegrations } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto/integration-secrets";
import { sendSlackWebhook } from "@/lib/integrations/slack";

export async function notifySlackForSite(siteId: number, text: string): Promise<boolean> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(siteIntegrations)
      .where(and(eq(siteIntegrations.siteId, siteId), eq(siteIntegrations.kind, "slack")))
      .limit(1);
    if (!row) return false;
    const plain = decrypt(row.config, row.configIv, row.configTag) as { webhookUrl?: string };
    if (!plain.webhookUrl) return false;
    return await sendSlackWebhook(plain.webhookUrl, text);
  } catch (e) {
    console.warn("notifySlackForSite failed", e);
    return false;
  }
}
