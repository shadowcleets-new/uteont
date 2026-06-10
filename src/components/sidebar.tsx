"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AGENTS } from "@/lib/agents/registry";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/logout/actions";
import { SiteSelector } from "@/components/site-selector";

interface NavItem {
  label: string;
  href: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: "OVERVIEW",
    items: [
      { label: "Dashboard", href: "/" },
      { label: "Sites", href: "/sites" },
      { label: "Targets", href: "/targets" },
      { label: "Approvals", href: "/approvals" },
      { label: "Director (Chat)", href: "/chat" },
    ],
  },
  {
    title: "AGENTS",
    items: AGENTS.map((a) => ({
      label: a.sidebarLabel,
      href: `/agents/${a.key}`,
    })),
  },
  {
    title: "DATA",
    items: [
      { label: "Keywords", href: "/keywords" },
      { label: "Exclusions", href: "/exclusions" },
      { label: "Ideas", href: "/ideas" },
      { label: "Articles", href: "/articles" },
      { label: "Runs", href: "/runs" },
      { label: "Decisions", href: "/decisions" },
      { label: "Export", href: "/export" },
    ],
  },
  {
    title: "SETTINGS",
    items: [{ label: "Settings", href: "/settings" }],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[260px] shrink-0 bg-[#f3f1ea] border-r border-[#e8e6dc] h-screen overflow-y-auto sticky top-0 flex flex-col">
      <div className="px-5 pt-6 pb-4">
        <Link
          href="/"
          className="text-[20px] font-semibold text-[#141413] tracking-tight"
        >
          UTEONT
        </Link>
      </div>

      <nav className="py-2 flex-1">
        <SiteSelector />
        {SECTIONS.map((section, idx) => (
          <div key={section.title} className={cn(idx > 0 && "mt-6")}>
            <div className="px-5 py-1 text-[10px] font-bold tracking-wider text-[#9a988e]">
              {section.title}
            </div>
            <ul>
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "block px-5 py-2 text-[13px] text-[#141413] transition-colors",
                        "hover:bg-[#ece9e0]",
                        active &&
                          "bg-[#e8e6dc] border-l-[3px] border-[#d97757] pl-[17px]",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[#e8e6dc] px-5 py-4">
        <form action={signOutAction}>
          <button
            type="submit"
            className="text-[12px] text-[#6b6a64] hover:text-[#a33b2b] transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
