"use client";
import { useState, useTransition } from "react";
import type { Site } from "@/lib/db/schema";

type Tab = "identity" | "voice" | "content" | "analytics";

export function SiteEditForm({ site }: { site: Site }) {
  const [tab, setTab] = useState<Tab>("identity");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [form, setForm] = useState({
    name: site.name,
    locale: site.locale,
    niche: site.niche ?? "",
    audience: site.audience ?? "",
    voiceGuide: site.voiceGuide ?? "",
    contentPillars: [...site.contentPillars],
    bannedPhrases: [...site.bannedPhrases],
    defaultCategories: [...site.defaultCategories],
    sitemapUrl: site.sitemapUrl ?? "",
    gscPropertyId: site.gscPropertyId ?? "",
    ga4PropertyId: site.ga4PropertyId ?? "",
  });

  const save = () => {
    setError(null); setOk(false);
    start(async () => {
      const res = await fetch(`/api/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) setOk(true);
      else setError("Could not save. Check the fields and try again.");
    });
  };

  return (
    <div className="space-y-4 text-sm">
      <nav className="flex gap-3 border-b border-black/10 pb-2">
        {(["identity","voice","content","analytics"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-1 ${tab === t ? "border-b-2 border-black" : "opacity-60"}`}
          >
            {t}
          </button>
        ))}
      </nav>
      {tab === "identity" && (
        <>
          <Text label="Name"   value={form.name}   onChange={(v) => setForm({ ...form, name: v })} />
          <Text label="Locale" value={form.locale} onChange={(v) => setForm({ ...form, locale: v })} />
          <p className="opacity-60 text-xs">Key, domain, and CMS platform are immutable after creation.</p>
        </>
      )}
      {tab === "voice" && (
        <>
          <Text label="Niche (one line)"      value={form.niche}      onChange={(v) => setForm({ ...form, niche: v })} />
          <Text label="Audience (one line)"   value={form.audience}   onChange={(v) => setForm({ ...form, audience: v })} />
          <TextArea label="Voice guide (paragraph)" value={form.voiceGuide} onChange={(v) => setForm({ ...form, voiceGuide: v })} />
          <ListField label="Content pillars" values={form.contentPillars} onChange={(v) => setForm({ ...form, contentPillars: v })} />
          <ListField label="Banned phrases"  values={form.bannedPhrases}  onChange={(v) => setForm({ ...form, bannedPhrases: v })} />
        </>
      )}
      {tab === "content" && (
        <>
          <ListField label="Default categories / tags" values={form.defaultCategories} onChange={(v) => setForm({ ...form, defaultCategories: v })} />
          <Text label="Sitemap URL" value={form.sitemapUrl} onChange={(v) => setForm({ ...form, sitemapUrl: v })} />
        </>
      )}
      {tab === "analytics" && (
        <>
          <Text label="Google Search Console property ID" value={form.gscPropertyId} onChange={(v) => setForm({ ...form, gscPropertyId: v })} />
          <Text label="GA4 property ID"                   value={form.ga4PropertyId} onChange={(v) => setForm({ ...form, ga4PropertyId: v })} />
        </>
      )}
      <div className="pt-4 flex items-center gap-3">
        <button disabled={pending} onClick={save} className="px-3 py-1 border rounded">Save</button>
        {ok && <span className="text-green-700">Saved.</span>}
        {error && <span className="text-red-700">{error}</span>}
      </div>
    </div>
  );
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block opacity-70 mb-1">{label}</span>
      <input className="w-full border rounded px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block opacity-70 mb-1">{label}</span>
      <textarea rows={4} className="w-full border rounded px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function ListField({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  return (
    <label className="block">
      <span className="block opacity-70 mb-1">{label} <span className="opacity-50">(comma-separated)</span></span>
      <input
        className="w-full border rounded px-2 py-1"
        value={values.join(", ")}
        onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
      />
    </label>
  );
}
