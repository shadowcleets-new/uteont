import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { archiveSites } from "@/lib/services/sites";

// Bulk-archive selected sites (the Sites list "Delete selected" action).
// Auth is enforced upstream in middleware.ts, like the other /api/sites routes.
const bulkArchiveSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = bulkArchiveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
  }
  const archived = await archiveSites(parsed.data.ids);
  return NextResponse.json({ archived });
}
