import { NextRequest, NextResponse } from "next/server";
import { getSiteById, updateSite, archiveSite, SiteNotFoundError } from "@/lib/services/sites";
import { siteUpdateSchema } from "@/lib/validation/site";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const row = await getSiteById(Number(id));
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = siteUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const row = await updateSite(Number(id), parsed.data);
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
  try {
    const row = await archiveSite(Number(id));
    return NextResponse.json(row);
  } catch (e) {
    if (e instanceof SiteNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
}
