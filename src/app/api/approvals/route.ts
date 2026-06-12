import { NextRequest, NextResponse } from "next/server";
import { CreateApprovalRequest } from "@/lib/validation/schemas";
import { listApprovals, recordApproval } from "@/lib/services/approvals";

export async function GET() {
  try {
    const rows = await listApprovals();
    return NextResponse.json({ approvals: rows });
  } catch (e: unknown) {
    console.error("[api]", e);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = CreateApprovalRequest.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid body", detail: String(e) }, { status: 400 });
  }
  try {
    const row = await recordApproval(parsed);
    return NextResponse.json({ approval: row }, { status: 201 });
  } catch (e: unknown) {
    console.error("[api]", e);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
