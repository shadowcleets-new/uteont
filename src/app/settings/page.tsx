import Link from "next/link";

export default function SettingsPage() {
  return (
    <main className="p-6 max-w-5xl">
      <h1 className="text-2xl mb-4">Settings</h1>
      <nav className="flex gap-4 border-b border-black/10 mb-6">
        <TabLink href="/settings?tab=general" label="General" />
        <TabLink href="/sites" label="Sites" />
        <TabLink href="/settings?tab=auth" label="Auth" />
      </nav>
      <div className="opacity-70 text-sm">
        Choose a tab. Site profiles + integrations live under <Link href="/sites" className="underline">Sites</Link>.
      </div>
    </main>
  );
}

function TabLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="pb-2 text-sm hover:opacity-100 opacity-80">{label}</Link>;
}
