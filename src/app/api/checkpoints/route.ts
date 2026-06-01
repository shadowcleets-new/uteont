import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { listCheckpoints, createCheckpoint } from "@/lib/services/checkpoints";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const status = new URL(req.url).searchParams.get("status") ?? "pending";
  const rows = await listCheckpoints({ status: status || undefined });
  return NextResponse.json({ checkpoints: rows });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body.title || !body.gate) {
    return NextResponse.json({ error: "title and gate are required" }, { status: 400 });
  }
  const row = await createCheckpoint(body);
  return NextResponse.json({ checkpoint: row }, { status: row ? 201 : 500 });
}
