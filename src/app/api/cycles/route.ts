import { NextRequest, NextResponse } from "next/server";
import { CreateCycleRequest } from "@/lib/validation/schemas";
import { createCycle, listCycles } from "@/lib/services/cycles";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const siteIdParam = searchParams.get("siteId");
  try {
    const rows = await listCycles({
      siteId: siteIdParam ? Number(siteIdParam) : undefined,
    });
    return NextResponse.json({ cycles: rows });
  } catch (e: unknown) {
    console.error("[api]", e);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = CreateCycleRequest.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid body", detail: String(e) }, { status: 400 });
  }
  try {
    const row = await createCycle(parsed.goal, parsed.seedTerms, parsed.siteId);
    return NextResponse.json({ cycle: row }, { status: 201 });
  } catch (e: unknown) {
    console.error("[api]", e);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
