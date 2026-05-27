"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AGENTS } from "@/lib/agents/registry";
import { cn } from "@/lib/utils";

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
    items: [{ label: "Dashboard", href: "/" }],
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
      { label: "Runs", href: "/runs" },
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
    <aside className="w-[260px] shrink-0 bg-[#f3f1ea] border-r border-[#e8e6dc] h-screen overflow-y-auto sticky top-0">
      <div className="px-5 pt-6 pb-4">
        <Link
          href="/"
          className="text-[20px] font-semibold text-[#141413] tracking-tight"
        >
          UTEONT
        </Link>
      </div>

      <nav className="py-2">
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
    </aside>
  );
}
