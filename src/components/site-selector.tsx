"use client";
import Link from "next/link";
import { useActiveSite } from "@/lib/hooks/use-active-site";

export function SiteSelector() {
  const { activeSiteId, setActiveSiteId, sites, loading } = useActiveSite();
  const activeKey = sites.find((s) => s.id === activeSiteId)?.key;
  if (loading) return <div className="text-xs opacity-60 px-3 py-2">Loading sites…</div>;
  if (sites.length === 0) {
    return (
      <Link href="/sites/new" className="block text-xs px-3 py-2 underline">
        + Add your first site
      </Link>
    );
  }
  return (
    <div className="px-3 py-2 border-b border-black/10">
      <label htmlFor="site-selector" className="block text-[10px] uppercase tracking-wide opacity-60 mb-1">Site</label>
      <select
        id="site-selector"
        className="w-full bg-transparent border border-black/10 rounded text-sm px-2 py-1"
        value={activeSiteId ?? ""}
        onChange={(e) => setActiveSiteId(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">Select a site…</option>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>{s.name} ({s.key})</option>
        ))}
      </select>
      {activeKey && (
        <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px]">
          <Link href={`/sites/${activeKey}`} className="underline opacity-80 hover:opacity-100">Overview</Link>
          <Link href={`/sites/${activeKey}/edit`} className="underline opacity-80 hover:opacity-100">Edit</Link>
          <Link href={`/sites/${activeKey}/integrations`} className="underline opacity-80 hover:opacity-100 font-medium text-[#d97757]">
            Integrations
          </Link>
        </div>
      )}
      <div className="mt-1 flex gap-2.5 text-[10px]">
        <Link href="/sites" className="underline opacity-80 hover:opacity-100">All sites</Link>
        <Link href="/sites/new" className="underline opacity-80 hover:opacity-100">+ Add site</Link>
      </div>
    </div>
  );
}
