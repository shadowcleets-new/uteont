import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { listDecisions, recordDecision } from "@/lib/services/decision-records";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const kind = new URL(req.url).searchParams.get("kind") ?? undefined;
  return NextResponse.json({ decisions: await listDecisions({ kind: kind || undefined }) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body.subjectKey || !body.kind || !body.title) {
    return NextResponse.json({ error: "subjectKey, kind and title are required" }, { status: 400 });
  }
  const row = await recordDecision(body);
  return NextResponse.json({ decision: row }, { status: row ? 201 : 500 });
}
