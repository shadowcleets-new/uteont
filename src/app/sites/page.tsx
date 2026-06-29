import Link from "next/link";
import { SitesTable, type SiteRow } from "./sites-table";
import { listSites } from "@/lib/services/sites";
import { getDb } from "@/lib/db/client";
import { siteIntegrations } from "@/lib/db/schema";
import { count, inArray } from "drizzle-orm";

export default async function SitesPage() {
  const sites = await listSites();
  const ids = sites.map((s) => s.id);
  const db = getDb();
  const grouped = ids.length === 0 ? [] : await db.select({
    siteId: siteIntegrations.siteId,
    n: count(siteIntegrations.id),
  })
    .from(siteIntegrations)
    .where(inArray(siteIntegrations.siteId, ids))
    .groupBy(siteIntegrations.siteId);
  const countById = new Map(grouped.map((r) => [r.siteId, Number(r.n)]));

  // Flatten to plain rows (only the fields the table needs) for the client component.
  const rows: SiteRow[] = sites.map((s) => ({
    id: s.id,
    key: s.key,
    name: s.name,
    domain: s.domain,
    cmsPlatform: s.cmsPlatform,
    status: s.status,
    integrationCount: countById.get(s.id) ?? 0,
  }));

  return (
    <main className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl">Sites</h1>
        <Link href="/sites/new" className="px-3 py-1 border rounded text-sm">+ New site</Link>
      </div>
      {rows.length === 0 ? (
        <p className="opacity-70">No sites yet. <Link href="/sites/new" className="underline">Add one</Link>.</p>
      ) : (
        <SitesTable sites={rows} />
      )}
    </main>
  );
}
