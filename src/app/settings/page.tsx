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
      <section className="text-sm space-y-4">
        <p className="opacity-70">
          Configuration UI lands once each subsystem is wired. For now,
          runtime configuration lives in environment variables — see{" "}
          <code className="text-[12px]">.env.example</code>. Site profiles +
          integrations live under <Link href="/sites" className="underline">Sites</Link>.
        </p>
        <div className="rounded border border-black/10 p-4">
          <ul className="space-y-2 opacity-80">
            <li>
              <strong>DATABASE_URL</strong> — Neon Postgres connection (managed via Vercel integration)
            </li>
            <li>
              <strong>TELEGRAM_BOT_TOKEN</strong> — Set up via @BotFather, then configured here
            </li>
            <li>
              <strong>CONNECTION_ENCRYPTION_KEY</strong> — 64-hex-char AES-256 key for encrypting site_integrations.config
            </li>
            <li>
              <strong>REDDIT_CLIENT_ID / SECRET</strong> — Optional, only for Research Agent&apos;s Reddit source
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}

function TabLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="pb-2 text-sm hover:opacity-100 opacity-80">{label}</Link>;
}
