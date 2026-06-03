import { getDb } from "@/lib/db/client";
import { kvSettings, sites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { listTargetsWithProgress } from "@/lib/services/targets";
import { captureSnapshots, snapshotsByTarget } from "@/lib/services/target-snapshots";
import { getInterventionsForTarget, type Intervention } from "@/lib/services/run-interventions";
import { TargetCard } from "./target-card";
import { TargetCreateForm } from "./target-create-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Targets — UTEONT" };

async function getActiveSiteIdServer(): Promise<number | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(kvSettings)
    .where(eq(kvSettings.key, "ui.activeSiteId"))
    .limit(1);
  return row ? (row.value as { id: number | null }).id : null;
}

function Header({ siteName }: { siteName?: string }) {
  return (
    <>
      <h1 className="text-[28px] font-semibold text-[#141413] tracking-tight mb-2">Targets</h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-8">
        Set an absolute objective{siteName ? ` for ${siteName}` : ""} and track the agents&apos;
        progress vector against it — pace, projection, ETA, and whether you&apos;re on track.
      </p>
    </>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-[10px] border border-[#e8e6dc] bg-white p-8 text-center">
      <p className="text-[12px] text-[#9a988e] italic font-serif">{text}</p>
    </div>
  );
}

export default async function TargetsPage() {
  const activeSiteId = await getActiveSiteIdServer();

  if (!activeSiteId) {
    return (
      <div className="px-9 py-8 max-w-[1100px]">
        <Header />
        <EmptyCard text="Select a site (top-left) to set and track targets." />
      </div>
    );
  }

  const db = getDb();
  const [site] = await db.select().from(sites).where(eq(sites.id, activeSiteId)).limit(1);
  const items = await listTargetsWithProgress(activeSiteId);

  // Record today's observed values (debounced) so the trajectory accrues, then
  // read the per-target series back for the sparklines.
  await captureSnapshots(items.map((t) => ({ id: t.id, value: t.current })));
  const history = await snapshotsByTarget(items.map((t) => t.id)).catch(() => new Map());

  // Intervention markers: recent runs of each target's producing agent, on this
  // site, drawn as ticks on the trajectory so cause (agent ran) ↔ effect (curve
  // moved) is visible.
  const interventions = new Map<number, Intervention[]>();
  await Promise.all(
    items.map(async (t) => {
      interventions.set(t.id, await getInterventionsForTarget(activeSiteId, t.metric).catch(() => []));
    }),
  );

  return (
    <div className="px-9 py-8 max-w-[1100px]">
      <Header siteName={site?.name} />
      <TargetCreateForm siteId={activeSiteId} />
      {items.length === 0 ? (
        <EmptyCard text="No targets yet — set one above, then point the agents at it and watch the vector move." />
      ) : (
        <div>
          {items.map((t) => (
            <TargetCard key={t.id} t={t} history={history.get(t.id) ?? []} interventions={interventions.get(t.id) ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}
