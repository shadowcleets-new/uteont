import { NextRequest, NextResponse } from "next/server";
import { updateIntegration, deleteIntegration, IntegrationNotFoundError } from "@/lib/services/integrations";
import { integrationUpdateSchema } from "@/lib/validation/site";

interface Ctx { params: Promise<{ id: string; intId: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { intId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = integrationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const row = await updateIntegration(Number(intId), parsed.data);
    return NextResponse.json(row);
  } catch (e) {
    if (e instanceof IntegrationNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { intId } = await params;
  await deleteIntegration(Number(intId));
  return new NextResponse(null, { status: 204 });
}
