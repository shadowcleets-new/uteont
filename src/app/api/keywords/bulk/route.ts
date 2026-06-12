import { NextRequest, NextResponse } from "next/server";
import { BulkUpdateKeywordsRequest } from "@/lib/validation/schemas";
import { bulkUpdateKeywords } from "@/lib/services/keywords";

/** POST /api/keywords/bulk — { ids, status, shelvedReason? } → bulk approve/shelve/restore. */
export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = BulkUpdateKeywordsRequest.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid body", detail: String(e) }, { status: 400 });
  }
  try {
    const updated = await bulkUpdateKeywords(parsed.ids, {
      status: parsed.status,
      shelvedReason: parsed.shelvedReason ?? null,
    });
    return NextResponse.json({ ok: true, updated });
  } catch (e: unknown) {
    console.error("[api]", e);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
