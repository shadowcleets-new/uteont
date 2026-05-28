"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CMS_PLATFORMS } from "@/lib/validation/site";

export default function NewSitePage() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    key: "", name: "", domain: "", locale: "en-US", cmsPlatform: "none" as typeof CMS_PLATFORMS[number],
  });
  return (
    <main className="p-6 max-w-xl">
      <h1 className="text-2xl mb-4">New site</h1>
      <form
        className="space-y-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await fetch("/api/sites", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...form, contentPillars: [], bannedPhrases: [], defaultCategories: [] }),
            });
            if (res.ok) {
              router.push(`/sites/${form.key}/edit`);
            } else {
              const j = await res.json().catch(() => ({}));
              setError(j.error === "key_taken" ? "That key is already in use." : "Could not create. Check the values and try again.");
            }
          });
        }}
      >
        <Field label="Key (URL-safe)" value={form.key} onChange={(v) => setForm({ ...form, key: v })} placeholder="tonyspizza" />
        <Field label="Name"   value={form.name}   onChange={(v) => setForm({ ...form, name: v })}   placeholder="Tony's Pizza" />
        <Field label="Domain" value={form.domain} onChange={(v) => setForm({ ...form, domain: v })} placeholder="https://tonyspizza.com" />
        <Field label="Locale" value={form.locale} onChange={(v) => setForm({ ...form, locale: v })} />
        <label className="block">
          <span className="block opacity-70 mb-1">CMS Platform</span>
          <select
            className="w-full border rounded px-2 py-1"
            value={form.cmsPlatform}
            onChange={(e) => setForm({ ...form, cmsPlatform: e.target.value as typeof form.cmsPlatform })}
          >
            {CMS_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        {error && <div className="text-red-700">{error}</div>}
        <button disabled={pending} className="px-3 py-1 border rounded">Create</button>
      </form>
    </main>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block opacity-70 mb-1">{label}</span>
      <input className="w-full border rounded px-2 py-1" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
