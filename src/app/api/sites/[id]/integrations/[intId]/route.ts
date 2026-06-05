import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  deleteIntegration,
  getIntegration,
  updateIntegration,
} from "@/lib/services/site-integrations";
import { integrationUpdateSchema } from "@/lib/validation/site";

interface Ctx {
  params: Promise<{ id: string; intId: string }>;
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
  const { intId } = await params;
  const n = parseId(intId);
  if (n === null) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  const row = await getIntegration(n);
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
  const { intId } = await params;
  const n = parseId(intId);
  if (n === null) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const parsed = integrationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const row = await updateIntegration(n, parsed.data);
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { intId } = await params;
  const n = parseId(intId);
  if (n === null) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  await deleteIntegration(n);
  return new NextResponse(null, { status: 204 });
}
