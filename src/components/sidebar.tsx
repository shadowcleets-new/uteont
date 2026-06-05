"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  MessageSquare,
  Hash,
  Activity,
  Download,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  Bot,
  Inbox,
  Target,
  Workflow,
} from "lucide-react";
import { AGENTS } from "@/lib/agents/registry";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/logout/actions";
import { useLocalStorage } from "@/lib/hooks/use-local-storage";

type NavIcon = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
  /** Optional small numeric badge — used for the numbered agent rail. */
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: "OVERVIEW",
    items: [
      { label: "Dashboard", href: "/", icon: Home },
      { label: "Director (Chat)", href: "/chat", icon: MessageSquare },
      { label: "Pipeline", href: "/pipeline", icon: Workflow },
      { label: "Approvals", href: "/approvals", icon: Inbox },
      { label: "Targets", href: "/targets/new", icon: Target },
    ],
  },
  {
    title: "AGENTS",
    items: AGENTS.map((a, i) => ({
      label: a.sidebarLabel,
      href: `/agents/${a.key}`,
      icon: Bot,
      badge: String(i + 1),
    })),
  },
  {
    title: "DATA",
    items: [
      { label: "Keywords", href: "/keywords", icon: Hash },
      { label: "Runs", href: "/runs", icon: Activity },
      { label: "Export", href: "/export", icon: Download },
    ],
  },
  {
    title: "SETTINGS",
    items: [{ label: "Settings", href: "/settings", icon: SettingsIcon }],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useLocalStorage<boolean>(
    "ui.sidebarCollapsed",
    false,
  );

  // Cmd+\ / Ctrl+\ to toggle. We attach once and clean up on unmount.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "\\" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCollapsed((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCollapsed]);

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "shrink-0 bg-[#f3f1ea] border-r border-[#e8e6dc] h-screen overflow-y-auto sticky top-0 flex flex-col",
        "transition-all duration-300 ease-in-out",
        collapsed ? "w-16 px-2" : "w-64 px-4",
      )}
    >
      <div
        className={cn(
          "pt-6 pb-4 flex items-center",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {!collapsed && (
          <Link
            href="/"
            className="text-[20px] font-semibold text-[#141413] tracking-tight"
          >
            UTEONT
          </Link>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={`${collapsed ? "Expand" : "Collapse"} sidebar  ·  Ctrl + \\`}
          className={cn(
            "rounded-md p-1.5 text-[#6b6a64] hover:bg-[#e8e6dc] hover:text-[#141413]",
            "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d97757]",
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronLeft className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>

      <nav className="py-2 flex-1">
        {SECTIONS.map((section, idx) => (
          <div key={section.title} className={cn(idx > 0 && "mt-6")}>
            {!collapsed && (
              <div className="px-3 py-1 text-[10px] font-bold tracking-wider text-[#9a988e]">
                {section.title}
              </div>
            )}
            {collapsed && idx > 0 && (
              <div
                aria-hidden
                className="mx-2 mb-2 border-t border-[#e8e6dc]"
              />
            )}
            <ul>
              {section.items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      className={cn(
                        "group flex items-center text-[13px] text-[#141413] transition-colors",
                        "hover:bg-[#ece9e0]",
                        collapsed
                          ? "justify-center rounded-md px-2 py-2"
                          : "gap-2.5 px-3 py-2",
                        active &&
                          (collapsed
                            ? "bg-[#e8e6dc]"
                            : "bg-[#e8e6dc] border-l-[3px] border-[#d97757] pl-[9px]"),
                      )}
                    >
                      <span
                        className={cn(
                          "relative flex items-center justify-center text-[#6b6a64] group-hover:text-[#141413]",
                          active && "text-[#141413]",
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                        {item.badge && (
                          <span
                            aria-hidden
                            className={cn(
                              "absolute -bottom-1 -right-1 inline-flex h-[12px] w-[12px] items-center justify-center rounded-full",
                              "bg-[#f3f1ea] text-[8px] font-bold text-[#6b6a64] ring-1 ring-[#e8e6dc] tabular-nums",
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </span>
                      {!collapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div
        className={cn(
          "border-t border-[#e8e6dc] py-4",
          collapsed ? "px-1 flex justify-center" : "px-3",
        )}
      >
        <form action={signOutAction}>
          <button
            type="submit"
            title={collapsed ? "Sign out" : undefined}
            aria-label="Sign out"
            className="text-[12px] text-[#6b6a64] hover:text-[#a33b2b] transition-colors"
          >
            {collapsed ? "↩" : "Sign out"}
          </button>
        </form>
      </div>
    </aside>
  );
}
