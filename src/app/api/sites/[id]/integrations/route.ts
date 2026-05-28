import { NextRequest, NextResponse } from "next/server";
import { listIntegrations, createIntegration } from "@/lib/services/integrations";
import { integrationCreateSchema } from "@/lib/validation/site";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const rows = await listIntegrations(Number(id));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = integrationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const row = await createIntegration(Number(id), parsed.data);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/CONNECTION_ENCRYPTION_KEY|64.*hex/i.test(msg)) {
      console.error("ENCRYPTION KEY MISSING — integration write rejected:", msg);
      return NextResponse.json({ error: "encryption_key_missing" }, { status: 500 });
    }
    throw e;
  }
}
