"use client";
import { useState, useTransition } from "react";
import { INTEGRATION_KINDS } from "@/lib/validation/site";

interface ItemShape {
  id: number; kind: string; label: string | null; status: string; lastVerifiedAt: string | null | Date;
}

export function IntegrationsClient({ siteId, initial }: { siteId: number; initial: ItemShape[] }) {
  const [items, setItems] = useState<ItemShape[]>(initial);
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<(typeof INTEGRATION_KINDS)[number]>("wordpress");
  const [label, setLabel] = useState("");
  const [configText, setConfigText] = useState('{\n  "baseUrl": "",\n  "username": "",\n  "applicationPassword": ""\n}');
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    setErr(null);
    let config: object;
    try { config = JSON.parse(configText); }
    catch { setErr("Config must be valid JSON."); return; }
    start(async () => {
      const res = await fetch(`/api/sites/${siteId}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, label: label || undefined, config }),
      });
      if (!res.ok) { setErr("Could not save."); return; }
      const created = await res.json();
      setItems([...items, created]);
      setLabel(""); setConfigText('{\n}');
    });
  };

  const remove = (id: number) => {
    if (!confirm("Delete this integration?")) return;
    start(async () => {
      await fetch(`/api/sites/${siteId}/integrations/${id}`, { method: "DELETE" });
      setItems(items.filter((i) => i.id !== id));
    });
  };

  const gscConnected = items.some((i) => i.kind === "gsc");

  return (
    <div className="space-y-6 text-sm">
      <section className="border border-black/10 rounded p-4 bg-[#faf7f0]">
        <h2 className="text-lg mb-1">Google Search Console</h2>
        <p className="opacity-70 mb-3 text-xs">
          One-click connect to pull real clicks, impressions, CTR and position into your targets
          (the <code>gsc_clicks</code> / <code>gsc_impressions</code> metrics). Requires Google OAuth
          configured on the server.
        </p>
        {gscConnected ? (
          <span className="inline-flex items-center gap-1.5 text-green-700">
            <span className="font-bold">✓</span> Connected
          </span>
        ) : (
          <a
            href={`/api/integrations/gsc/connect?siteId=${siteId}`}
            className="inline-block px-3 py-1.5 border rounded bg-white hover:bg-black/5"
          >
            Connect Search Console
          </a>
        )}
      </section>
      <section>
        <h2 className="text-lg mb-2">Existing</h2>
        {items.length === 0 ? <p className="opacity-60">None yet.</p> : (
          <table className="w-full">
            <thead><tr className="text-left opacity-60"><th>Kind</th><th>Label</th><th>Status</th><th /></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-t border-black/10">
                  <td className="py-2">{i.kind}</td>
                  <td>{i.label ?? "—"}</td>
                  <td>{i.status}</td>
                  <td><button onClick={() => remove(i.id)} className="underline">Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="border-t border-black/10 pt-4">
        <h2 className="text-lg mb-2">Add integration</h2>
        <div className="space-y-2">
          <label className="block">
            <span className="block opacity-70 mb-1">Kind</span>
            <select className="w-full border rounded px-2 py-1" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {INTEGRATION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block opacity-70 mb-1">Label (optional)</span>
            <input className="w-full border rounded px-2 py-1" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="block">
            <span className="block opacity-70 mb-1">Config (JSON)</span>
            <textarea rows={8} className="w-full border rounded px-2 py-1 font-mono text-xs" value={configText} onChange={(e) => setConfigText(e.target.value)} />
          </label>
          {err && <div className="text-red-700">{err}</div>}
          <button disabled={pending} onClick={submit} className="px-3 py-1 border rounded">Save</button>
        </div>
      </section>
    </div>
  );
}
