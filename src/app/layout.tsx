import type { Metadata } from "next";
import { Poppins, Lora } from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
import { Sidebar } from "@/components/sidebar";
import { Analytics } from "@vercel/analytics/next";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-lora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "UTEONT",
  description: "Multi-agent SEO orchestrator",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Show the sidebar only for authenticated requests. Unauthenticated
  // visitors hitting /login (the only public app page) see just the
  // login form on a clean background — no agent names, no nav, no
  // operational hints.
  const session = await auth();
  const isAuthed = !!session?.user;

  return (
    <html lang="en">
      <body
        className={`${poppins.variable} ${lora.variable} antialiased bg-[#faf9f5] text-[#141413]`}
        style={{ fontFamily: "var(--font-poppins), Arial, sans-serif" }}
      >
        {isAuthed ? (
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 overflow-x-hidden">{children}</main>
          </div>
        ) : (
          children
        )}
        <Analytics />
      </body>
    </html>
  );
}
