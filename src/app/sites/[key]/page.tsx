import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteByKey } from "@/lib/services/sites";
import { listIntegrations } from "@/lib/services/integrations";
import { getDb } from "@/lib/db/client";
import { cycles, articles, runs } from "@/lib/db/schema";
import { eq, count, desc } from "drizzle-orm";

export default async function SiteOverview({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const site = await getSiteByKey(key);
  if (!site) notFound();
  const db = getDb();
  const [integrations, cyclesCount, articlesCount, recentRuns] = await Promise.all([
    listIntegrations(site.id),
    db.select({ n: count() }).from(cycles).where(eq(cycles.siteId, site.id)),
    db.select({ n: count() }).from(articles).where(eq(articles.siteId, site.id)),
    db.select().from(runs).where(eq(runs.siteId, site.id)).orderBy(desc(runs.startedAt)).limit(10),
  ]);
  const nCycles = Number(cyclesCount[0]?.n ?? 0);
  const nArticles = Number(articlesCount[0]?.n ?? 0);

  return (
    <main className="p-6 max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl">{site.name}</h1>
        <p className="opacity-70 text-sm">{site.domain} · {site.locale} · {site.cmsPlatform}</p>
        <p className="text-sm mt-2">
          <Link href={`/sites/${site.key}/edit`} className="underline mr-3">Edit profile</Link>
          <Link href={`/sites/${site.key}/integrations`} className="underline">Integrations ({integrations.length})</Link>
        </p>
      </header>

      <section>
        <h2 className="text-lg mb-2">Profile</h2>
        <dl className="text-sm space-y-1">
          <Row k="Niche"      v={site.niche} />
          <Row k="Audience"   v={site.audience} />
          <Row k="Voice"      v={site.voiceGuide} />
          <Row k="Pillars"    v={site.contentPillars.join(", ") || "—"} />
          <Row k="Banned"     v={site.bannedPhrases.join(", ") || "—"} />
        </dl>
      </section>

      <section>
        <h2 className="text-lg mb-2">Counts</h2>
        <p className="text-sm">Cycles: {nCycles} · Articles: {nArticles}</p>
      </section>

      <section>
        <h2 className="text-lg mb-2">Recent runs</h2>
        {recentRuns.length === 0 ? <p className="text-sm opacity-60">None yet.</p> : (
          <ul className="text-sm space-y-1">
            {recentRuns.map((r) => (
              <li key={r.id}>#{r.id} · {r.category} · {r.action} · {r.status}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  return <div className="flex gap-3"><dt className="opacity-60 w-24">{k}</dt><dd>{v || "—"}</dd></div>;
}
