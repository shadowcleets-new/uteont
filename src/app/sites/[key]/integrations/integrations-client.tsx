"use client";
import { useEffect, useState, useTransition } from "react";
import { relativeTime } from "@/lib/format/relative-time";

interface ItemShape {
  id: number;
  kind: string;
  label: string | null;
  status: string;
  lastVerifiedAt: string | null | Date;
}

// gsc / ga4 / slack get dedicated cards; the rest use the structured CMS form.
const CMS_KINDS = ["wordpress", "shopify", "webflow", "ghost", "vercel"] as const;
type CmsKind = (typeof CMS_KINDS)[number];

type CmsField = { name: string; label: string; type?: "text" | "url" | "password"; placeholder?: string; optional?: boolean };

// Per-kind structured fields — replaces the old "paste raw JSON" box so each
// publishing target asks for exactly the credentials its client needs.
const CMS_FIELDS: Record<CmsKind, CmsField[]> = {
  wordpress: [
    { name: "baseUrl", label: "Site URL", type: "url", placeholder: "https://blog.example.com" },
    { name: "username", label: "Username", placeholder: "editor" },
    { name: "applicationPassword", label: "Application password", type: "password", placeholder: "xxxx xxxx xxxx xxxx" },
  ],
  shopify: [
    { name: "storeDomain", label: "Store domain", placeholder: "my-store.myshopify.com" },
    { name: "accessToken", label: "Admin API access token", type: "password", placeholder: "shpat_…" },
  ],
  webflow: [
    { name: "siteId", label: "Webflow site ID", placeholder: "5f…e3" },
    { name: "apiToken", label: "API token", type: "password" },
  ],
  ghost: [
    { name: "adminApiUrl", label: "Admin API URL", type: "url", placeholder: "https://example.ghost.io" },
    { name: "adminApiKey", label: "Admin API key", type: "password", placeholder: "id:secret" },
  ],
  vercel: [
    { name: "projectId", label: "Project ID", placeholder: "prj_…" },
    { name: "token", label: "Vercel token", type: "password" },
    { name: "teamId", label: "Team ID", placeholder: "team_… (optional)", optional: true },
  ],
};

const slackValid = (u: string) => /^https:\/\/hooks\.slack\.com\/services\//.test(u.trim());

