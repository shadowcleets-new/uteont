"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DeleteSiteButton } from "./delete-site-button";

export type SiteRow = {
  id: number;
  key: string;
  name: string;
  domain: string;
  cmsPlatform: string;
  status: string;
  integrationCount: number;
};

export function SitesTable({ sites }: { sites: SiteRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const headRef = useRef<HTMLInputElement>(null);

  const allSelected = sites.length > 0 && selected.size === sites.length;
  const someSelected = selected.size > 0 && !allSelected;

  // Reflect the partial-selection state on the header checkbox (can't be set via JSX).
  useEffect(() => {
    if (headRef.current) headRef.current.indeterminate = someSelected;
  }, [someSelected]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(sites.map((s) => s.id)));
  }
  function clear() {
    setSelected(new Set());
  }

  function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`Archive ${ids.length} site${ids.length > 1 ? "s" : ""}? They will be removed from the list.`)) return;
    start(async () => {
      const res = await fetch("/api/sites/bulk-archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        clear();
        router.refresh();
      } else {
        alert("Could not archive the selected sites. Try again.");
      }
    });
  }

  return (
    <>
      {selected.size > 0 && (
        <div className="flex items-center gap-4 mb-3 px-3 py-2 border rounded bg-black/[0.04] text-sm">
          <span className="opacity-70">{selected.size} selected</span>
          <button
            disabled={pending}
            onClick={deleteSelected}
            className="underline text-red-700/80 hover:text-red-700 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete selected"}
          </button>
          <button onClick={clear} className="underline opacity-60 hover:opacity-90">Clear</button>
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left opacity-60">
            <th className="py-2 w-6">
              <input
                ref={headRef}
                type="checkbox"
                aria-label="Select all sites"
                checked={allSelected}
                onChange={toggleAll}
              />
            </th>
            <th>Key</th><th>Name</th><th>Domain</th><th>Platform</th>
            <th>Integrations</th><th>Status</th><th />
          </tr>
        </thead>
        <tbody>
          {sites.map((s) => (
            <tr
              key={s.id}
              className={`border-t border-black/10 ${selected.has(s.id) ? "bg-black/[0.03]" : ""}`}
            >
              <td className="py-2">
                <input
                  type="checkbox"
                  aria-label={`Select ${s.name}`}
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                />
              </td>
              <td>{s.key}</td>
              <td>{s.name}</td>
              <td><a href={s.domain} target="_blank" rel="noreferrer" className="underline opacity-80">{s.domain}</a></td>
              <td>{s.cmsPlatform}</td>
              <td>{s.integrationCount}</td>
              <td>{s.status}</td>
              <td>
                <Link href={`/sites/${s.key}`} className="underline mr-3">Open</Link>
                <Link href={`/sites/${s.key}/edit`} className="underline mr-3">Edit</Link>
                <DeleteSiteButton id={s.id} name={s.name} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
