import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSiteById } from "@/lib/services/sites";
import {
  createIntegration,
  listIntegrations,
  IntegrationAlreadyExistsError,
} from "@/lib/services/site-integrations";
import { integrationCreateSchema } from "@/lib/validation/site";

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
  const rows = await listIntegrations(n);
  return NextResponse.json({ integrations: rows });
}

export async function POST(req: NextRequest, { params }: Ctx) {
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
    return NextResponse.json({ error: "site_not_found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const parsed = integrationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const row = await createIntegration(n, parsed.data);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof IntegrationAlreadyExistsError) {
      return NextResponse.json(
        {
          error: "already_exists",
          message:
            "This CMS or domain integration already exists. If you are experiencing credential issues, select 'Re-verify' to refresh authentication.",
          existingId: e.existing?.id,
        },
        { status: 409 },
      );
    }
    throw e;
  }
}
