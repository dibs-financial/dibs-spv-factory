import { NavLink } from "react-router-dom";
import { CircleUser, Search, ShieldAlert, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Pipeline", to: "/pipeline", icon: Workflow },
  { label: "Alerts", to: "/alerts", icon: ShieldAlert, count: 4 },
  { label: "Search", to: "/search", icon: Search },
  { label: "Account", to: "/settings", icon: CircleUser },
];

/** Bottom navigation below the lg breakpoint, where the sidebar is hidden. Respects the home-indicator inset. */
export function MobileTabBar() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-card px-2 pb-[max(env(safe-area-inset-bottom),12px)] pt-1.5 lg:hidden"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          aria-label={tab.count ? `${tab.label}, ${tab.count} open` : undefined}
          className={({ isActive }) =>
            cn(
              "relative flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-md text-[11px]",
              isActive ? "bg-primary-tint font-semibold text-primary" : "text-muted-foreground",
            )}
        >
          <tab.icon className="size-[22px]" strokeWidth={1.7} aria-hidden="true" />
          <span>{tab.label}</span>
          {tab.count ? (
            <span
              aria-hidden="true"
              className="absolute left-[52%] top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-critical px-1 text-[10px] font-semibold text-white ring-2 ring-card"
            >
              {tab.count}
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}
