import { NextRequest, NextResponse } from "next/server";
import { getSiteById, updateSite, archiveSite, SiteNotFoundError } from "@/lib/services/sites";
import { siteUpdateSchema } from "@/lib/validation/site";

interface Ctx { params: Promise<{ id: string }> }

// N-20: reject a non-numeric id up front (Number("abc") = NaN would otherwise
// reach the serial-int column and surface a raw Postgres 500). Mirrors the
// guard the sibling dynamic routes (runs/cycles/keywords) already have.
function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const n = parseId(id);
  if (n === null) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  try {
    const row = await getSiteById(n);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(row);
  } catch (e) {
    console.error("GET /api/sites/[id] failed", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const n = parseId(id);
  if (n === null) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const body = await req.json().catch(() => null);
  const parsed = siteUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const row = await updateSite(n, parsed.data);
    return NextResponse.json(row);
  } catch (e) {
    if (e instanceof SiteNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const n = parseId(id);
  if (n === null) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  try {
    const row = await archiveSite(n);
    return NextResponse.json(row);
  } catch (e) {
    if (e instanceof SiteNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
}
