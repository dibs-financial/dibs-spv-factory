import { useLocation } from "react-router-dom";
import { Bell, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findNav } from "@/lib/navigation";

/** Page chrome: breadcrumb from the route, search, notifications and the one primary action. */
export function TopBar({ sampleData, unread }: { sampleData?: boolean; unread: number }) {
  const { pathname } = useLocation();
  const here = findNav(pathname);
  return (
    <header className="flex h-[72px] shrink-0 items-center gap-4 border-b bg-topbar px-5 lg:px-10">
      <nav aria-label="Breadcrumb" className="hidden items-center gap-2 whitespace-nowrap text-[13px] text-muted-foreground md:flex">
        <span>{here?.group.label ?? "Settings"}</span>
        <span aria-hidden="true" className="text-subtle">/</span>
        <span aria-current="page" className="font-semibold text-foreground">{here?.item.label ?? "Settings"}</span>
      </nav>

      <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md border bg-card px-3.5 text-subtle focus-within:ring-2 focus-within:ring-ring md:ml-4 md:max-w-[380px]">
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <label htmlFor="global-search" className="sr-only">Search series, investors, ledger entries</label>
        <input
          id="global-search"
          type="search"
          placeholder="Search series, investors, ledger entries"
          className="min-w-0 grow bg-transparent text-sm text-foreground outline-none placeholder:text-subtle focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        {sampleData && (
          <span className="hidden h-7 items-center rounded-full bg-warning-tint px-3 text-xs font-medium text-warning sm:flex">
            Sample data
          </span>
        )}
        <Button variant="secondary" size="icon" aria-label={`Notifications, ${unread} unread`} className="relative">
          <Bell strokeWidth={1.7} />
          {unread > 0 && (
            <span aria-hidden="true" className="absolute right-2.5 top-2.5 size-2 rounded-full bg-critical ring-2 ring-card" />
          )}
        </Button>
        <Button size="lg" className="hidden h-11 sm:inline-flex">
          <Plus strokeWidth={2} />
          New series
        </Button>
      </div>
    </header>
  );
}