export function IntegrationsClient({
  siteId,
  initial,
  ga4PropertyId,
}: {
  siteId: number;
  initial: ItemShape[];
  ga4PropertyId: string | null;
}) {
  const [items, setItems] = useState<ItemShape[]>(initial);
  const [pending, start] = useTransition();

  // Captured once after mount so relative times don't cause SSR hydration drift.
  // Set from a timer callback (not synchronously in the effect body) to satisfy
  // react-hooks/set-state-in-effect while staying client-only.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(id);
  }, []);

  const gscRow = items.find((i) => i.kind === "gsc");
  const slackRow = items.find((i) => i.kind === "slack");

  // Structured CMS add form
  const [kind, setKind] = useState<CmsKind>("wordpress");
  const [cmsValues, setCmsValues] = useState<Record<string, string>>({});
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState('{\n  "baseUrl": ""\n}');
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // GA4 card
  const [ga4, setGa4] = useState(ga4PropertyId ?? "");
  const [ga4Msg, setGa4Msg] = useState<string | null>(null);

  // GSC card
  const [gscMsg, setGscMsg] = useState<string | null>(null);

  // Slack card
  const [slackUrl, setSlackUrl] = useState("");
  const [slackMsg, setSlackMsg] = useState<string | null>(null);

  const setKindReset = (k: CmsKind) => {
    setKind(k);
    setCmsValues({});
    setErr(null);
  };

  const remove = (id: number, confirmMsg = "Delete this integration?") => {
    if (!confirm(confirmMsg)) return;
    start(async () => {
      await fetch(`/api/sites/${siteId}/integrations/${id}`, { method: "DELETE" });
      setItems((l) => l.filter((i) => i.id !== id));
    });
  };

  const submitCms = () => {
    setErr(null);
    let config: Record<string, unknown>;
    if (rawMode) {
      try {
        config = JSON.parse(rawText);
      } catch {
        setErr("Config must be valid JSON.");
        return;
      }
    } else {
      const fields = CMS_FIELDS[kind];
      const missing = fields.filter((f) => !f.optional && !(cmsValues[f.name] ?? "").trim());
      if (missing.length) {
        setErr(`Fill in: ${missing.map((f) => f.label).join(", ")}.`);
        return;
      }
      config = {};
      for (const f of fields) {
        const v = (cmsValues[f.name] ?? "").trim();
        if (v) config[f.name] = v;
      }
    }
    start(async () => {
      const res = await fetch(`/api/sites/${siteId}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, label: label || undefined, config }),
      });
      if (!res.ok) {
        setErr("Could not save.");
        return;
      }
      const created = await res.json();
      setItems((l) => [...l, created]);
      setLabel("");
      setCmsValues({});
    });
  };

  const saveGa4 = () => {
    setGa4Msg(null);
    start(async () => {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ga4PropertyId: ga4.trim() }),
      });
      setGa4Msg(res.ok ? "Saved." : "Could not save — check the property id.");
    });
  };

  const testConn = (which: "gsc" | "ga4") => {
    const setMsg = which === "gsc" ? setGscMsg : setGa4Msg;
    setMsg("Testing…");
    start(async () => {
      const res = await fetch(`/api/integrations/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, kind: which }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; verifiedAt?: string | null };
      setMsg(j.message ?? "Test failed.");
      if (which === "gsc" && j.ok && j.verifiedAt) {
        setItems((l) =>
          l.map((i) => (i.kind === "gsc" ? { ...i, lastVerifiedAt: j.verifiedAt!, status: "connected" } : i)),
        );
      }
    });
  };

  const saveSlack = () => {
    setSlackMsg(null);
    if (!slackValid(slackUrl)) {
      setSlackMsg("Enter a valid https://hooks.slack.com/services/… webhook URL.");
      return;
    }
    start(async () => {
      const res = await fetch(`/api/sites/${siteId}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "slack", label: "Slack", config: { webhookUrl: slackUrl.trim() } }),
      });
      if (!res.ok) {
        setSlackMsg("Could not save.");
        return;
      }
      const created = await res.json();
      setItems((l) => [...l.filter((i) => i.kind !== "slack"), created]);
      setSlackMsg("Saved.");
    });
  };

  const testSlack = () => {
    setSlackMsg(null);
    if (!slackValid(slackUrl)) {
      setSlackMsg("Enter a valid Slack webhook URL first.");
      return;
    }
    start(async () => {
      const res = await fetch(`/api/integrations/slack/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: slackUrl.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      setSlackMsg(j.ok ? "✓ Test message sent to Slack." : "Test failed — check the webhook URL.");
    });
  };

  return (
    <div className="space-y-5 text-sm">
      {/* Google Search Console */}
      <section className="border border-black/10 rounded p-4 bg-[#faf7f0]">
        <h2 className="text-base font-medium mb-1">Google Search Console</h2>
        <p className="opacity-70 mb-3 text-xs">
          Pulls real clicks / impressions / CTR / position into the <code>gsc_clicks</code> /{" "}
          <code>gsc_impressions</code> target metrics.
        </p>
        {gscRow ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-green-700"><span className="font-bold">✓</span> Connected</span>
            <button disabled={pending} onClick={() => testConn("gsc")} className="px-2.5 py-1 border rounded bg-white hover:bg-black/5 text-xs">Test connection</button>
            <a href={`/api/integrations/gsc/connect?siteId=${siteId}`} className="text-xs underline opacity-80 hover:opacity-100">Reconnect</a>
            <button onClick={() => remove(gscRow.id, "Disconnect Search Console?")} className="text-xs underline text-red-700/80 hover:text-red-700">Disconnect</button>
          </div>
        ) : (
          <a href={`/api/integrations/gsc/connect?siteId=${siteId}`} className="inline-block px-3 py-1.5 border rounded bg-white hover:bg-black/5">
            Connect Search Console
          </a>
        )}
        {gscMsg && <div className="text-xs mt-2 opacity-80">{gscMsg}</div>}
      </section>

      {/* Google Analytics 4 */}
      <section className="border border-black/10 rounded p-4">
        <h2 className="text-base font-medium mb-1">Google Analytics 4</h2>
        <p className="opacity-70 mb-3 text-xs">
          Reuses the Search Console Google connection. Set your numeric GA4 property id to pull
          sessions / users / conversions into the <code>ga4_sessions</code> / <code>ga4_conversions</code> metrics.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={ga4}
            onChange={(e) => setGa4(e.target.value)}
            placeholder="GA4 property id (e.g. 539767853)"
            className="border rounded px-2 py-1 w-56"
          />
          <button disabled={pending} onClick={saveGa4} className="px-3 py-1 border rounded">Save</button>
          <button disabled={pending} onClick={() => testConn("ga4")} className="px-3 py-1 border rounded">Test connection</button>
          <span className="text-xs">
            {ga4.trim() ? (gscRow ? <span className="text-green-700">✓ ready (shares Search Console connection)</span> : <span className="opacity-70">set — connect Search Console to activate</span>) : <span className="opacity-50">not set</span>}
          </span>
        </div>
        {ga4Msg && <div className="text-xs mt-2 opacity-80">{ga4Msg}</div>}
      </section>

      {/* Slack */}
      <section className="border border-black/10 rounded p-4">
        <h2 className="text-base font-medium mb-1">Slack notifications</h2>
        <p className="opacity-70 mb-3 text-xs">
          Incoming-webhook channel for alerts. Create one at api.slack.com → your app → Incoming Webhooks.
        </p>
        {slackRow && !slackUrl && (
          <div className="flex items-center gap-3 mb-2">
            <span className="inline-flex items-center gap-1.5 text-green-700"><span className="font-bold">✓</span> Connected</span>
            <button onClick={() => remove(slackRow.id, "Remove Slack webhook?")} className="text-xs underline text-red-700/80 hover:text-red-700">Remove</button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={slackUrl}
            onChange={(e) => setSlackUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/T.../B.../..."
            className="border rounded px-2 py-1 w-96 max-w-full font-mono text-xs"
          />
          <button disabled={pending} onClick={saveSlack} className="px-3 py-1 border rounded">Save</button>
          <button disabled={pending} onClick={testSlack} className="px-3 py-1 border rounded">Send test</button>
        </div>
        {slackMsg && <div className="text-xs mt-1 opacity-80">{slackMsg}</div>}
      </section>

      {/* Existing integrations table */}
      <section>
        <h2 className="text-base font-medium mb-2">All integrations</h2>
        {items.length === 0 ? (
          <p className="opacity-60 text-xs">None yet.</p>
        ) : (
          <table className="w-full">
            <thead><tr className="text-left opacity-60 text-xs"><th className="py-1">Kind</th><th>Label</th><th>Status</th><th>Last verified</th><th /></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-t border-black/10">
                  <td className="py-2">{i.kind}</td>
                  <td>{i.label ?? "—"}</td>
                  <td>{i.status}</td>
                  <td className="opacity-70" title={i.lastVerifiedAt ? new Date(i.lastVerifiedAt).toISOString() : undefined}>
                    {i.lastVerifiedAt && now !== null ? relativeTime(i.lastVerifiedAt, now) : "—"}
                  </td>
                  <td><button onClick={() => remove(i.id)} className="underline text-xs">Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Structured CMS / publishing integration */}
      <section className="border-t border-black/10 pt-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-medium">Add a CMS / publishing integration</h2>
          <button
            type="button"
            onClick={() => setRawMode((v) => !v)}
            className="text-xs underline opacity-60 hover:opacity-100"
          >
            {rawMode ? "Use guided form" : "Paste raw JSON instead"}
          </button>
        </div>
        <div className="space-y-2">
          <label className="block">
            <span className="block opacity-70 mb-1 text-xs">Kind</span>
            <select className="w-full border rounded px-2 py-1" value={kind} onChange={(e) => setKindReset(e.target.value as CmsKind)}>
              {CMS_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block opacity-70 mb-1 text-xs">Label (optional)</span>
            <input className="w-full border rounded px-2 py-1" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>

          {rawMode ? (
            <label className="block">
              <span className="block opacity-70 mb-1 text-xs">Config (JSON)</span>
              <textarea rows={6} className="w-full border rounded px-2 py-1 font-mono text-xs" value={rawText} onChange={(e) => setRawText(e.target.value)} />
            </label>
          ) : (
            CMS_FIELDS[kind].map((f) => (
              <label key={f.name} className="block">
                <span className="block opacity-70 mb-1 text-xs">{f.label}{f.optional ? " (optional)" : ""}</span>
                <input
                  type={f.type === "password" ? "password" : "text"}
                  inputMode={f.type === "url" ? "url" : undefined}
                  placeholder={f.placeholder}
                  className="w-full border rounded px-2 py-1"
                  value={cmsValues[f.name] ?? ""}
                  onChange={(e) => setCmsValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              </label>
            ))
          )}
          {err && <div className="text-red-700 text-xs">{err}</div>}
          <button disabled={pending} onClick={submitCms} className="px-3 py-1 border rounded">Save</button>
        </div>
      </section>
    </div>
  );
}
