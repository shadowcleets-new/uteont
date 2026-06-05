import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createSite,
  listSites,
  getSiteIntegrationCounts,
  SiteKeyTakenError,
} from "@/lib/services/sites";
import { siteCreateSchema } from "@/lib/validation/site";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows = await listSites();
  const counts = await getSiteIntegrationCounts(rows.map((s) => s.id));
  return NextResponse.json({
    sites: rows.map((s) => ({
      ...s,
      integrationCount: counts.get(s.id) ?? 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = siteCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const row = await createSite(parsed.data);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof SiteKeyTakenError) {
      return NextResponse.json(
        { error: "key_taken", message: e.message },
        { status: 409 },
      );
    }
    throw e;
  }
}
