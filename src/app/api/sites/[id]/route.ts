import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  archiveSite,
  deleteSiteCascading,
  getSiteById,
  updateSite,
  SiteHasActiveRunsError,
} from "@/lib/services/sites";
import { siteUpdateSchema } from "@/lib/validation/site";

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const n = parseId(id);
  if (n === null) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  const row = await getSiteById(n);
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const n = parseId(id);
  if (n === null) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const parsed = siteUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const row = await updateSite(n, parsed.data);
  return NextResponse.json(row);
}

/**
 * Hard delete with cascade. Caller must pass ?confirm=<domain> to unlock
 * — matches the two-step confirmation modal the UI surfaces and keeps a
 * curl-from-prod misfire from nuking a whole site without intent.
 *
 * Pass ?mode=archive instead to soft-archive.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const n = parseId(id);
  if (n === null) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }

  const site = await getSiteById(n);
  if (!site) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "delete";
  const confirm = url.searchParams.get("confirm");

  if (mode === "archive") {
    const row = await archiveSite(n);
    return NextResponse.json(row);
  }

  if (!confirm || confirm !== site.domain) {
    return NextResponse.json(
      {
        error: "confirm_required",
        message:
          "Pass ?confirm=<domain> to unlock the cascading delete, or ?mode=archive for a soft-archive.",
        expectedConfirm: site.domain,
      },
      { status: 400 },
    );
  }

  try {
    await deleteSiteCascading(n);
    return NextResponse.json({ ok: true, deleted: site.id });
  } catch (e) {
    if (e instanceof SiteHasActiveRunsError) {
      return NextResponse.json(
        {
          error: "active_runs",
          message:
            "Cannot delete a site with active agent runs. Please stop the agent execution first.",
          activeRunIds: e.runIds,
        },
        { status: 400 },
      );
    }
    throw e;
  }
}
