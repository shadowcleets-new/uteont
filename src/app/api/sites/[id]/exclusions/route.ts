import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  addExclusion,
  listExclusions,
  ExclusionAlreadyExistsError,
} from "@/lib/services/keyword-exclusions";

interface Ctx { params: Promise<{ id: string }> }

const PostSchema = z.object({
  phrase: z.string().min(1).max(255),
  reason: z.string().max(200).optional(),
  source: z.enum(["keyword", "idea", "article", "manual"]).default("manual"),
});

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const n = parseId(id);
  if (n === null) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const rows = await listExclusions(n).catch(() => []);
  return NextResponse.json({ exclusions: rows });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const n = parseId(id);
  if (n === null) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const row = await addExclusion({
      siteId: n,
      phrase: parsed.data.phrase,
      reason: parsed.data.reason,
      source: parsed.data.source,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    // A-12: surface the one expected, non-sensitive domain error; genericize
    // the rest and log server-side.
    if (e instanceof ExclusionAlreadyExistsError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    console.error("[api] add exclusion failed", e);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
