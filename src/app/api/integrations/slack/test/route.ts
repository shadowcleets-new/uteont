import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { sendSlackWebhook } from "@/lib/integrations/slack";

/** Send a one-off test message to a Slack incoming webhook (from the integrations UI). */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const webhookUrl = typeof body.webhookUrl === "string" ? body.webhookUrl : "";
  const ok = await sendSlackWebhook(webhookUrl, "✓ UTEONT test message — your Slack webhook is wired up.");
  return NextResponse.json({ ok });
}
