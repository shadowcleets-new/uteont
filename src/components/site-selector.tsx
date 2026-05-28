"use client";
import Link from "next/link";
import { useActiveSite } from "@/lib/hooks/use-active-site";

export function SiteSelector() {
  const { activeSiteId, setActiveSiteId, sites, loading } = useActiveSite();
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
      <label className="block text-[10px] uppercase tracking-wide opacity-60 mb-1">Site</label>
      <select
        className="w-full bg-transparent border border-black/10 rounded text-sm px-2 py-1"
        value={activeSiteId ?? ""}
        onChange={(e) => setActiveSiteId(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">All sites</option>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>{s.name} ({s.key})</option>
        ))}
      </select>
      <Link href="/sites/new" className="block text-[10px] mt-1 underline opacity-80">+ Add site</Link>
    </div>
  );
}
