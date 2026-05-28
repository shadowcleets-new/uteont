import { notFound } from "next/navigation";
import { getSiteByKey } from "@/lib/services/sites";
import { listIntegrations } from "@/lib/services/integrations";
import { IntegrationsClient } from "./integrations-client";

export default async function IntegrationsPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const site = await getSiteByKey(key);
  if (!site) notFound();
  const integrations = await listIntegrations(site.id);
  return (
    <main className="p-6 max-w-3xl">
      <h1 className="text-2xl mb-1">{site.name} — integrations</h1>
      <p className="opacity-60 text-sm mb-4">Credentials are encrypted at rest. Plaintext never leaves the server response.</p>
      <IntegrationsClient siteId={site.id} initial={integrations} />
    </main>
  );
}
