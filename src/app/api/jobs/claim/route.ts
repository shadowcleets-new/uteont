import { NextRequest, NextResponse } from "next/server";
import { ClaimJobRequest } from "@/lib/validation/schemas";
import { claimNextJob } from "@/lib/services/jobs";

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = ClaimJobRequest.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid body", detail: String(e) }, { status: 400 });
  }
  try {
    const job = await claimNextJob(parsed.workerId, parsed.agentKeys);
    if (!job) return NextResponse.json({ job: null }, { status: 200 });
    return NextResponse.json({ job });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
