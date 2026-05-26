import { NextRequest, NextResponse } from "next/server";
import { CreateCycleRequest } from "@/lib/validation/schemas";
import { createCycle, listCycles } from "@/lib/services/cycles";

export async function GET() {
  try {
    const rows = await listCycles();
    return NextResponse.json({ cycles: rows });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
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
    const row = await createCycle(parsed.goal, parsed.seedTerms);
    return NextResponse.json({ cycle: row }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
