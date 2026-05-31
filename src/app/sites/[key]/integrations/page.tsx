import { notFound } from "next/navigation";
import { getSiteByKey } from "@/lib/services/sites";
import { listIntegrations } from "@/lib/services/integrations";
import { IntegrationsClient } from "./integrations-client";

export default async function IntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { key } = await params;
  const sp = await searchParams;
  const connected = typeof sp.connected === "string" ? sp.connected : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const site = await getSiteByKey(key);
  if (!site) notFound();
  const integrations = await listIntegrations(site.id);
  return (
    <main className="p-6 max-w-3xl">
      <h1 className="text-2xl mb-1">{site.name} — integrations</h1>
      <p className="opacity-60 text-sm mb-4">Credentials are encrypted at rest. Plaintext never leaves the server response.</p>
      {connected && (
        <div className="mb-4 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
          Connected {connected.toUpperCase()} ✓ — run the Performance Tracking agent to pull data.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}
      <IntegrationsClient siteId={site.id} initial={integrations} />
    </main>
  );
}
