import Link from "next/link";
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

  return (
    <main className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl">Sites</h1>
        <Link href="/sites/new" className="px-3 py-1 border rounded text-sm">+ New site</Link>
      </div>
      {sites.length === 0 ? (
        <p className="opacity-70">No sites yet. <Link href="/sites/new" className="underline">Add one</Link>.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left opacity-60">
              <th className="py-2">Key</th><th>Name</th><th>Domain</th><th>Platform</th>
              <th>Integrations</th><th>Status</th><th />
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id} className="border-t border-black/10">
                <td className="py-2">{s.key}</td>
                <td>{s.name}</td>
                <td><a href={s.domain} target="_blank" rel="noreferrer" className="underline opacity-80">{s.domain}</a></td>
                <td>{s.cmsPlatform}</td>
                <td>{countById.get(s.id) ?? 0}</td>
                <td>{s.status}</td>
                <td>
                  <Link href={`/sites/${s.key}`} className="underline mr-3">Open</Link>
                  <Link href={`/sites/${s.key}/edit`} className="underline">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
