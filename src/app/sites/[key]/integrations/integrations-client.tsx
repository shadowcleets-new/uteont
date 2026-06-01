"use client";
import { useState, useTransition } from "react";

interface ItemShape {
  id: number;
  kind: string;
  label: string | null;
  status: string;
  lastVerifiedAt: string | null | Date;
}

// gsc / ga4 / slack get dedicated cards; the rest use the generic JSON form.
const CMS_KINDS = ["wordpress", "shopify", "webflow", "ghost", "vercel"] as const;

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

  const gscRow = items.find((i) => i.kind === "gsc");
  const slackRow = items.find((i) => i.kind === "slack");

  // Generic (CMS) add form
  const [kind, setKind] = useState<(typeof CMS_KINDS)[number]>("wordpress");
  const [label, setLabel] = useState("");
  const [configText, setConfigText] = useState('{\n  "baseUrl": "",\n  "username": "",\n  "applicationPassword": ""\n}');
  const [err, setErr] = useState<string | null>(null);

  // GA4 card
  const [ga4, setGa4] = useState(ga4PropertyId ?? "");
  const [ga4Msg, setGa4Msg] = useState<string | null>(null);

  // Slack card
  const [slackUrl, setSlackUrl] = useState("");
  const [slackMsg, setSlackMsg] = useState<string | null>(null);

  const remove = (id: number, confirmMsg = "Delete this integration?") => {
    if (!confirm(confirmMsg)) return;
    start(async () => {
      await fetch(`/api/sites/${siteId}/integrations/${id}`, { method: "DELETE" });
      setItems((l) => l.filter((i) => i.id !== id));
    });
  };

  const submitCms = () => {
    setErr(null);
    let config: object;
    try {
      config = JSON.parse(configText);
    } catch {
      setErr("Config must be valid JSON.");
      return;
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
            <a href={`/api/integrations/gsc/connect?siteId=${siteId}`} className="text-xs underline opacity-80 hover:opacity-100">Reconnect</a>
            <button onClick={() => remove(gscRow.id, "Disconnect Search Console?")} className="text-xs underline text-red-700/80 hover:text-red-700">Disconnect</button>
          </div>
        ) : (
          <a href={`/api/integrations/gsc/connect?siteId=${siteId}`} className="inline-block px-3 py-1.5 border rounded bg-white hover:bg-black/5">
            Connect Search Console
          </a>
        )}
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
          <span className="text-xs">
            {ga4.trim() ? (gscRow ? <span className="text-green-700">✓ ready (shares Search Console connection)</span> : <span className="opacity-70">set — connect Search Console to activate</span>) : <span className="opacity-50">not set</span>}
          </span>
          {ga4Msg && <span className="text-xs opacity-70">{ga4Msg}</span>}
        </div>
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
            <thead><tr className="text-left opacity-60 text-xs"><th className="py-1">Kind</th><th>Label</th><th>Status</th><th /></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-t border-black/10">
                  <td className="py-2">{i.kind}</td>
                  <td>{i.label ?? "—"}</td>
                  <td>{i.status}</td>
                  <td><button onClick={() => remove(i.id)} className="underline text-xs">Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Generic CMS / publishing integration */}
      <section className="border-t border-black/10 pt-4">
        <h2 className="text-base font-medium mb-2">Add a CMS / publishing integration</h2>
        <div className="space-y-2">
          <label className="block">
            <span className="block opacity-70 mb-1 text-xs">Kind</span>
            <select className="w-full border rounded px-2 py-1" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {CMS_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block opacity-70 mb-1 text-xs">Label (optional)</span>
            <input className="w-full border rounded px-2 py-1" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="block">
            <span className="block opacity-70 mb-1 text-xs">Config (JSON)</span>
            <textarea rows={6} className="w-full border rounded px-2 py-1 font-mono text-xs" value={configText} onChange={(e) => setConfigText(e.target.value)} />
          </label>
          {err && <div className="text-red-700 text-xs">{err}</div>}
          <button disabled={pending} onClick={submitCms} className="px-3 py-1 border rounded">Save</button>
        </div>
      </section>
    </div>
  );
}
