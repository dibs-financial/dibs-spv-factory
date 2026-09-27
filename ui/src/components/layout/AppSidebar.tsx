import { NavLink } from "react-router-dom";
import { Check, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { NAV_GROUPS, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-3 px-1.5">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true" className="shrink-0">
        <rect x="3" y="3" width="26" height="26" rx="6" className="stroke-brass" strokeWidth="1.5" />
        <path d="M10 11h12M10 16h12M10 21h7" className="stroke-sidebar-primary" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {!collapsed && (
        <div className="flex flex-col leading-tight">
          <span className="font-display text-xl font-semibold tracking-[0.01em] text-sidebar-primary">DIBS</span>
          <span className="text-[11px] uppercase tracking-[0.14em] text-sidebar-muted">SPV Factory</span>
        </div>
      )}
    </div>
  );
}

function CountBadge({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  if (item.count === undefined) return null;
  if (collapsed) {
    if (!item.urgent) return null;
    return (
      <span
        aria-hidden="true"
        className="absolute right-2.5 top-2 size-2 rounded-full bg-[hsl(358_75%_59%)] ring-2 ring-sidebar"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-5 min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
        item.urgent ? "bg-critical text-white" : "bg-sidebar-border text-sidebar-foreground",
      )}
    >
      {item.count}
    </span>
  );
}

/**
 * Primary navigation: grouped, collapsible to a 80px icon rail (labels become
 * tooltips), counts on items that need them. The active page gets the
 * raised fill; a brass dot marks it when it has no count.
 */
export function AppSidebar({
  collapsed,
  onToggle,
  masterEntity,
  operator,
}: {
  collapsed: boolean;
  onToggle: () => void;
  masterEntity: { name: string; noticeVerified: boolean };
  operator: { name: string; initials: string; role: string };
}) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col gap-6 overflow-y-auto bg-sidebar py-6 text-sidebar-foreground transition-[width] duration-200 lg:flex",
        collapsed ? "w-20 px-4" : "w-[272px] px-[18px]",
      )}
    >
      <div className={cn("flex min-h-11 items-center gap-2", collapsed ? "flex-col" : "justify-between")}>
        <Logo collapsed={collapsed} />
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!collapsed}
          className="flex size-11 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:ring-sidebar-ring focus-visible:ring-offset-sidebar"
        >
          {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
        </button>
      </div>

      <div className="flex flex-col gap-[18px]">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            {!collapsed && (
              <span className="px-3 pb-1.5 text-[11px] uppercase tracking-[0.12em] text-sidebar-muted">{group.label}</span>
            )}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                title={collapsed ? item.label : undefined}
                aria-label={item.count !== undefined ? `${item.label}, ${item.count}` : undefined}
                className={({ isActive }) =>
                  cn(
                    "relative flex h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                    "focus-visible:ring-sidebar-ring focus-visible:ring-offset-sidebar",
                    collapsed && "justify-center",
                    isActive
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-primary",
                  )}
              >
                {({ isActive }) => (
                  <>
                    <item.icon className="size-[18px] shrink-0" strokeWidth={1.6} aria-hidden="true" />
                    {!collapsed && <span className="grow truncate">{item.label}</span>}
                    <CountBadge item={item} collapsed={collapsed} />
                    {isActive && !collapsed && item.count === undefined && (
                      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-brass" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-3">
        {!collapsed && (
          <div className="flex flex-col gap-2 rounded-md border border-sidebar-border p-3.5">
            <span className="text-[11px] uppercase tracking-[0.12em] text-sidebar-muted">Master entity</span>
            <span className="text-[13px] font-medium text-sidebar-primary">{masterEntity.name}</span>
            {masterEntity.noticeVerified
              ? (
                <span className="flex items-center gap-2 text-xs text-[hsl(152_42%_74%)]">
                  <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
                  § 18-215(b) notice verified
                </span>
              )
              : <span className="text-xs text-[hsl(4_80%_75%)]">Liability notice missing: formation blocked</span>}
          </div>
        )}
        <div className={cn("flex items-center gap-3 border-t border-sidebar-border px-1.5 pt-3", collapsed && "justify-center")}>
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-border text-xs font-semibold text-sidebar-primary"
          >
            {operator.initials}
          </span>
          {!collapsed && (
            <>
              <div className="flex min-w-0 grow flex-col">
                <span className="truncate text-[13px] text-sidebar-primary">{operator.name}</span>
                <span className="text-xs text-sidebar-muted">{operator.role}</span>
              </div>
              <NavLink
                to="/settings"
                aria-label="Settings"
                className="flex size-9 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:ring-sidebar-ring focus-visible:ring-offset-sidebar"
              >
                <Settings className="size-[18px]" strokeWidth={1.6} aria-hidden="true" />
              </NavLink>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
