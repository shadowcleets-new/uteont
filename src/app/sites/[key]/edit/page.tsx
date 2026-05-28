import { getSiteByKey } from "@/lib/services/sites";
import { notFound } from "next/navigation";
import { SiteEditForm } from "./site-edit-form";

export default async function SiteEditPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const site = await getSiteByKey(key);
  if (!site) notFound();
  return (
    <main className="p-6 max-w-3xl">
      <h1 className="text-2xl mb-1">Edit site</h1>
      <p className="opacity-60 mb-4">{site.name} · {site.domain}</p>
      <SiteEditForm site={site} />
    </main>
  );
}
