import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { listConversations } from "@/lib/services/conversations";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit") ?? 50)),
  );
  const conversations = await listConversations(limit).catch(() => []);
  return NextResponse.json({ conversations });
}
